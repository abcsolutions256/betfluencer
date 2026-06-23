import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(_: Request, { params }: { params: { slug: string } }) {
  const db = supabaseServer()
  const id = params.slug

  // Read the SAME view every other page uses, so numbers match everywhere.
  const [statRes, purchasesRes, earningsRes, slipsRes, rankRes] = await Promise.all([
    db.from('tipster_stats').select('*').eq('id', id).maybeSingle(),
    db.from('slip_purchases').select('user_phone').eq('tipster_id', id),
    db.from('earnings').select('amount').eq('tipster_id', id),
    db.from('betslips').select('id').eq('tipster_id', id),
    db.from('tipster_stats').select('id, wins_last_10, avg_odds').order('wins_last_10', { ascending: false }),
  ])

  const stat = statRes.data ?? {}
  const buyers = new Set((purchasesRes.data ?? []).map((p: any) => p.user_phone)).size

  // Rank by the same score used on the rankings page: wins * avg_odds
  const rankList = (rankRes.data ?? [])
    .map((r: any) => ({ id: r.id, score: (r.wins_last_10 ?? 0) * (r.avg_odds || 1) }))
    .sort((a, b) => b.score - a.score)
  const rank = rankList.findIndex((r: any) => r.id === id) + 1

  return NextResponse.json(
    { stats: {
      subscriber_count: buyers,
      wins_last_10:     stat.wins_last_10 ?? 0,
      avg_odds:         stat.avg_odds ?? 0,
      rank,
      slips_posted:     (slipsRes.data ?? []).length,
      total_earned:     (earningsRes.data ?? []).reduce((a: number, e: any) => a + (e.amount || 0), 0),
    }},
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}