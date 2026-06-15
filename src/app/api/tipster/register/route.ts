// Elevate the logged-in user to a tipster: set profiles.role = 'tipster'
// and create their tipsters row (username, payout phone, sport). Called
// right after a Supabase signup from the tipster signup page.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth/session'
import { supabaseServer } from '@/lib/supabase'
import { normalisePhone } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const schema = z.object({
  name:        z.string().min(2),
  username:    z.string().min(2),
  phone:       z.string().min(8),       // payout Mobile Money number
  sport:       z.string().optional(),
  description: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Please fill in all fields' }, { status: 400 })
  const { name, username, phone, sport, description } = parsed.data
  const db = supabaseServer()

  // Already a tipster? Return it.
  const { data: existing } = await db.from('tipsters').select('id, username').eq('profile_id', user.id).single()
  if (existing) return NextResponse.json({ id: existing.id, username: existing.username, already: true })

  await db.from('profiles').update({ role: 'tipster', display_name: name }).eq('id', user.id)

  const { data: tipster, error } = await db
    .from('tipsters')
    .insert({
      profile_id:  user.id,
      name,
      username:    username.toLowerCase().replace(/[^a-z0-9]/g, ''),
      phone:       normalisePhone(phone),
      sport:       sport ?? '',
      description: description ?? '',
      verified:    false,
    })
    .select()
    .single()

  if (error) {
    const msg = /duplicate|unique/i.test(error.message)
      ? 'That username or payout number is already taken.'
      : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  return NextResponse.json({ id: tipster.id, username: tipster.username })
}
