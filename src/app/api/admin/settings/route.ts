// Platform settings, persisted in the platform_settings table.
// GET is public (so the app can check if signups are open); POST is admin.
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/session'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function readSettings() {
  const db = supabaseServer()
  const { data } = await db.from('platform_settings').select('key, value')
  const map: Record<string, string> = {}
  for (const r of data ?? []) map[r.key] = r.value
  return {
    publicSignupsEnabled: map['public_signups_enabled'] === 'true',
    platform_commission:  parseFloat(map['platform_commission'] ?? '0.10'),
  }
}

export async function GET() {
  return NextResponse.json(await readSettings())
}

export async function POST(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const db = supabaseServer()

  const ups: { key: string; value: string }[] = []
  if (typeof body.publicSignupsEnabled === 'boolean') {
    ups.push({ key: 'public_signups_enabled', value: String(body.publicSignupsEnabled) })
  }
  if (body.platform_commission != null) {
    const c = Number(body.platform_commission)
    if (!Number.isNaN(c)) ups.push({ key: 'platform_commission', value: String(Math.max(0, Math.min(1, c))) })
  }
  for (const u of ups) await db.from('platform_settings').upsert(u, { onConflict: 'key' })

  return NextResponse.json({ success: true, settings: await readSettings() })
}
