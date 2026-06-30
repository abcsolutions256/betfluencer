// The tipster row for the logged-in user (resolved from the Supabase
// session), or 401 if they aren't a tipster. Used by the dashboard.
import { NextResponse } from 'next/server'
import { getMyTipster } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  const tipster = await getMyTipster()
  if (!tipster) return NextResponse.json({ error: 'Not a tipster' }, { status: 401 })
  return NextResponse.json({ tipster })
}
