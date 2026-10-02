// ── GET /api/slips/[id]/reveal ────────────────────────────────────
// The unlock. Finished slips (win/loss) are free → content returned to anyone.
// Pending slips: gated by market. While a market has payments PAUSED
// (`payments_enabled=false`, the open-beta default — migration 0014), pending
// content is FREE and PUBLIC to everyone. When payments are on, content is
// returned ONLY to a buyer with an active purchase (identified by the PHONE
// they paid with, `x-buyer-phone` / `?buyer=`) OR the owning tipster (session).
// The secret lives in betslip_secrets (service-role only) + betslip_legs +
// slip_verifications — never in a list. RLS on betslip_secrets stays closed;
// de-paywalling happens only here, coupled to payments_enabled, so flipping
// payments back on restores the paywall with no code change.
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { buyerFromRequest } from '@/lib/buyer'
import { getActiveCountry } from '@/lib/country'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const db = supabaseServer()
  const slipId = params.id

  const { data: slip } = await db.from('betslips').select('tipster_id, result').eq('id', slipId).single()
  if (!slip) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const finished = slip.result === 'win' || slip.result === 'loss'

  // Open beta: when the active market isn't charging, pending picks are public.
  const country  = await getActiveCountry(req)
  const freeMode = !country.payments_enabled

  if (!finished && !freeMode) {
    const buyer = buyerFromRequest(req)

    let purchased = false
    if (buyer) {
      const { data: purchase } = await db
        .from('slip_purchases').select('id')
        .eq('betslip_id', slipId).eq('user_phone', buyer).eq('status', 'active').maybeSingle()
      purchased = !!purchase
    }

    // Owning tipster (logged in) can always view their own slip — session.sub
    // IS the tipster id.
    let owner = false
    if (!purchased) {
      const user = await getSessionUser()
      owner = !!user && user.role === 'tipster' && user.id === slip.tipster_id
    }
    if (!purchased && !owner) return NextResponse.json({ error: 'Not purchased' }, { status: 403 })
  }

  const [{ data: secret }, { data: legs }, { data: verif }] = await Promise.all([
    db.from('betslip_secrets').select('booking_code, betting_site, slip_image_url').eq('betslip_id', slipId).maybeSingle(),
    db.from('betslip_legs').select('match, league, pick, odds, match_time, result').eq('betslip_id', slipId),
    db.from('slip_verifications').select('matches, raw_text, normalized, summary, total_odds').eq('betslip_id', slipId).maybeSingle(),
  ])

  return NextResponse.json({
    booking_code:   secret?.booking_code   ?? null,
    betting_site:   secret?.betting_site   ?? null,
    slip_image_url: secret?.slip_image_url ?? null,
    legs:           legs ?? [],
    matches:        verif?.matches ?? [],
    // Gemini-normalised picks (team, market, 1/X/2, kickoff, odds) + summary —
    // the clean, structured version of what the buyer just unlocked.
    normalized:     verif?.normalized ?? [],
    summary:        verif?.summary    ?? null,
    total_odds:     verif?.total_odds ?? null,
  })
}
