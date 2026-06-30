// Server-side session + role helpers (phone-identity, signed-cookie auth).
// Backed by src/lib/auth/cookie.ts — no Supabase Auth.
//   getSessionUser() = the logged-in identity { id, role } (or null).
//   getMyTipster()   = the tipsters row for a tipster session (or null).
//   requireRole()    = gate a handler/page by role (admins pass all).
//   createSession()/clearSession() = set/clear the cookie (login/logout).
import { readSessionCookie, setSessionCookie, clearSessionCookie, type Role } from './cookie'
import { supabaseServer } from '@/lib/supabase'

export type { Role }

export interface Profile {
  id:           string
  role:         Role
  email:        string | null
  display_name: string
}

export interface SessionUser { id: string; role: Role }

// The raw verified session ({ sub, role }) or null.
export function getSession() {
  return readSessionCookie()
}

// Issue / clear the session cookie. Call only from route handlers / actions.
export function createSession(sub: string, role: Role): void {
  setSessionCookie(sub, role)
}
export function clearSession(): void {
  clearSessionCookie()
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const s = readSessionCookie()
  return s ? { id: s.sub, role: s.role } : null
}

export async function getProfile(): Promise<Profile | null> {
  const s = readSessionCookie()
  if (!s) return null
  return { id: s.sub, role: s.role, email: null, display_name: '' }
}

// Returns the profile if the session has the given role (admins always pass);
// otherwise null. Use to gate route handlers / pages.
export async function requireRole(role: Role): Promise<Profile | null> {
  const p = await getProfile()
  if (!p) return null
  if (p.role === 'admin' || p.role === role) return p
  return null
}

// The tipsters row for the logged-in tipster (session.sub IS the tipster id),
// or null. maybeSingle so a stale/unknown id degrades to null, not a 500.
export async function getMyTipster(): Promise<any | null> {
  const s = readSessionCookie()
  if (!s || s.role !== 'tipster') return null
  const db = supabaseServer()
  const { data } = await db.from('tipsters').select('*').eq('id', s.sub).maybeSingle()
  return data ?? null
}
