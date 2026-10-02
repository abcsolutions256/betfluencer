// ── POST /api/tipster/auth ────────────────────────────────────────
// Phone-identity tipster auth (no email). action: 'login' | 'signup'.
// On success sets the secure signed-cookie session (role 'tipster') so the
// dashboard / API resolve the tipster server-side. Existing tipsters log in
// with their current phone + password (sha256 hash already in tipsters).
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit, getClientIP, rateLimitResponse } from '@/lib/rateLimit'
import { hashPassword, verifyPassword, isStrongPassword, normalisePhone } from '@/lib/auth'
import { getTipsterByPhone, createTipsterAccount } from '@/lib/db'
import { createSession } from '@/lib/auth/session'
import { supabaseServer } from '@/lib/supabase'
import { publicSignupsEnabled } from '@/lib/settings'
import { getActiveCountry, dialCode } from '@/lib/country'
import { linkTipsterToCountry } from '@/lib/countryFilter'

export const dynamic = 'force-dynamic'

const slugify = (name: string) => name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')

const loginSchema = z.object({
  action:   z.literal('login'),
  phone:    z.string().min(8),
  password: z.string().min(1),
})

const signupSchema = z.object({
  action:      z.literal('signup'),
  name:        z.string().min(2),
  username:    z.string().min(2),
  phone:       z.string().min(8),
  password:    z.string().min(8),
  sport:       z.string().optional(),
  description: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const rl = rateLimit('tipster-auth', getClientIP(req))
  if (!rl.allowed) return rateLimitResponse(rl.resetIn)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  // ── LOGIN ───────────────────────────────────────────────────────
  if (body.action === 'login') {
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

    // Normalise with the active market's dialing code so a local number
    // entered on e.g. ng.betfluencer.org resolves to +234… (a leading '+' or
    // '0' in the input is still handled regardless of market).
    const country = await getActiveCountry(req)
    const phone   = normalisePhone(parsed.data.phone, dialCode(country.code))
    const tipster = await getTipsterByPhone(phone)
    if (!tipster) return NextResponse.json({ error: 'No account found for this number' }, { status: 401 })
    if (!verifyPassword(parsed.data.password, tipster.password_hash ?? ''))
      return NextResponse.json({ error: 'Wrong password. Please try again.' }, { status: 401 })

    createSession(tipster.id, 'tipster')
    return NextResponse.json({ id: tipster.id, name: tipster.name, username: tipster.username })
  }

  // ── SIGNUP ──────────────────────────────────────────────────────
  if (body.action === 'signup') {
    // Self-signup is gated by the admin "Public signups" flag (default OFF).
    // When closed, only an admin can create tipsters (POST /api/admin/tipsters).
    if (!(await publicSignupsEnabled()))
      return NextResponse.json({ error: 'Tipster signups are currently closed. Please contact the admin to get an account.' }, { status: 403 })

    const parsed = signupSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Please fill in all required fields' }, { status: 400 })

    const strength = isStrongPassword(parsed.data.password)
    if (!strength.ok) return NextResponse.json({ error: strength.reason }, { status: 400 })

    // Signup market → dialing code for the phone, and (below) the tipster's
    // country link. A local number defaults to this market's code (+256/+234/…).
    const country = await getActiveCountry(req)
    const phone = normalisePhone(parsed.data.phone, dialCode(country.code))
    if (await getTipsterByPhone(phone))
      return NextResponse.json({ error: 'An account with this number already exists' }, { status: 409 })

    const tipster = await createTipsterAccount({
      name:          parsed.data.name,
      username:      slugify(parsed.data.username || parsed.data.name),
      phone,
      password_hash: hashPassword(parsed.data.password),
      sport:         parsed.data.sport       ?? '',
      description:   parsed.data.description  ?? '',
    })
    if (!tipster) {
      // No DB (mock) or a unique-constraint collision on username.
      if (!supabaseServer()) return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
      return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 })
    }

    // New tipsters belong to the market they signed up on (best-effort —
    // a link failure never blocks signup; UG shows unfiltered on error).
    const db = supabaseServer()
    if (db) {
      await linkTipsterToCountry(db, tipster.id, country.code)
    }

    createSession(tipster.id, 'tipster')
    return NextResponse.json({ id: tipster.id, name: tipster.name, username: tipster.username })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
