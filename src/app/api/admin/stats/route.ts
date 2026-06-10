import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { verifyAdminToken } from '@/lib/adminAuth'

export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseServer()
  if (!db) return NextResponse.json({ stats: { subscribers: 0, tipsters: 0, commission: 0, liveAds: 0 }, activity: [] })

  const [{ count: tipsters }, { count: purchases }, { data: earnings }] = await Promise.all([
    db.from('tipsters').select('*', { count: 'exact', head: true }),
    db.from('slip_purchases').select('*', { count: 'exact', head: true }),
    db.from('earnings').select('commission').order('created_at', { ascending: false }).limit(100),
  ])

  const commission = (earnings ?? []).reduce((s: number, e: any) => s + (e.commission ?? 0), 0)

  const { data: recentPurchases } = await db
    .from('slip_purchases')
    .select('created_at, tipsters(name)')
    .order('created_at', { ascending: false })
    .limit(5)

  const activity = (recentPurchases ?? []).map((p: any) => ({
    text: `New purchase — ${p.tipsters?.name ?? 'Unknown'} slip`,
    time: new Date(p.created_at).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })
  }))

  return NextResponse.json({
    stats: { subscribers: purchases ?? 0, tipsters: tipsters ?? 0, commission, liveAds: 0 },
    activity
  })
}