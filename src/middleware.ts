// Auth is a stateless, signed httpOnly cookie (src/lib/auth/cookie.ts) that is
// verified on demand inside route handlers / server components via
// requireRole / getMyTipster — there is no session to refresh per request.
// No middleware is needed; this file intentionally exports nothing active.
//
// (Previously this refreshed the Supabase Auth session on every request. That
// auth model was replaced by phone-identity signed cookies.)
import { type NextRequest, NextResponse } from 'next/server'

export function middleware(_req: NextRequest) {
  return NextResponse.next()
}

export const config = {
  // Effectively disabled — match nothing.
  matcher: [],
}
