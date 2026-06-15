import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { requireRole } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseServer()
  if (!db) return NextResponse.json({ legs: [] })
  const { data } = await db.from('betslip_legs').select('*, betslips(tipster_id, tipsters(name))').eq('result', 'unverifiable').order('created_at', { ascending: false })
  const legs = (data ?? []).map((l: any) => ({ id: l.id, match: l.match, pick: l.pick, odds: l.odds, tipster_name: l.betslips?.tipsters?.name ?? 'Unknown' }))
  return NextResponse.json({ legs })
}

export async function POST(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { legId, result } = await req.json()
  const db = supabaseServer()
  if (!db) return NextResponse.json({ error: 'No DB' }, { status: 500 })
  await db.from('betslip_legs').update({ result }).eq('id', legId)
  return NextResponse.json({ success: true })
}
