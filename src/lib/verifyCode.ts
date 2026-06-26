// ── Booking-code verification ─────────────────────────────────────
// Bridges the betfluencer app and the headless-Chrome bet-code worker.
// callWorker() scrapes a code; recordVerification() upserts the result
// into slip_verifications (one current row per betslip). Used by:
//   • /api/slips/verify-code  (admin, manual)
//   • /api/tips               (auto-trigger when a coded slip is posted)
//   • /api/slips/sync-codes   (poller — keeps every coded slip fresh)

import { supabaseServer } from './supabase'

const uniq = (arr: any[]) => Array.from(new Set(arr.filter(Boolean)))

// Build a `pick` string main's football-API settler (determineResult in
// src/lib/footballApi.ts) can grade, from a Gemini-normalised leg. The settler
// keyword-matches a lowercased pick (e.g. "over 2.5", "btts yes", "home win",
// "home or draw", "<team> -1", "<team> clean sheet"); canonical market codes
// alone ("OU"/"BTTS") would grade as 'unverifiable'. Unsupported markets
// (DNB/OTHER) fall through to a best-effort label → settler returns
// 'unverifiable' → routed to admin manual review. Keep in step with the
// market coverage in footballApi.ts:determineResult.
function pickForLeg(n: NormalizedLeg): string {
  const market = (n.market ?? '').toUpperCase()
  const sym    = (n.pickSymbol ?? '').toString().trim()
  const side   = (n.pickSide ?? '').toString().toLowerCase()
  const line   = (n.line ?? '').toString().trim()
  const team   = (n.pickTeam ?? '').toString().trim()
  const label  = (n.marketLabel ?? '').toString().trim()
  switch (market) {
    case 'OU': {
      const dir = /under/i.test(`${sym} ${label}`) ? 'under' : 'over'
      const ln  = line || (`${sym} ${label}`.match(/(\d+\.?\d*)/)?.[1] ?? '')
      return `${dir} ${ln}`.trim()
    }
    case 'BTTS':
      return /\b(no|not)\b/i.test(sym) ? 'btts no' : 'btts yes'
    case '1X2':
      if (side === 'home' || sym === '1') return 'home win'
      if (side === 'away' || sym === '2') return 'away win'
      if (side === 'draw' || /^x$/i.test(sym)) return 'draw'
      return (sym || label).toLowerCase()
    case 'DC': {
      const s = `${sym} ${label}`.toLowerCase().replace(/\s+/g, '')
      if (s.includes('1x')) return 'home or draw'
      if (s.includes('x2')) return 'away or draw'
      if (s.includes('12')) return 'home or away'
      return label.toLowerCase()
    }
    case 'AH':
    case 'EH': {
      const ln = line || (sym.match(/[+-]?\d+\.?\d*/)?.[0] ?? '')
      return `${team || side} ${ln}`.trim()
    }
    case 'CS':
      return `${team || side} clean sheet`.trim()
    default:
      return (label || sym || n.summary || '').toLowerCase().trim()
  }
}

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

  // Auto-derive the slip's combined odds from the scrape so the tipster never
  // has to type them: prefer the bookie's scraped total; otherwise multiply the
  // normalised leg odds (accumulator math). Saved onto the betslip below.
  const legOddsProduct = (() => {
    const o = normalized
      .map(n => (n.odds != null ? Number(String(n.odds).replace(/[^\d.]/g, '')) : NaN))
      .filter(n => Number.isFinite(n) && n > 0)
    if (o.length === 0) return null
    return Math.round(o.reduce((a, b) => a * b, 1) * 100) / 100   // 2dp
  })()
  const computedOdds = totalOdds ?? legOddsProduct

  const row = {
    betslip_id:     args.betslip_id ?? null,
    betting_site:   args.betting_site,
    booking_code:   args.booking_code,
    matches:        rawMatches,
    normalized,                                  // the Gemini-normalised legs (secret)
    summary:        result?.summary ?? null,
    total_odds:     computedOdds,
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
        ...(computedOdds != null ? { total_odds: computedOdds } : {}),   // auto-derived; public proof, not a secret
      }).eq('id', args.betslip_id)

      // ── Unified-settlement seam (merge: stag ← main) ──────────────────
      // Project the scraped legs into betslip_legs — the common match/leg
      // model main's football-API settler (/api/verify) grades — so a
      // booking-code slip settles exactly like a screenshot/manual slip.
      // Replace-then-insert keyed on betslip_id, so a re-scrape refreshes
      // them. Settlement keys on `match` ("Home vs Away"), `pick`,
      // `match_time`; per-leg `odds` is best-effort (the settler ignores it;
      // betslips.total_odds is the authoritative public figure).
      const legRows = (useNorm
        ? normalized.map((n) => {
            const homeT = (n.homeTeam ?? '').toString().trim()
            const awayT = (n.awayTeam ?? '').toString().trim()
            const match = homeT && awayT ? `${homeT} vs ${awayT}` : (n.teams ?? '').toString().trim()
            const odds  = n.odds != null ? Number(String(n.odds).replace(/[^\d.]/g, '')) : NaN
            const kk    = n.kickoff && !Number.isNaN(Date.parse(n.kickoff)) ? new Date(n.kickoff).toISOString() : null
            return { match, pick: pickForLeg(n), odds, match_time: kk }
          })
        : rawMatches.map((m: any) => {
            const homeT = (m?.homeTeam ?? m?.home ?? '').toString().trim()
            const awayT = (m?.awayTeam ?? m?.away ?? '').toString().trim()
            const match = homeT && awayT ? `${homeT} vs ${awayT}` : (m?.teams ?? m?.match ?? '').toString().trim()
            const odds  = m?.odds != null ? Number(String(m.odds).replace(/[^\d.]/g, '')) : NaN
            const kk    = (m?.kickoff ?? m?.match_time)
            const iso   = kk && !Number.isNaN(Date.parse(kk)) ? new Date(kk).toISOString() : null
            return { match, pick: (m?.pick ?? m?.marketLabel ?? '').toString().toLowerCase().trim(), odds, match_time: iso }
          })
      )
        .map((l, i) => ({
          betslip_id: args.betslip_id!,
          match:      l.match,
          league:     (rawMatches[i]?.league ?? '').toString(),   // normaliser drops league
          pick:       l.pick,
          odds:       Number.isFinite(l.odds) ? l.odds : 1,        // betslip_legs.odds is NOT NULL
          match_time: l.match_time,
          result:     'pending' as const,
        }))
        .filter((l) => l.match && l.pick)                          // settler needs both match + pick

      if (legRows.length) {
        await db.from('betslip_legs').delete().eq('betslip_id', args.betslip_id)
        const { error: legErr } = await db.from('betslip_legs').insert(legRows)
        if (legErr) console.error('[verifyCode] betslip_legs projection failed:', legErr.message)
      }
    } else if (result?.ok) {
      // Worker ran but found nothing → bad/expired code. Atomically count the
      // attempt and flip a still-'pending' slip to 'failed' (a 'failed' slip
      // stays failed but its counter climbs). Never touches verified/rejected.
      // The poller stops retrying once verify_attempts hits its budget.
      await db.rpc('record_failed_verify', { p_betslip_id: args.betslip_id })
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
