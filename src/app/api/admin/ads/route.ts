import { NextRequest, NextResponse } from 'next/server'
import { isValidAdminToken } from '@/lib/adminAuth'

function checkAuth(req: NextRequest) {
  const token = req.headers.get('x-admin-token') ?? ''
  return isValidAdminToken(token)
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // In production: fetch from DB
  return NextResponse.json({ ads: [] })
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  // In production: save to DB
  console.log('New ad posted by admin:', body.advertiser_name)
  return NextResponse.json({ success: true, ad_id: 'ad-' + Date.now() })
}

export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { ad_id, status } = await req.json()
  // In production: update DB
  console.log(`Ad ${ad_id} status → ${status}`)
  return NextResponse.json({ success: true })
}
