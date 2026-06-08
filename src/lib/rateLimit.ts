// ── Rate limiting — in-memory for demo, Redis for production ──────
// Protects expensive endpoints: /api/parse-slip, /api/subscribe

const store = new Map<string, { count: number; resetAt: number }>()

interface RateLimitConfig {
  windowMs: number   // time window in ms
  max:      number   // max requests per window
}

const LIMITS: Record<string, RateLimitConfig> = {
  'parse-slip':  { windowMs: 60_000,  max: 5  },  // 5 parses/min per IP
  'subscribe':   { windowMs: 60_000,  max: 10 },  // 10 purchases/min per IP
  'tipster-auth':{ windowMs: 300_000, max: 10 },  // 10 auth attempts per 5min
  'verify':      { windowMs: 60_000,  max: 3  },  // 3 verify calls/min
  'default':     { windowMs: 60_000,  max: 60 },  // 60 req/min default
}

export function rateLimit(key: string, identifier: string): {
  allowed: boolean
  remaining: number
  resetIn: number
} {
  const config   = LIMITS[key] ?? LIMITS['default']
  const storeKey = `${key}:${identifier}`
  const now      = Date.now()

  let entry = store.get(storeKey)

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + config.windowMs }
    store.set(storeKey, entry)
  }

  entry.count++

  // Clean up old entries every 1000 checks
  if (store.size > 1000) {
    Array.from(store.entries()).forEach(([k, v]) => { if (now > v.resetAt) store.delete(k) })
  }

  const allowed   = entry.count <= config.max
  const remaining = Math.max(0, config.max - entry.count)
  const resetIn   = Math.ceil((entry.resetAt - now) / 1000)

  return { allowed, remaining, resetIn }
}

export function getClientIP(req: Request): string {
  const forwarded = (req.headers as any).get?.('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return 'unknown'
}

export function rateLimitResponse(resetIn: number) {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please wait before trying again.', retryAfter: resetIn }),
    { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(resetIn) } }
  )
}
