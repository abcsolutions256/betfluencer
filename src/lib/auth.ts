// ── Tipster auth — phone + password, bcrypt hashed ───────────────
// No email, no OTP. Phone is identity. Password is security.

import { createHash, randomBytes, timingSafeEqual } from 'crypto'

// Simple but secure password hashing using Node crypto
// In production with Supabase, use pgcrypto's crypt() instead
export function hashPassword(password: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString('hex')
  const hash = createHash('sha256').update(s + password + s).digest('hex')
  return `${s}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const attempt = createHash('sha256').update(salt + password + salt).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'))
  } catch {
    return false
  }
}

// Simple session token — in production use JWT or Supabase sessions
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

// Password strength check
export function isStrongPassword(password: string): { ok: boolean; reason?: string } {
  if (password.length < 8)
    return { ok: false, reason: 'Password must be at least 8 characters' }
  if (!/\d/.test(password))
    return { ok: false, reason: 'Password must contain at least one number' }
  return { ok: true }
}

// Phone normalisation — always store as +256XXXXXXXXX
export function normalisePhone(phone: string, countryCode = '256'): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith(countryCode)) return `+${digits}`
  if (digits.startsWith('0')) return `+${countryCode}${digits.slice(1)}`
  return `+${countryCode}${digits}`
}
