// ── POST /api/admin/login ─────────────────────────────────────────
// Admin auth = a single master password (ADMIN_PASSWORD), as on main.
// On success sets the secure signed-cookie session (role 'admin'). The cookie
// is a server-validated HMAC token — NOT main's old forgeable base64 token.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit, getClientIP, rateLimitResponse } from '@/lib/rateLimit'
import { createSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

const schema = z.object({ password: z.string().min(1) })

export async function POST(req: NextRequest) {
  const rl = rateLimit('admin-login', getClientIP(req))
  if (!rl.allowed) return rateLimitResponse(rl.resetIn)

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Password required' }, { status: 400 })

  const adminPass = process.env.ADMIN_PASSWORD
  if (!adminPass) return NextResponse.json({ error: 'Admin login is not configured' }, { status: 500 })
  if (parsed.data.password !== adminPass) return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })

  createSession('admin', 'admin')
  return NextResponse.json({ ok: true })
}
