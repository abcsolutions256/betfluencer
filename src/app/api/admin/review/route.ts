import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { requireRole } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseServer()
  if (!db) return NextResponse.json({ legs: [] })
  // betslip_legs has no created_at column — order by match_time (its only
  // timestamp); ordering by a non-existent column errors the whole query.
  const { data } = await db.from('betslip_legs').select('*, betslips(tipster_id, tipsters(name))').eq('result', 'unverifiable').order('match_time', { ascending: false, nullsFirst: false })
  const legs = (data ?? []).map((l: any) => ({ id: l.id, match: l.match, pick: l.pick, odds: l.odds, tipster_name: l.betslips?.tipsters?.name ?? 'Unknown' }))
  return NextResponse.json({ legs })
}

// Settle ONE leg (admin), then recompute the parent slip from all its legs:
// an accumulator loses if any leg loses, wins once every leg is decided with no
// loss, and stays pending while any leg is still pending.
export async function POST(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { legId, result } = await req.json()
  const valid = ['win', 'loss', 'void', 'pending']
  if (!legId || !valid.includes(result)) {
    return NextResponse.json({ error: 'legId and a valid result are required' }, { status: 400 })
  }
  const db = supabaseServer()
  if (!db) return NextResponse.json({ error: 'No DB' }, { status: 500 })

  const { data: leg } = await db.from('betslip_legs').select('betslip_id').eq('id', legId).maybeSingle()
  if (!leg?.betslip_id) return NextResponse.json({ error: 'Leg not found' }, { status: 404 })

  await db.from('betslip_legs').update({ result }).eq('id', legId)

  // Re-derive the slip result from the (updated) set of legs.
  const { data: sibs } = await db.from('betslip_legs').select('result').eq('betslip_id', leg.betslip_id)
  const results = (sibs ?? []).map((s: any) => s.result)
  const hasLoss    = results.some((r: string) => r === 'loss')
  const hasPending = results.some((r: string) => !r || r === 'pending')
  const allVoid    = results.length > 0 && results.every((r: string) => r === 'void')
  const slipResult = hasLoss ? 'loss' : allVoid ? 'void' : !hasPending ? 'win' : 'pending'

  await db.from('betslips')
    .update({ result: slipResult, ...(slipResult !== 'pending' ? { result_proof_pending: false } : {}) })
    .eq('id', leg.betslip_id)

  return NextResponse.json({ success: true, legResult: result, slipResult })
}
