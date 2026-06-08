import { NextRequest, NextResponse } from 'next/server'
import { checkAdminPassword, generateAdminToken } from '@/lib/adminAuth'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  if (!password) return NextResponse.json({ error: 'Password required' }, { status: 400 })
  if (!checkAdminPassword(password)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }
  return NextResponse.json({ token: generateAdminToken() })
}
