// The tipster row for the logged-in user (resolved from the session cookie).
//   GET   — read my tipster row (dashboard bootstrap).
//   PATCH — update my own editable profile fields.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMyTipster } from '@/lib/auth/session'
import { updateTipster } from '@/lib/db'
import { rateLimit, getClientIP, rateLimitResponse } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

// Match signup's username rule so an edited username stays a clean slug.
const slugify = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')

const patchSchema = z.object({
  name:        z.string().trim().min(2).max(60).optional(),
  username:    z.string().trim().min(2).max(30).optional(),
  description: z.string().trim().max(500).optional(),
})

export async function GET() {
  const tipster = await getMyTipster()
  if (!tipster) return NextResponse.json({ error: 'Not a tipster' }, { status: 401 })
  return NextResponse.json({ tipster })
}

export async function PATCH(req: NextRequest) {
  const rl = rateLimit('default', getClientIP(req))
  if (!rl.allowed) return rateLimitResponse(rl.resetIn)

  // The session cookie IS the identity — a tipster can only edit their own row.
  const tipster = await getMyTipster()
  if (!tipster) return NextResponse.json({ error: 'Not a tipster' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  // Only write fields that were provided; slugify username to signup rules.
  const patch: { name?: string; username?: string; description?: string } = {}
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.username !== undefined) {
    const u = slugify(parsed.data.username)
    if (u.length < 2) return NextResponse.json({ error: 'Username must be at least 2 letters or numbers.' }, { status: 400 })
    patch.username = u
  }
  if (parsed.data.description !== undefined) patch.description = parsed.data.description

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const result = await updateTipster(tipster.id, patch)
  if (!result.ok) {
    if (result.reason === 'username-taken')
      return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 })
    if (result.reason === 'no-db')
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
    return NextResponse.json({ error: 'Could not save changes' }, { status: 500 })
  }
  return NextResponse.json({ tipster: result.tipster })
}
