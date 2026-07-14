import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { getActiveCountry } from '@/lib/country'
import { tipsterIdsForCountry, filterByTipsterIds } from '@/lib/countryFilter'

// Runs per request (hits the DB) — never prerender or cache at build time.
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(req: Request) {
  const db = supabaseServer()
  const country = await getActiveCountry(req)
  const marketIds = await tipsterIdsForCountry(db, country.code)
  // Channels/ranking read the live tipster_stats view (wins_last_10, losses,
  // avg_odds, roi, last5, slug, subscriber_count, score, created_at, …).
  // The rankings page recomputes the score in JS from these columns.
  const { data: tipsters, error } = await db
    .from('tipster_stats')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('tipster_stats error:', error)
    return NextResponse.json({ tipsters: [], error: error.message })
  }

  return NextResponse.json(
    { tipsters: filterByTipsterIds(tipsters ?? [], marketIds) },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
