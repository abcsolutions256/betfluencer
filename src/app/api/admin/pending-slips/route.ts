import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Returns all pending slips with legs + tipster name, for admin settlement.
export async function GET(req: NextRequest) {
  const db = supabaseServer()

  const { data: slips } = await db
    .from('betslips')
    .select('*, betslip_legs(*), tipsters(name, username)')
    .or('result.eq.pending,result.is.null')
    .order('posted_at', { ascending: false })
    .limit(100)

  const formatted = (slips ?? []).map((s: any) => ({
    id:           s.id,
    betting_site: s.betting_site,
    booking_code: s.booking_code,
    posting_mode: s.posting_mode,
    total_odds:   s.total_odds ?? 0,
    leg_count:    s.leg_count ?? s.betslip_legs?.length ?? 0,
    slip_price:   s.slip_price ?? 0,
    posted_at:    s.posted_at,
    tipster_name: s.tipsters?.name ?? 'Unknown',
    legs:         s.betslip_legs ?? [],
  }))

  return NextResponse.json({ slips: formatted }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}