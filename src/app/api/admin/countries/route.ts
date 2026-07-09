// ── Admin market controls ──────────────────────────────────────────
// GET  — all countries, read fresh from the DB (not the 60s lib cache)
//        so toggles reflect immediately in the Markets tab.
// PATCH — flip active / payments_enabled / coming_soon for one market.
//        UGANDA IS LOCKED: the live market cannot be toggled from the
//        panel (SQL is the deliberate escape hatch), so a mis-tap can
//        never dark the running business.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase'
import { requireRole } from '@/lib/auth/session'
import { DEFAULT_COUNTRY, invalidateCountryCache, normalizeCode } from '@/lib/country'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseServer()
  if (!db) return NextResponse.json({ countries: [DEFAULT_COUNTRY] })
  const { data, error } = await db.from('countries').select('*').order('code', { ascending: true })
  if (error) return NextResponse.json({ countries: [DEFAULT_COUNTRY], error: error.message })
  return NextResponse.json({ countries: data ?? [] })
}

const patchSchema = z.object({
  code:             z.string().length(2),
  active:           z.boolean().optional(),
  payments_enabled: z.boolean().optional(),
  coming_soon:      z.boolean().optional(),
})

export async function PATCH(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const code = normalizeCode(parsed.data.code)
  if (!code) return NextResponse.json({ error: 'Invalid country code' }, { status: 400 })
  if (code === DEFAULT_COUNTRY.code)
    return NextResponse.json({ error: 'Uganda is the live market and cannot be toggled from the panel.' }, { status: 403 })

  const patch: Record<string, boolean> = {}
  if (parsed.data.active !== undefined)           patch.active = parsed.data.active
  if (parsed.data.payments_enabled !== undefined) patch.payments_enabled = parsed.data.payments_enabled
  if (parsed.data.coming_soon !== undefined)      patch.coming_soon = parsed.data.coming_soon
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const db = supabaseServer()
  if (!db) return NextResponse.json({ error: 'Database not connected' }, { status: 500 })
  const { data, error } = await db.from('countries').update(patch).eq('code', code).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Unknown country' }, { status: 404 })

  invalidateCountryCache()   // this runtime; middleware refreshes ≤60s
  return NextResponse.json({ success: true, country: data })
}
