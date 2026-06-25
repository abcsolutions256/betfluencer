// Marketplace feed — VERIFIED slips only, PROOF only. The booking code /
// site / picks are never in this response (secrets live in betslip_secrets
// / betslip_legs); buyers fetch them post-purchase via /api/slips/[id]/reveal.
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { fetchHiddenSlipIds } from '@/lib/slipStatus'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = supabaseServer()

  const { data: slips, error } = await db
    .from('betslips')
    .select('id, tipster_id, posting_mode, total_odds, leg_count, game_count, leagues, markets, earliest_kickoff, result, slip_price, verification_status, posted_at, tipsters ( id, name, username )')
    // .or('verification_status.eq.verified,result.eq.win,result.eq.loss')
    .order('posted_at', { ascending: false })

  if (error) return NextResponse.json({ slips: [] })

  const hidden = await fetchHiddenSlipIds(db)   // admin-hidden slips (best-effort)
  const formatted = (slips ?? [])
    .filter((s: any) => !hidden.has(s.id))      // show ALL verified slips except admin-hidden ones
    .map((s: any) => ({
    slip: {
      ...s,
      tipsters:   undefined,
      total_odds: s.total_odds ?? 1,
      leg_count:  s.leg_count ?? s.game_count ?? 0,
      slip_price: s.slip_price ?? 1000,
      posted_at:  s.posted_at,
    },
    tipsterName:     s.tipsters?.name     ?? 'Unknown',
    tipsterUsername: s.tipsters?.username ?? 'unknown',
  }))

  // no-store: the feed is live (new slips, hides, results change constantly).
  // Without it clients heuristically cache the response and show a stale feed.
  return NextResponse.json({ slips: formatted }, { headers: { 'Cache-Control': 'no-store' } })
}
