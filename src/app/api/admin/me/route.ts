// Is the current session an admin? (profiles.role = 'admin')
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = await requireRole('admin')
  if (!admin) return NextResponse.json({ error: 'Not admin' }, { status: 401 })
  return NextResponse.json({ admin: true, email: admin.email })
}
