import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { verifyAdminToken } from '@/lib/adminAuth'

export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req)) return NextResponse.json({ total: 0, commission: 0, purchases: 0, tipsters: [] })
  if (!verifyAdminToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseServer()
  if (!db) return NextResponse.json({ total: 0, commission: 0, purchases: 0, tipsters: [] })

  const { data: earnings } = await db.from('earnings').select('*')
  const { count: purchases } = await db.from('slip_purchases').select('*', { count: 'exact', head: true })

  const total      = (earnings ?? []).reduce((s: number, e: any) => s + (e.amount ?? 0), 0)
  const commission = (earnings ?? []).reduce((s: number, e: any) => s + (e.platform_cut ?? 0), 0)

  const byTipster: Record<string, { name: string; revenue: number; purchases: number }> = {}
  for (const e of earnings ?? []) {
    if (!byTipster[e.tipster_id]) byTipster[e.tipster_id] = { name: e.tipster_id, revenue: 0, purchases: 0 }
    byTipster[e.tipster_id].revenue    += e.platform_cut ?? 0
    byTipster[e.tipster_id].purchases  += 1
  }

  return NextResponse.json({ total, commission, purchases: purchases ?? 0, tipsters: Object.entries(byTipster).map(([id, v]) => ({ id, ...v })) })
}
