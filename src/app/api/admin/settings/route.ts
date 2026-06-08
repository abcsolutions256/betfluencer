import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminToken } from '@/lib/adminAuth'

// Simple in-memory setting — persists per deployment
// For production, store in Supabase settings table
let settings = {
  publicSignupsEnabled: false,
}

export async function GET(req: NextRequest) {
  // Public endpoint — anyone can check if signups are open
  return NextResponse.json(settings)
}

export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  if (typeof body.publicSignupsEnabled === 'boolean') {
    settings.publicSignupsEnabled = body.publicSignupsEnabled
  }
  return NextResponse.json({ success: true, settings })
}
