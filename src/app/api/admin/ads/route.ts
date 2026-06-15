import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ ads: [] })
}

export async function POST(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  console.log('New ad posted by admin:', body.advertiser_name)
  return NextResponse.json({ success: true, ad_id: 'ad-' + Date.now() })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireRole('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { ad_id, status } = await req.json()
  console.log(`Ad ${ad_id} status → ${status}`)
  return NextResponse.json({ success: true })
}
