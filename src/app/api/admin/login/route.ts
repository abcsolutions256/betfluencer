// ── POST /api/admin/login ─────────────────────────────────────────
// Admin auth = a designated admin phone (∈ ADMIN_PHONES) + ADMIN_PASSWORD.
// On success sets the secure signed-cookie session (role 'admin'). This is a
// server-validated HMAC cookie — NOT main's old forgeable base64 token.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit, getClientIP, rateLimitResponse } from '@/lib/rateLimit'
import { normalisePhone } from '@/lib/auth'
import { createSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

const schema = z.object({ phone: z.string().min(8), password: z.string().min(1) })

// Allowed admin phones (comma-separated env), normalised to +256…
function adminPhones(): string[] {
  return (process.env.ADMIN_PHONES ?? '')
    .split(',').map(p => p.trim()).filter(Boolean).map(p => normalisePhone(p))
}

export async function POST(req: NextRequest) {
  const rl = rateLimit('admin-login', getClientIP(req))
  if (!rl.allowed) return rateLimitResponse(rl.resetIn)

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Phone and password required' }, { status: 400 })

  const adminPass = process.env.ADMIN_PASSWORD
  const phones    = adminPhones()
  if (!adminPass || phones.length === 0)
    return NextResponse.json({ error: 'Admin login is not configured' }, { status: 500 })

  const phone = normalisePhone(parsed.data.phone)
  if (!phones.includes(phone) || parsed.data.password !== adminPass)
    return NextResponse.json({ error: 'Incorrect phone or password' }, { status: 401 })

  // sub = the admin phone so logs/audits can attribute the session.
  createSession(phone, 'admin')
  return NextResponse.json({ ok: true })
}
