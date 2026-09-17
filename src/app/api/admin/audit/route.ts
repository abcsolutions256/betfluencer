// Admin settlement AUDIT hub. Unlike /pending-slips (only undecided slips) and
// /review (only 'unverifiable' legs), this lists slips that have ALREADY been
// settled — auto-verified or manual — so an admin can review the auto-grader's
// decisions after the fact and OVERTURN them. Every change is logged to
// betslip_settlement_audit (migration 0016).
//
//   GET  ?market=XX&result=all|win|loss|void  → recent settled slips + legs +
//        tipster + this slip's audit history.
//   POST { betslip_id, result?, leg_id?, leg_result?, note? }
//        • leg_id + leg_result → re-settle that leg, then recompute the slip
//          from all its legs (accumulator rule), audit both.
//        • result → override the slip result directly (no leg cascade), audit.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { requireRole } from '@/lib/auth/session'
import { marketFilterFromRequest, filterByTipsterIds } from '@/lib/countryFilter'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const RESULTS = ['win', 'loss', 'void', 'pending'] as const
type Result = typeof RESULTS[number]

// Accumulator: a slip loses if any leg loses; is void only if every leg voids;
// wins once every leg is decided with no loss; else stays pending. Mirrors the
// rule in /api/admin/review so leg overrides recompute consistently.
function slipResultFromLegs(legResults: (string | null)[]): Result {
  const hasLoss    = legResults.some(r => r === 'loss')
  const hasPending = legResults.some(r => !r || r === 'pending' || r === 'unverifiable')
  const allVoid    = legResults.length > 0 && legResults.every(r => r === 'void')
  return hasLoss ? 'loss' : allVoid ? 'void' : !hasPending ? 'win' : 'pending'
}

export async function GET(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseServer()
  if (!db) return NextResponse.json({ slips: [] })

  const url = new URL(req.url)
  const resultFilter = url.searchParams.get('result') ?? 'all'
  const marketIds = await marketFilterFromRequest(db, req)

  // Settled slips (decided or flagged for manual review), newest first.
  let q = db
    .from('betslips')
    .select('id, tipster_id, posting_mode, verification_status, result, result_proof_pending, total_odds, game_count, markets, settled_at, posted_at, hidden, tipsters ( name, username ), betslip_legs ( id, match, pick, odds, result, fixture_id, market, side, line )')
    .not('result', 'is', null)
    .neq('result', 'pending')
    .order('settled_at', { ascending: false, nullsFirst: false })
    .limit(120)
  if (RESULTS.includes(resultFilter as Result)) q = q.eq('result', resultFilter)
  const { data, error } = await q
  if (error) return NextResponse.json({ slips: [], error: error.message })

  const slips = filterByTipsterIds(data ?? [], marketIds, 'tipster_id')

  // Attach each slip's audit history in one query.
  const ids = slips.map((s: any) => s.id)
  let historyBySlip: Record<string, any[]> = {}
  if (ids.length) {
    const { data: hist } = await db
      .from('betslip_settlement_audit')
      .select('betslip_id, leg_id, actor, source, field, old_value, new_value, note, created_at')
      .in('betslip_id', ids)
      .order('created_at', { ascending: false })
    for (const h of hist ?? []) (historyBySlip[h.betslip_id] ??= []).push(h)
  }

  return NextResponse.json({
    slips: slips.map((s: any) => ({ ...s, audit: historyBySlip[s.id] ?? [] })),
  })
}

export async function POST(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseServer()
  if (!db) return NextResponse.json({ error: 'No DB' }, { status: 500 })

  const body = await req.json().catch(() => null)
  if (!body?.betslip_id) return NextResponse.json({ error: 'betslip_id required' }, { status: 400 })
  const { betslip_id, leg_id, leg_result, result, note } = body

  const audit = (row: any) => db.from('betslip_settlement_audit').insert({
    betslip_id, actor: 'admin', source: 'manual_override', ...row,
  })

  // ── Leg-level override: re-settle one leg, recompute the slip ──
  if (leg_id) {
    if (!RESULTS.includes(leg_result)) {
      return NextResponse.json({ error: 'valid leg_result required' }, { status: 400 })
    }
    const { data: leg } = await db.from('betslip_legs').select('betslip_id, result').eq('id', leg_id).maybeSingle()
    if (!leg || leg.betslip_id !== betslip_id) return NextResponse.json({ error: 'Leg not found' }, { status: 404 })

    await db.from('betslip_legs').update({ result: leg_result }).eq('id', leg_id)
    await audit({ leg_id, field: 'leg_result', old_value: leg.result ?? null, new_value: leg_result, note: note ?? null })

    const { data: sibs } = await db.from('betslip_legs').select('result').eq('betslip_id', betslip_id)
    const prev = (await db.from('betslips').select('result').eq('id', betslip_id).maybeSingle()).data?.result ?? null
    const slipResult = slipResultFromLegs((sibs ?? []).map((s: any) => s.result))
    await db.from('betslips').update({
      result: slipResult,
      settled_at: slipResult === 'pending' ? null : new Date().toISOString(),
      ...(slipResult !== 'pending' ? { result_proof_pending: false } : {}),
    }).eq('id', betslip_id)
    if (slipResult !== prev) await audit({ field: 'result', old_value: prev, new_value: slipResult, note: 'recomputed from leg override' })
    return NextResponse.json({ success: true, legResult: leg_result, slipResult })
  }

  // ── Slip-level override: set the result directly ──
  if (!RESULTS.includes(result)) return NextResponse.json({ error: 'valid result required' }, { status: 400 })
  const prev = (await db.from('betslips').select('result').eq('id', betslip_id).maybeSingle()).data?.result ?? null
  await db.from('betslips').update({
    result,
    settled_at: result === 'pending' ? null : new Date().toISOString(),
    result_proof_pending: false,
  }).eq('id', betslip_id)
  await audit({ field: 'result', old_value: prev, new_value: result, note: note ?? null })
  return NextResponse.json({ success: true, slipResult: result })
}
