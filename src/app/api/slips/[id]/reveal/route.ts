// ── GET /api/slips/[id]/reveal ────────────────────────────────────
// The unlock. Finished slips (win/loss) are free → content returned to anyone.
// Pending slips: content returned ONLY to a buyer with an active purchase for
// this slip (identified by the `x-buyer-key` header / `?buyer=` — no login) OR
// the owning tipster (session). The secret lives in betslip_secrets
// (service-role only) + betslip_legs + slip_verifications — never in a list.
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const db = supabaseServer()
  const slipId = params.id

  const { data: slip } = await db.from('betslips').select('tipster_id, result').eq('id', slipId).single()
  if (!slip) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const finished = slip.result === 'win' || slip.result === 'loss'

  if (!finished) {
    const buyerKey = (req.headers.get('x-buyer-key') ?? new URL(req.url).searchParams.get('buyer') ?? '').trim()

    let purchased = false
    if (buyerKey) {
      const { data: purchase } = await db
        .from('slip_purchases').select('id')
        .eq('betslip_id', slipId).eq('buyer_key', buyerKey).eq('status', 'active').maybeSingle()
      purchased = !!purchase
    }

    // Owning tipster (logged in) can always view their own slip.
    let owner = false
    if (!purchased) {
      const user = await getSessionUser()
      if (user) {
        const { data: t } = await db.from('tipsters').select('id').eq('id', slip.tipster_id).eq('profile_id', user.id).maybeSingle()
        owner = !!t
      }
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
