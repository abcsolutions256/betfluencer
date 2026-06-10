import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIP, rateLimitResponse } from '@/lib/rateLimit'
import { getTipsterByPhone, createTipsterAccount } from '@/lib/db'
import { hashPassword, verifyPassword, isStrongPassword, normalisePhone } from '@/lib/auth'
import { z } from 'zod'

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
}

const loginSchema = z.object({
  action:   z.literal('login'),
  phone:    z.string().min(8),
  password: z.string().min(1),
})

const signupSchema = z.object({
  action:        z.literal('signup'),
  name:          z.string().min(2),
  username:      z.string().min(2),
  phone:         z.string().min(8),
  password:      z.string().min(8),
  sport:         z.string().optional(),
  description:   z.string().optional(),
})

export async function POST(req: NextRequest) {
  const ip = getClientIP(req)
  const rl = rateLimit('tipster-auth', ip)
  if (!rl.allowed) return rateLimitResponse(rl.resetIn)

  const body = await req.json()

  // ── LOGIN ───────────────────────────────────────────────────────
  if (body.action === 'login') {
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    const phone   = normalisePhone(parsed.data.phone)
    const tipster = await getTipsterByPhone(phone)

    
    if (!tipster) return NextResponse.json({ error: 'No account found for this number' }, { status: 401 })

    const valid = verifyPassword(parsed.data.password, tipster.password_hash ?? '')
    if (!valid) return NextResponse.json({ error: 'Wrong password. Please try again.' }, { status: 401 })

    return NextResponse.json({ id: tipster.id, name: tipster.name, username: tipster.username })
  }

  // ── SIGNUP ──────────────────────────────────────────────────────
  if (body.action === 'signup') {
    const parsed = signupSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Please fill in all required fields' }, { status: 400 })

    const strength = isStrongPassword(parsed.data.password)
    if (!strength.ok) return NextResponse.json({ error: strength.reason }, { status: 400 })

    const phone = normalisePhone(parsed.data.phone)

    // Check phone not already taken — only check DB if connected
    const existing = await getTipsterByPhone(phone)
    // In demo mode (mock), existing will return a mock tipster — skip the check
    // Only block if we have a real DB connection
    const { supabaseServer } = await import('@/lib/supabase')
    const db = supabaseServer()
    if (db && existing) return NextResponse.json({ error: 'An account with this number already exists' }, { status: 409 })

    const password_hash = hashPassword(parsed.data.password)
    const username      = parsed.data.username || slugify(parsed.data.name)

    const tipster = await createTipsterAccount({
      name:          parsed.data.name,
      username,
      phone,
      password_hash,
      sport:         parsed.data.sport        ?? '',
      description:   parsed.data.description  ?? '',
    })

    if (!tipster) return NextResponse.json({ error: 'Could not create account' }, { status: 500 })

    return NextResponse.json({ id: tipster.id, name: tipster.name, username: tipster.username })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
