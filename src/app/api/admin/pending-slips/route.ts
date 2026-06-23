import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Returns slips still awaiting settlement (result is pending or null),
// with legs + tipster name, for the admin settlement hub.
export async function GET(_req: NextRequest) {
  const db = supabaseServer()

  // Pull recent slips, then filter in JS so settled ones (win/loss/void)
  // are unambiguously excluded — avoids any .or() filter quirks.
  const { data: slips, error } = await db
    .from('betslips')
    .select('*, betslip_legs(*), tipsters(name, username)')
    .order('posted_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ slips: [], error: error.message }, { status: 500 })
  }

  const pendingOnly = (slips ?? []).filter((s: any) => {
    const r = (s.result ?? 'pending')
    return r === 'pending' || r === null
  })

  const formatted = pendingOnly.map((s: any) => ({
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
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    },
  })
}