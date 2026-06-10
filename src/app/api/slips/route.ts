import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

export async function GET() {
  const db = supabaseServer()

  const { data: slips, error } = await db
    .from('betslips')
    .select(`*, tipsters ( id, name, username )`)
    .order('posted_at', { ascending: false })

  if (error) return NextResponse.json({ slips: [] })

  const formatted = (slips ?? []).map((s: any) => ({
    slip: {
      ...s,
      tipsters:   undefined,
      total_odds: s.total_odds ?? 1,
      leg_count:  s.leg_count  ?? 0,
      legs:       s.legs       ?? [],
      slip_price: s.slip_price ?? 1000,
      posted_at:  s.posted_at  ?? s.created_at,
    },
    tipsterName:     s.tipsters?.name     ?? 'Unknown',
    tipsterUsername: s.tipsters?.username ?? 'unknown',
  }))

  return NextResponse.json({ slips: formatted })
}