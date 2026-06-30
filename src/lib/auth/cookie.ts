// ── Secure signed-cookie session (phone-identity auth) ────────────
// Stateless session: a compact `{ sub, role, exp }` token signed with
// HMAC-SHA256 and stored in an httpOnly cookie. Replaces Supabase Auth.
// `sub` = the tipster id (tipster sessions) or the literal "admin".
//
// Security: the cookie is signed server-side and verified on every read, so
// it cannot be forged (unlike main's old base64 "admin:" token) and it never
// lives in client-readable JS (unlike the old localStorage `bf_tipster` flag).
import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

export type Role = 'user' | 'tipster' | 'admin'
export interface Session { sub: string; role: Role }

export const SESSION_COOKIE = 'bf_session'
const MAX_AGE_S = 60 * 60 * 24 * 30 // 30 days

// Signing key: a dedicated secret if set, else the service-role key (always
// present server-side, never shipped to the client). Fail closed if neither.
function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('No SESSION_SECRET / SUPABASE_SERVICE_ROLE_KEY for session signing')
  return s
}

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
const sign = (payload: string) => b64url(createHmac('sha256', secret()).update(payload).digest())

// Build a signed token. exp is epoch seconds.
export function signSession(sub: string, role: Role): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S
  const payload = b64url(Buffer.from(JSON.stringify({ sub, role, exp })))
  return `${payload}.${sign(payload)}`
}

// Verify a token → the session, or null if missing/tampered/expired.
export function verifySession(token: string | undefined | null): Session | null {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = sign(payload)
  // constant-time compare (lengths must match for timingSafeEqual)
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const { sub, role, exp } = JSON.parse(fromB64url(payload).toString())
    if (!sub || !role || typeof exp !== 'number' || exp < Math.floor(Date.now() / 1000)) return null
    return { sub, role }
  } catch { return null }
}

// ── Cookie I/O (route handlers / server actions only for set/clear) ──
export function setSessionCookie(sub: string, role: Role): void {
  cookies().set(SESSION_COOKIE, signSession(sub, role), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   MAX_AGE_S,
  })
}

export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
}

export function readSessionCookie(): Session | null {
  return verifySession(cookies().get(SESSION_COOKIE)?.value)
}
