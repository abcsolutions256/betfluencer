// ── POST /api/slips/sync-codes ────────────────────────────────────
// Internal poller endpoint (called by the `sync` container on an
// interval). Re-verifies every pending booking-code slip against its
// bookie via the worker and upserts the match details into
// slip_verifications — so the app stays in sync with the betting sites.
//
// Auth: header `x-sync-token: <SYNC_TOKEN>`.
//
// Set SYNC_CODES_ENABLED=false to turn this OFF — the bookie scraper gets
// blocked from datacenter IPs, so in production we disable it here and run the
// code-sync from a LOCAL stack (residential IP) against the same database.
// Default (unset) = enabled. (Payment reconciliation is unaffected — it talks
// to ioTec, not the bookie, so it keeps running in production.)

import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { verifyAndRecord } from '@/lib/verifyCode'

async function handler(req: NextRequest) {
  const token = req.headers.get('x-sync-token') ?? ''
  if (!process.env.SYNC_TOKEN || token !== process.env.SYNC_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (process.env.SYNC_CODES_ENABLED === 'false') {
    return NextResponse.json({ ok: true, disabled: true, processed: 0, found: 0 })
  }

  const db    = supabaseServer()
  const batch = Number(process.env.SYNC_BATCH ?? 20)

  // The booking code + site live in betslip_secrets (service-role only) — NOT
  // on betslips (the overhaul moved them). Join betslips to re-verify only
  // slips whose match hasn't finished yet (result 'pending'): the live,
  // verifiable product. This keeps verified slips fresh and recovers any that
  // are still 'pending' (e.g. the worker was down when first posted).
  const { data: rows } = await db
    .from('betslip_secrets')
    .select('betslip_id, betting_site, booking_code, betslips!inner(result)')
    .not('booking_code', 'is', null)
    .neq('booking_code', '')
    .eq('betslips.result', 'pending')
    .limit(batch)

  let processed = 0, found = 0
  for (const s of rows ?? []) {
    if (!s.betting_site || !s.booking_code) continue
    const r = await verifyAndRecord(s.betslip_id, s.betting_site, s.booking_code)
    processed++
    if (r?.found) found++
  }

  return NextResponse.json({ ok: true, processed, found })
}

export const POST = handler
export const GET  = handler   // convenience for a plain curl
