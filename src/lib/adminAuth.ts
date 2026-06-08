// ── Admin authentication ──────────────────────────────────────────
// Single password stored in env. Never exposed to client.

export const ADMIN_SESSION_KEY = 'bf_admin_session'

// Check if password matches
export function checkAdminPassword(password: string): boolean {
  const adminPass = process.env.ADMIN_PASSWORD ?? 'Betfluencer@Admin2026'
  return password === adminPass
}

// Generate a simple session token
export function generateAdminToken(): string {
  return Buffer.from(`admin:${Date.now()}:${Math.random()}`).toString('base64')
}

// Validate token format (basic check — in production use JWT)
export function isValidAdminToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64').toString()
    return decoded.startsWith('admin:')
  } catch { return false }
}

// ── Verify admin token from request header ────────────────────────
export function verifyAdminToken(req: Request): boolean {
  const token = (req.headers as any).get?.('x-admin-token') ?? ''
  return isValidAdminToken(token)
}
