import { NextRequest, NextResponse } from 'next/server'
import { getTipsterByIdentifier } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const tipster = await getTipsterByIdentifier(params.slug)
  if (!tipster) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ tipster })
}
