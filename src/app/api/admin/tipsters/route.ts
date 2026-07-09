import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { hashPassword, normalisePhone } from '@/lib/auth'
import { requireRole } from '@/lib/auth/session'
import { getActiveCountry, normalizeCode } from '@/lib/country'
import { linkTipsterToCountry } from '@/lib/countryFilter'

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
}

export async function GET(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseServer()
  if (!db) return NextResponse.json({ tipsters: [] })
  const { data } = await db.from('tipsters').select('id, name, username, phone, sport, description, verified, created_at').order('created_at', { ascending: false })
  return NextResponse.json({ tipsters: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { name, phone, password, sport, description } = body
  if (!name || !phone || !password) return NextResponse.json({ error: 'Name, phone and password are required' }, { status: 400 })
  const db = supabaseServer()
  if (!db) return NextResponse.json({ error: 'Database not connected' }, { status: 500 })
  const normPhone = normalisePhone(phone)
  const { data: existing } = await db
    .from('tipsters')
    .select('id')
    .eq('phone', normPhone)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Phone number already registered' }, { status: 409 })
  const { data: tipster, error } = await db
    .from('tipsters')
    .insert({
      name,
      username: slugify(name),
      phone:    normPhone,
      password_hash: hashPassword(password),
      sport:       sport       ?? '',
      description: description ?? '',
    })
    .select()
    .single()

  if (error) {
    console.error('Tipster insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Place the new tipster in a market or they'd be invisible everywhere:
  // an explicit body.country (admin market switcher) wins, else the
  // market the admin panel is being viewed on (UG by default).
  const countryCode = normalizeCode(body.country) ?? (await getActiveCountry(req)).code
  await linkTipsterToCountry(db, tipster.id, countryCode)

  return NextResponse.json({ success: true, tipster: { id: tipster.id, name: tipster.name, username: tipster.username, phone: normPhone, password } })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, verified, commission_rate } = await req.json()
  const db = supabaseServer()
  const patch: any = {}
  if (typeof verified === 'boolean') patch.verified = verified
  if (commission_rate !== undefined) patch.commission_rate = (commission_rate === null || commission_rate === '') ? null : Number(commission_rate)
  if (Object.keys(patch).length) await db.from('tipsters').update(patch).eq('id', id)
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Tipster id required' }, { status: 400 })
  const db = supabaseServer()
  if (!db) return NextResponse.json({ error: 'Database not connected' }, { status: 500 })

  // Several tables reference tipsters(id) WITHOUT `on delete cascade`
  // (slip_purchases, payments) and others block their own parents
  // (payments.purchase_id → slip_purchases, earnings.betslip_id → betslips).
  // Deleting the tipster alone therefore fails with a foreign-key violation,
  // which the old code swallowed → the row "disappeared" then reappeared on
  // refresh. Remove dependents child-first, then the tipster, checking each step.
  const steps: { table: string; column: string }[] = [
    { table: 'payments',       column: 'tipster_id' },  // → slip_purchases + tipsters
    { table: 'earnings',       column: 'tipster_id' },  // → betslips (blocks betslip delete)
    { table: 'slip_purchases', column: 'tipster_id' },  // → betslips + tipsters
    { table: 'betslips',       column: 'tipster_id' },  // cascades legs/secrets/verifications
  ]
  for (const s of steps) {
    const { error } = await db.from(s.table).delete().eq(s.column, id)
    // A missing legacy table (e.g. payments dropped later) shouldn't block the
    // removal; only surface real failures.
    if (error && error.code !== '42P01') {
      console.error(`Tipster delete — clearing ${s.table} failed:`, error)
      return NextResponse.json({ error: `Could not remove ${s.table}: ${error.message}` }, { status: 500 })
    }
  }

  const { error } = await db.from('tipsters').delete().eq('id', id)
  if (error) {
    console.error('Tipster delete error:', error)
    return NextResponse.json({ error: `Could not remove tipster: ${error.message}` }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
