// ── POST /api/slips/sync-codes ────────────────────────────────────
// Internal poller endpoint (called by the `sync` container on an
// interval). Re-verifies every pending booking-code slip against its
// bookie via the worker and upserts the match details into
// slip_verifications — so the app stays in sync with the betting sites.
//
// Auth: header `x-sync-token: <SYNC_TOKEN>`.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { verifyAndRecord } from '@/lib/verifyCode'

async function handler(req: NextRequest) {
  const token = req.headers.get('x-sync-token') ?? ''
  if (!process.env.SYNC_TOKEN || token !== process.env.SYNC_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db    = supabaseServer()
  const batch = Number(process.env.SYNC_BATCH ?? 20)

  // Pending slips that carry a booking code are the live, verifiable product.
  const { data: slips } = await db
    .from('betslips')
    .select('id, betting_site, booking_code')
    .not('booking_code', 'is', null)
    .neq('booking_code', '')
    .eq('result', 'pending')
    .order('posted_at', { ascending: false })
    .limit(batch)

  let processed = 0, found = 0
  for (const s of slips ?? []) {
    if (!s.betting_site || !s.booking_code) continue
    const r = await verifyAndRecord(s.id, s.betting_site, s.booking_code)
    processed++
    if (r?.found) found++
  }

  return NextResponse.json({ ok: true, processed, found })
}

export const POST = handler
export const GET  = handler   // convenience for a plain curl
