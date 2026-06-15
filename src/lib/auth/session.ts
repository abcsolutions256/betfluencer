// Server-side session + role helpers (Supabase Auth).
// getSessionUser() = the logged-in auth user (or null).
// getProfile()    = their profiles row (role, etc.), read with the service
//                   role so it's reliable regardless of RLS.
import type { User } from '@supabase/supabase-js'
import { supabaseSession } from '@/lib/supabase/server'
import { supabaseServer } from '@/lib/supabase'

export type Role = 'user' | 'tipster' | 'admin'

export interface Profile {
  id:           string
  role:         Role
  email:        string | null
  display_name: string
}

export async function getSessionUser(): Promise<User | null> {
  const sb = supabaseSession()
  const { data } = await sb.auth.getUser()
  return data.user ?? null
}

export async function getProfile(): Promise<Profile | null> {
  const user = await getSessionUser()
  if (!user) return null
  const db = supabaseServer()
  const { data } = await db
    .from('profiles')
    .select('id, role, email, display_name')
    .eq('id', user.id)
    .single()
  return (data as Profile) ?? { id: user.id, role: 'user', email: user.email ?? null, display_name: '' }
}

// Returns the profile if the user has the given role (admins always pass);
// otherwise null. Use to gate route handlers / pages.
export async function requireRole(role: Role): Promise<Profile | null> {
  const p = await getProfile()
  if (!p) return null
  if (p.role === 'admin' || p.role === role) return p
  return null
}

// The tipster row for the logged-in user (by profile_id), or null.
export async function getMyTipster(): Promise<any | null> {
  const user = await getSessionUser()
  if (!user) return null
  const db = supabaseServer()
  const { data } = await db.from('tipsters').select('*').eq('profile_id', user.id).single()
  return data ?? null
}
