import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { hashPassword, normalisePhone } from '@/lib/auth'
import { verifyAdminToken } from '@/lib/adminAuth'

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
}

export async function GET(req: NextRequest) {
  if (!verifyAdminToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseServer()
  if (!db) return NextResponse.json({ tipsters: [] })
  const { data } = await db.from('tipsters').select('id, name, username, phone, sport, description, verified, created_at').order('created_at', { ascending: false })
  return NextResponse.json({ tipsters: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  return NextResponse.json({ success: true, tipster: { id: tipster.id, name: tipster.name, username: tipster.username, phone: normPhone, password } })
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, verified } = await req.json()
  const db = supabaseServer()
  if (!db) return NextResponse.json({ error: 'Database not connected' }, { status: 500 })
  await db.from('tipsters').update({ verified }).eq('id', id)
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  if (!verifyAdminToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  const db = supabaseServer()
  if (!db) return NextResponse.json({ error: 'Database not connected' }, { status: 500 })
  await db.from('tipsters').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
