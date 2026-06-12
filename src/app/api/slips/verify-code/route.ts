// ── POST /api/slips/verify-code ───────────────────────────────────
// Admin-triggered. Calls the headless-Chrome bet-code worker to load a
// booking code on its bookie and scrape the selected matches, then
// records the result in `slip_verifications` for verification.
//
// The worker (see /bet-code-worker) is a separate Docker service:
//   BET_CODE_WORKER_URL  e.g. http://bet-code-worker:8080
//   BET_CODE_WORKER_KEY  shared secret (sent as x-worker-key)

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAdminToken } from '@/lib/adminAuth'
import { supabaseServer } from '@/lib/supabase'

const schema = z.object({
  betting_site: z.string().min(1),
  booking_code: z.string().min(1),
  betslip_id:   z.string().uuid().optional(),
})

export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const { betting_site, booking_code, betslip_id } = parsed.data

  const base = process.env.BET_CODE_WORKER_URL
  if (!base) return NextResponse.json({ error: 'Bet-code worker not configured' }, { status: 503 })

  // Call the worker.
  let result: any
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/verify`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-key': process.env.BET_CODE_WORKER_KEY ?? '' },
      body:    JSON.stringify({ betting_site, booking_code }),
      // Scraping can take a while; allow up to ~60s.
      signal:  AbortSignal.timeout(60_000),
    })
    result = await r.json()
  } catch (e: any) {
    return NextResponse.json({ error: `Worker unreachable: ${e?.message ?? 'error'}` }, { status: 502 })
  }

  // Persist the result (service role — slip_verifications is service-only).
  const db = supabaseServer()
  await db.from('slip_verifications').insert({
    betslip_id:   betslip_id ?? null,
    betting_site,
    booking_code,
    matches:      result?.matches ?? [],
    raw_text:     result?.raw_text ?? '',
    match_count:  result?.count ?? (result?.matches?.length ?? 0),
    found:        result?.found ?? false,
    status:         result?.ok ? 'scraped' : 'failed',
    error:          result?.ok ? null : (result?.error ?? 'scrape failed'),
    screenshot_url: result?.screenshot_url ?? null,
  })

  return NextResponse.json({
    ok:             !!result?.ok,
    matches:        result?.matches ?? [],
    raw_text:       result?.raw_text ?? '',
    count:          result?.count ?? 0,
    found:          result?.found ?? false,
    screenshot_url: result?.screenshot_url ?? null,
    error:          result?.error,
  })
}
