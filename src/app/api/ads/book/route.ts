import { NextRequest, NextResponse } from 'next/server'
export async function POST(req: NextRequest) {
  const body = await req.json()
  // In production: save to DB + trigger Mobile Money payment
  console.log('Ad booking:', body)
  await new Promise(r => setTimeout(r, 1000))
  return NextResponse.json({ success: true, ad_id: 'mock-ad-' + Date.now() })
}
