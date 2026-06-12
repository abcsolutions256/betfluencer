// ── Booking-code verification ─────────────────────────────────────
// Bridges the betfluencer app and the headless-Chrome bet-code worker.
// callWorker() scrapes a code; recordVerification() upserts the result
// into slip_verifications (one current row per betslip). Used by:
//   • /api/slips/verify-code  (admin, manual)
//   • /api/tips               (auto-trigger when a coded slip is posted)
//   • /api/slips/sync-codes   (poller — keeps every coded slip fresh)

import { supabaseServer } from './supabase'

export interface WorkerResult {
  ok: boolean
  site?: string
  code?: string
  found?: boolean
  matches?: unknown[]
  raw_text?: string
  count?: number
  screenshot_url?: string | null
  error?: string
}

// Call the worker to load a code on its bookie and scrape the matches.
// Never throws — returns a failed-shaped result on any error.
export async function callWorker(betting_site: string, booking_code: string): Promise<WorkerResult> {
  const base = process.env.BET_CODE_WORKER_URL
  if (!base) return { ok: false, error: 'worker not configured', matches: [], raw_text: '', count: 0, found: false }
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/verify`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-key': process.env.BET_CODE_WORKER_KEY ?? '' },
      body:    JSON.stringify({ betting_site, booking_code }),
      signal:  AbortSignal.timeout(90_000), // a scrape can take a while
    })
    return (await r.json()) as WorkerResult
  } catch (e: any) {
    return { ok: false, error: `worker unreachable: ${e?.message ?? 'error'}`, matches: [], raw_text: '', count: 0, found: false }
  }
}

// Upsert the verification into slip_verifications. When a betslip_id is
// given we keep ONE current row per slip (upsert on betslip_id); manual
// one-off checks (no betslip_id) are appended.
export async function recordVerification(args: {
  betslip_id?: string | null
  betting_site: string
  booking_code: string
  result: WorkerResult
}) {
  const db = supabaseServer()
  const row = {
    betslip_id:     args.betslip_id ?? null,
    betting_site:   args.betting_site,
    booking_code:   args.booking_code,
    matches:        args.result?.matches ?? [],
    raw_text:       args.result?.raw_text ?? '',
    match_count:    args.result?.count ?? (args.result?.matches?.length ?? 0),
    found:          args.result?.found ?? false,
    status:         args.result?.ok ? 'scraped' : 'failed',
    error:          args.result?.ok ? null : (args.result?.error ?? 'scrape failed'),
    screenshot_url: args.result?.screenshot_url ?? null,
    scraped_at:     new Date().toISOString(),
  }
  if (args.betslip_id) {
    await db.from('slip_verifications').upsert(row, { onConflict: 'betslip_id' })
  } else {
    await db.from('slip_verifications').insert(row)
  }
  return row
}

// Scrape + persist in one call.
export async function verifyAndRecord(betslip_id: string | null, betting_site: string, booking_code: string) {
  const result = await callWorker(betting_site, booking_code)
  await recordVerification({ betslip_id, betting_site, booking_code, result })
  return result
}
