import { NextResponse } from 'next/server'
import { clearSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

// Clear the signed-cookie session (tipster or admin).
export async function POST() {
  clearSession()
  return NextResponse.json({ ok: true })
}
