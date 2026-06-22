import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { requireRole } from '@/lib/auth/session'

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

export async function POST(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { legId, result } = await req.json()
  const db = supabaseServer()
  if (!db) return NextResponse.json({ error: 'No DB' }, { status: 500 })
  await db.from('betslip_legs').update({ result }).eq('id', legId)
  return NextResponse.json({ success: true })
}
