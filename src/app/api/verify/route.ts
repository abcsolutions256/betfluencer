//── Auto-verification endpoint ────────────────────────────────────────
// Settles finished slips + their individual legs from the football API.
// Triggered by: the Docker `sync` container (header x-sync-token), the admin
// "auto-verify" button (admin session), or a Vercel cron (Authorization:
// Bearer CRON_SECRET). Quota-aware: one fixtures-per-date request is shared
// across all legs in a run (FixtureCache). Slips it can't grade are flagged
// result_proof_pending for manual admin settlement (/api/admin/settle).
import { NextRequest, NextResponse } from 'next/server'
import { verifySlip, calcSlipResult, type FixtureCache } from '@/lib/footballApi'
import { requireRole } from '@/lib/auth/session'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function authorized(req: NextRequest): Promise<boolean> {
  const token = req.headers.get('x-sync-token') ?? ''
  if (process.env.SYNC_TOKEN && token === process.env.SYNC_TOKEN) return true
  const auth = req.headers.get('authorization') ?? ''
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true
  if (await requireRole('admin')) return true            // admin "auto-verify" button
  return false
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = supabaseServer()

  // All pending slips (any posting mode) with their legs.
  const { data: pendingSlips } = await db
    .from('betslips')
    .select('*, betslip_legs(*)')
    .in('posting_mode', ['manual', 'screenshot', 'booking_code'])
    .eq('result', 'pending')

  if (!pendingSlips?.length) return NextResponse.json({ verified: 0, review: 0, total: 0, apiRequests: 0 })

  const cache: FixtureCache = new Map()   // one fetch per date, shared across all slips/legs
  let verifiedCount = 0
  let reviewCount = 0

  for (const slip of pendingSlips) {
    const legs = slip.betslip_legs ?? []
    if (!legs.length) continue   // coded slip not yet scraped into legs → skip

    // Only settle once every match has had time to finish (3h buffer past the
    // latest kickoff; fall back to posted_at when legs carry no kickoff).
    const matchTimes = legs
      .map((l: any) => new Date(l.match_time).getTime())
      .filter((t: number) => !isNaN(t))
    const cutoff = matchTimes.length ? Math.max(...matchTimes) : new Date(slip.posted_at).getTime()
    if (cutoff > Date.now() - 3 * 60 * 60 * 1000) continue

    const legResults = await verifySlip(legs, cache)

    // Per-leg: persist a newly-resolved fixture_id (so future runs settle by
    // ID — cheap + works past the date window) and the decisive win/loss.
    for (const lr of legResults) {
      const leg = legs.find((l: any) => l.id === lr.id)
      const patch: { fixture_id?: number; result?: 'win' | 'loss' } = {}
      if (lr.fixtureId && leg && !leg.fixture_id) patch.fixture_id = lr.fixtureId
      if (lr.result === 'win' || lr.result === 'loss') patch.result = lr.result
      if (Object.keys(patch).length) await db.from('betslip_legs').update(patch).eq('id', lr.id)
    }

    const slipResult = calcSlipResult(legResults.map(r => r.result))
    if (slipResult === 'pending') continue

    if (slipResult === 'unverifiable') {
      // Couldn't grade every leg → leave pending and flag for manual admin
      // settlement (the manual result is authoritative if the auto path fails).
      await db.from('betslips').update({ result_proof_pending: true }).eq('id', slip.id)
      reviewCount++
    } else {
      await db.from('betslips').update({ result: slipResult, result_proof_pending: false, settled_at: new Date().toISOString() }).eq('id', slip.id)
      verifiedCount++
    }
  }

  return NextResponse.json({
    verified: verifiedCount,
    review:   reviewCount,
    total:    pendingSlips.length,
    apiRequests: cache.size,
  })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'POST (x-sync-token / admin session / Bearer CRON_SECRET) to settle finished slips',
  })
}
