import { NextRequest, NextResponse } from 'next/server'
import { getTipsterByIdentifier } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const tipster = await getTipsterByIdentifier(params.slug)
  if (!tipster) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Slips are served by /api/tipster/[slug]/slips; the legacy `tips` table is dead
  // in the merged schema (superseded by betslips), so it is no longer returned here.
  return NextResponse.json({ tipster })
}
