// Marketplace feed — LIVE (pending) slips only, PROOF only. Finished/passed
// slips (win/loss/void) are NOT shown on the home feed — they live on the
// channel pages (/api/tipster/[slug]/slips). Ordered by the tipster's recent
// form: slips from tipsters with the most wins in their last 5 settled slips
// appear first (tie-broken by newest). The booking code / site / picks are
// never in this response (secrets live in betslip_secrets / betslip_legs);
// buyers fetch them post-purchase via /api/slips/[id]/reveal.
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { fetchHiddenSlipIds } from '@/lib/slipStatus'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const db = supabaseServer()

  // Explicit, secret-free column list: never select booking_code / betting_site
  // / slip_image_url (those live in betslip_secrets) and never join betslip_legs
  // here — picks/matches must stay paywalled for unpurchased pending coded slips.
  const { data: slips, error } = await db
    .from('betslips')
    .select('id, tipster_id, posting_mode, total_odds, leg_count, game_count, leagues, markets, earliest_kickoff, verification_status, result, slip_price, posted_at, tipsters ( id, name, username )')
    // LIVE only — finished/passed slips (win/loss/void) belong on channel pages.
    .eq('result', 'pending')
    .order('posted_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ slips: [] })

  const hidden = await fetchHiddenSlipIds(db)   // admin-hidden slips (best-effort)
  const live = (slips ?? []).filter((s: any) => !hidden.has(s.id))   // except admin-hidden

  // Recent form per tipster: wins in their last 5 settled slips
  // (tipster_stats.last5 = e.g. "W,W,L,L,W"). Used to order the feed.
  const ids = Array.from(new Set(live.map((s: any) => s.tipster_id).filter(Boolean)))
  const winsByTipster = new Map<string, number>()
  if (ids.length) {
    const { data: stats } = await db.from('tipster_stats').select('id, last5').in('id', ids)
    for (const t of stats ?? []) {
      const wins = String(t.last5 ?? '').split(',').filter((x: string) => x.trim().toUpperCase() === 'W').length
      winsByTipster.set(t.id, wins)
    }
  }

  const formatted = live
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
    // Most wins in last 5 settled first; newest breaks ties.
    .sort((a: any, b: any) => {
      const wa = winsByTipster.get(a.slip.tipster_id) ?? 0
      const wb = winsByTipster.get(b.slip.tipster_id) ?? 0
      if (wb !== wa) return wb - wa
      return new Date(b.slip.posted_at).getTime() - new Date(a.slip.posted_at).getTime()
    })

  // no-store: the feed is live (new slips, hides, results change constantly).
  // Without it clients heuristically cache the response and show a stale feed.
  return NextResponse.json(
    { slips: formatted },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
