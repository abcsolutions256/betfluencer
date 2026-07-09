// ── GET /api/country ───────────────────────────────────────────────
// The ACTIVE country for this request (resolved by the middleware from
// subdomain / ?country= override / default UG). Client components read
// it via <CountryProvider> for currency display + betting-site order.
import { NextResponse } from 'next/server'
import { getActiveCountry } from '@/lib/country'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  const country = await getActiveCountry(req)
  return NextResponse.json(
    { country },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
