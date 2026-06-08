import { NextRequest, NextResponse } from 'next/server'
export async function POST(req: NextRequest) {
  const { ad_id } = await req.json()
  if (!ad_id) return NextResponse.json({ ok: false })
  console.log(`Ad click: ${ad_id}`)
  return NextResponse.json({ ok: true })
}
