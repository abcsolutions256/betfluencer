import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { requireRole } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Returns slips still awaiting settlement (result is pending or null), with
// legs + tipster name, for the admin settlement hub (main feature, re-guarded
// onto Supabase Auth in the stag merge). Admin-only via requireRole('admin');
// runs under the service role so it can read betslip_secrets (booking_code /
// betting_site moved off betslips into betslip_secrets by migration 0005).
export async function GET(_req: NextRequest) {
  if (!(await requireRole('admin'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = supabaseServer()

  // Pull recent slips, then filter in JS so settled ones (win/loss/void)
  // are unambiguously excluded — avoids any .or() filter quirks.
  const { data: slips, error } = await db
    .from('betslips')
    .select('*, betslip_legs(*), betslip_secrets(booking_code, betting_site), tipsters(name, username)')
    .order('posted_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ slips: [], error: error.message }, { status: 500 })
  }

  const pendingOnly = (slips ?? []).filter((s: any) => {
    const r = (s.result ?? 'pending')
    return r === 'pending' || r === null
  })

  const formatted = pendingOnly.map((s: any) => {
    // betslip_secrets is one-to-one (betslip_id PK); PostgREST may embed it as
    // an object or a single-element array — handle both.
    const sec = Array.isArray(s.betslip_secrets) ? s.betslip_secrets[0] : s.betslip_secrets
    return {
      id:           s.id,
      betting_site: sec?.betting_site ?? s.betting_site ?? null,
      booking_code: sec?.booking_code ?? s.booking_code ?? null,
      posting_mode: s.posting_mode,
      total_odds:   s.total_odds ?? 0,
      leg_count:    s.leg_count ?? s.betslip_legs?.length ?? 0,
      slip_price:   s.slip_price ?? 0,
      posted_at:    s.posted_at,
      tipster_name: s.tipsters?.name ?? 'Unknown',
      legs:         s.betslip_legs ?? [],
    }
  })

  return NextResponse.json({ slips: formatted }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    },
  })
}