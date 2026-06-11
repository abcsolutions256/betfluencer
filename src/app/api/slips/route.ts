import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { paidSlipIds, gateSlip } from '@/lib/entitlement'

export async function GET(req: Request) {
  const db    = supabaseServer()
  const buyer = new URL(req.url).searchParams.get('buyer')

  const { data: slips, error } = await db
    .from('betslips')
    .select(`*, tipsters ( id, name, username )`)
    .order('posted_at', { ascending: false })

  if (error) return NextResponse.json({ slips: [] })

  // Which of these slips the buyer has paid for (keeps their picks).
  const paid = await paidSlipIds(buyer, (slips ?? []).map((s: any) => s.id))

  const formatted = (slips ?? []).map((s: any) => ({
    slip: gateSlip({
      ...s,
      tipsters:   undefined,
      total_odds: s.total_odds ?? 1,
      leg_count:  s.leg_count  ?? 0,
      legs:       s.legs       ?? [],
      slip_price: s.slip_price ?? 1000,
      posted_at:  s.posted_at  ?? s.created_at,
    }, paid.has(s.id)),
    tipsterName:     s.tipsters?.name     ?? 'Unknown',
    tipsterUsername: s.tipsters?.username ?? 'unknown',
  }))

  return NextResponse.json({ slips: formatted })
}
