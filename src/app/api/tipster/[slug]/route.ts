import { NextRequest, NextResponse } from 'next/server'
import { getTipsterByIdentifier, getTipsByTipster } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const tipster = await getTipsterByIdentifier(params.slug)
  if (!tipster) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const tips = await getTipsByTipster(tipster.id)
  return NextResponse.json({ tipster, tips })
}