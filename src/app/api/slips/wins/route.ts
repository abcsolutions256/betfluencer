// Marketplace "Wins" view — settled WINNING slips from a rolling 24-hour
// window (settled_at >= now − 24h, computed per request — nothing expires
// manually). Finished slips are free to view, so this list is proof-only just
// like the live feed: the content reveals through the existing
// /api/slips/[id]/reveal path (free for finished slips). Same pipeline as
// /api/slips: admin-hidden filter, active-market filter (UG fails open),
// NULL-safe seed exclusion (note !== '__seed__').
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { fetchHiddenSlipIds } from '@/lib/slipStatus'
import { getActiveCountry } from '@/lib/country'
import { tipsterIdsForCountry, filterByTipsterIds } from '@/lib/countryFilter'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  const db = supabaseServer()
  const country = await getActiveCountry(req)
  const marketIds = await tipsterIdsForCountry(db, country.code)

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Secret-free column list (same rule as /api/slips). `note` is selected only
  // for the seed filter and stripped before the response.
  const { data: slips, error } = await db
    .from('betslips')
    .select('id, tipster_id, posting_mode, total_odds, leg_count, game_count, leagues, markets, earliest_kickoff, verification_status, result, slip_price, posted_at, settled_at, note, tipsters ( id, name, username )')
    .eq('result', 'win')
    .gte('settled_at', since)
    .order('settled_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ slips: [] })

  const hidden = await fetchHiddenSlipIds(db)   // admin-hidden slips (best-effort)
  const wins = filterByTipsterIds(
    (slips ?? [])
      .filter((s: any) => !hidden.has(s.id))    // except admin-hidden
      .filter((s: any) => s.note !== '__seed__'), // NULL-safe seed exclusion
    marketIds,
    'tipster_id'                                 // active market only
  )

  const formatted = wins.map((s: any) => ({
    slip: {
      ...s,
      tipsters:   undefined,
      note:       undefined,
      total_odds: s.total_odds ?? 1,
      leg_count:  s.leg_count ?? s.game_count ?? 0,
      slip_price: s.slip_price ?? 1000,
      posted_at:  s.posted_at,
    },
    tipsterName:     s.tipsters?.name     ?? 'Unknown',
    tipsterUsername: s.tipsters?.username ?? 'unknown',
  }))

  return NextResponse.json(
    { slips: formatted },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
