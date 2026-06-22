import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { requireRole } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseServer()
  if (!db) return NextResponse.json({ stats: { subscribers: 0, tipsters: 0, commission: 0, liveAds: 0 }, activity: [] })

  const [{ count: tipsters }, { count: purchases }, { data: earnings }] = await Promise.all([
    db.from('tipsters').select('*', { count: 'exact', head: true }),
    db.from('slip_purchases').select('*', { count: 'exact', head: true }),
    db.from('earnings').select('commission').order('created_at', { ascending: false }).limit(100),
  ])

  const commission = (earnings ?? []).reduce((s: number, e: any) => s + (e.commission ?? 0), 0)

  // slip_purchases' timestamp is purchased_at, not created_at (selecting/
  // ordering by a non-existent column errors the whole query → empty activity).
  const { data: recentPurchases } = await db
    .from('slip_purchases')
    .select('purchased_at, tipsters(name)')
    .order('purchased_at', { ascending: false })
    .limit(5)

  const activity = (recentPurchases ?? []).map((p: any) => ({
    text: `New purchase — ${p.tipsters?.name ?? 'Unknown'} slip`,
    time: new Date(p.purchased_at).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })
  }))

  return NextResponse.json({
    stats: { subscribers: purchases ?? 0, tipsters: tipsters ?? 0, commission, liveAds: 0 },
    activity
  })
}