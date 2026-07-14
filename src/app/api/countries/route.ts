// ── GET /api/countries ─────────────────────────────────────────────
// Public list of all markets (config only — nothing sensitive) for the
// /welcome country picker and the admin market switcher. Falls back to
// a Uganda-only list if the countries table is unreachable.
import { NextResponse } from 'next/server'
import { loadCountries } from '@/lib/country'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const countries = await loadCountries()
  return NextResponse.json(
    { countries },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
