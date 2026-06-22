// ── Booking-code verification ─────────────────────────────────────
// Bridges the betfluencer app and the headless-Chrome bet-code worker.
// callWorker() scrapes a code; recordVerification() upserts the result
// into slip_verifications (one current row per betslip). Used by:
//   • /api/slips/verify-code  (admin, manual)
//   • /api/tips               (auto-trigger when a coded slip is posted)
//   • /api/slips/sync-codes   (poller — keeps every coded slip fresh)

import { supabaseServer } from './supabase'

const uniq = (arr: any[]) => Array.from(new Set(arr.filter(Boolean)))

export interface NormalizedLeg {
  teams?: string
  homeTeam?: string
  awayTeam?: string
  market?: string        // canonical: 1X2 | DC | OU | BTTS | DNB | AH | EH | CS | OTHER
  marketLabel?: string
  pickSymbol?: string     // 1 / X / 2 / "Over 2.5" / Yes …
  pickSide?: string       // home | away | draw | n/a
  pickTeam?: string | null
  line?: string | null
  odds?: string | null
  kickoff?: string | null // ISO-8601 (EAT)
  kickoffRaw?: string | null
  summary?: string
}

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
  // Added by the worker's Gemini normaliser (present when GEMINI_API_KEY is
  // set on the worker and the code is valid). Best-effort — may be absent.
  normalized?: NormalizedLeg[]
  summary?: string
  total_odds?: string | number | null
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
  const result     = args.result
  const rawMatches = (result?.matches ?? []) as any[]
  const normalized = (Array.isArray(result?.normalized) ? result!.normalized : []) as NormalizedLeg[]
  // total_odds may arrive as "3.48" or 3.48 — coerce to a number, or null.
  const totalOdds  = (() => {
    const v = result?.total_odds
    const n = typeof v === 'number' ? v : v ? Number(String(v).replace(/[^\d.]/g, '')) : NaN
    return Number.isFinite(n) ? n : null
  })()

  const row = {
    betslip_id:     args.betslip_id ?? null,
    betting_site:   args.betting_site,
    booking_code:   args.booking_code,
    matches:        rawMatches,
    normalized,                                  // the Gemini-normalised legs (secret)
    summary:        result?.summary ?? null,
    total_odds:     totalOdds,
    raw_text:       result?.raw_text ?? '',
    match_count:    result?.count ?? rawMatches.length,
    found:          result?.found ?? false,
    status:         result?.ok ? 'scraped' : 'failed',
    error:          result?.ok ? null : (result?.error ?? 'scrape failed'),
    screenshot_url: result?.screenshot_url ?? null,
    scraped_at:     new Date().toISOString(),
  }
  if (args.betslip_id) {
    await db.from('slip_verifications').upsert(row, { onConflict: 'betslip_id' })
  } else {
    await db.from('slip_verifications').insert(row)
  }

  // Reflect onto the betslip. Found selections → 'verified' + public PROOF,
  // derived from the normalised legs when present (canonical markets, ISO
  // kickoffs, total odds); leagues come from the raw matches (the normaliser
  // doesn't carry league). Worker ran but found NOTHING → invalid code →
  // 'failed' (only flip rows still 'pending'). Worker errored / unreachable
  // → change nothing, leaving the slip 'pending' for the poller to retry.
  // Never un-verify an already-verified slip.
  if (args.betslip_id) {
    if (result?.found && rawMatches.length) {
      const useNorm    = normalized.length > 0
      const game_count = useNorm ? normalized.length : rawMatches.length
      const markets    = uniq(useNorm ? normalized.map(n => n.market) : rawMatches.map(m => m?.market))
      const leagues    = uniq(rawMatches.map(m => m?.league))
      const kicks      = (useNorm ? normalized.map(n => n.kickoff) : rawMatches.map(m => m?.kickoff))
        .map(k => Date.parse(k as string)).filter(n => !Number.isNaN(n))
      await db.from('betslips').update({
        verification_status: 'verified',
        verified_at:         new Date().toISOString(),
        game_count,
        leagues, markets,
        earliest_kickoff:    kicks.length ? new Date(Math.min(...kicks)).toISOString() : null,
        ...(totalOdds != null ? { total_odds: totalOdds } : {}),   // odds are public proof, not a secret
      }).eq('id', args.betslip_id)
    } else if (result?.ok) {
      await db.from('betslips').update({ verification_status: 'failed' })
        .eq('id', args.betslip_id)
        .eq('verification_status', 'pending')
    }
  }

  return row
}

// Scrape + persist in one call.
export async function verifyAndRecord(betslip_id: string | null, betting_site: string, booking_code: string) {
  const result = await callWorker(betting_site, booking_code)
  await recordVerification({ betslip_id, betting_site, booking_code, result })
  return result
}
