// ── GET /api/slips/[id]/reveal ────────────────────────────────────
// The bulletproof unlock. Finished slips (win/loss) are free → content
// returned to anyone. Pending slips: content returned ONLY to a logged-in
// user with an active purchase (or the owning tipster). The secret lives
// in betslip_secrets (service-role only) + betslip_legs + slip_verifications
// — never in a public list response.
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const db = supabaseServer()
  const slipId = params.id

  const { data: slip } = await db.from('betslips').select('tipster_id, result').eq('id', slipId).single()
  if (!slip) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const finished = slip.result === 'win' || slip.result === 'loss'

  if (!finished) {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Login required' }, { status: 401 })

    const { data: purchase } = await db
      .from('slip_purchases').select('id')
      .eq('betslip_id', slipId).eq('buyer_id', user.id).eq('status', 'active').maybeSingle()

    let owner = false
    if (!purchase) {
      const { data: t } = await db.from('tipsters').select('id').eq('id', slip.tipster_id).eq('profile_id', user.id).maybeSingle()
      owner = !!t
    }
    if (!purchase && !owner) return NextResponse.json({ error: 'Not purchased' }, { status: 403 })
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
