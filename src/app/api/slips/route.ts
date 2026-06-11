import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

export async function GET() {
  const db = supabaseServer()
  const { data: slips, error } = await db
    .from('betslips')
    .select(`*, tipsters ( id, name, username ), betslip_legs (*)`)
    .eq('result', 'pending')
    .order('posted_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ slips: [] })

  const formatted = (slips ?? []).map((s: any) => ({
    slip: {
      ...s,
      tipsters:      undefined,
      betslip_legs:  undefined,
      total_odds:    s.total_odds ?? 1,
      leg_count:     s.betslip_legs?.length ?? s.leg_count ?? 0,
      legs:          s.betslip_legs ?? [],
      slip_price:    s.slip_price ?? 1000,
      posted_at:     s.posted_at ?? s.created_at,
    },
    tipsterName:     s.tipsters?.name     ?? 'Unknown',
    tipsterUsername: s.tipsters?.username ?? 'unknown',
  }))

  const response = NextResponse.json({ slips: formatted })
  // Cache for 60 seconds — slips don't change that fast
  response.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate=30')
  return response
}