import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { requireRole } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseServer()
  if (!db) return NextResponse.json({ total: 0, commission: 0, purchases: 0, tipsters: [] })

  const { data: earnings } = await db.from('earnings').select('*')
  const { count: purchases } = await db.from('slip_purchases').select('*', { count: 'exact', head: true })

  const total      = (earnings ?? []).reduce((s: number, e: any) => s + (e.gross ?? 0), 0)
  const commission = (earnings ?? []).reduce((s: number, e: any) => s + (e.commission ?? 0), 0)

  const byTipster: Record<string, { name: string; revenue: number; purchases: number }> = {}
  for (const e of earnings ?? []) {
    if (!byTipster[e.tipster_id]) byTipster[e.tipster_id] = { name: e.tipster_id, revenue: 0, purchases: 0 }
    byTipster[e.tipster_id].revenue   += e.commission ?? 0
    byTipster[e.tipster_id].purchases += 1
  }

  return NextResponse.json({
    total,
    commission,
    purchases: purchases ?? 0,
    tipsters: Object.entries(byTipster).map(([id, v]) => ({ id, ...v }))
  })
}