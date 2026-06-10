import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

export async function GET(_: Request, { params }: { params: { slug: string } }) {
  const db = supabaseServer()
  const id = params.slug

  const [slipsRes, purchasesRes, earningsRes, rankRes] = await Promise.all([
    db.from('betslips').select('id, result, total_odds, posted_at').eq('tipster_id', id),
    db.from('slip_purchases').select('user_phone').eq('tipster_id', id),
    db.from('earnings').select('amount').eq('tipster_id', id),
    db.from('tipster_stats').select('id').order('subscriber_count', { ascending: false }),
  ])

  const slips = slipsRes.data ?? []
  const since28 = new Date(Date.now() - 28*24*60*60*1000).toISOString()
  const recent = slips.filter(s => s.posted_at >= since28)
  const wins = recent.filter(s => s.result === 'win').length
  const settled = recent.filter(s => s.result === 'win' || s.result === 'loss')
  const avgOdds = settled.length > 0
    ? settled.reduce((a,s) => a + (parseFloat(s.total_odds)||0), 0) / settled.length
    : 0
  const buyers = new Set((purchasesRes.data??[]).map((p:any) => p.user_phone)).size
  const rankList = rankRes.data ?? []
  const rank = rankList.findIndex((r:any) => r.id === id) + 1

  return NextResponse.json({ stats: {
    subscriber_count: buyers,
    wins_last_10: wins,
    avg_odds: Math.round(avgOdds * 100) / 100,
    rank,
    slips_posted: slips.length,
    total_earned: (earningsRes.data??[]).reduce((a:number,e:any) => a + (e.amount||0), 0),
  }})
}