import { NextResponse } from 'next/server'
import { findFixture } from '@/lib/footballApi'
import { supabaseServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Debug endpoint — uses the real date-range findFixture (no time restrictions).
// Visit /api/verify-debug in browser.
export async function GET() {
  const db = supabaseServer()

  const { data: pendingSlips } = await db
    .from('betslips')
    .select('*, betslip_legs(*)')
    .eq('result', 'pending')

  const report: any[] = []

  for (const slip of pendingSlips ?? []) {
    const legs = slip.betslip_legs ?? []
    if (!legs.length) continue   // skip slips with no legs — nothing to verify

    const slipReport: any = {
      slip_id: slip.id,
      posting_mode: slip.posting_mode,
      legs: [],
    }

    for (const leg of legs) {
      const legReport: any = { match: leg.match, pick: leg.pick, match_time: leg.match_time }

      const parts = leg.match.split(/\s+vs\.?\s+/i)
      if (parts.length < 2) {
        legReport.error = 'Could not split teams (no "vs")'
        slipReport.legs.push(legReport)
        continue
      }
      const [home, away] = parts.map((s: string) => s.trim())
      legReport.home = home
      legReport.away = away

      const date = leg.match_time ? leg.match_time.split('T')[0] : null
      legReport.search_mode = date ? `exact date ${date}` : 'date range (last 4 days → tomorrow)'

      try {
        const fixture = await findFixture(home, away, date)
        if (!fixture) {
          legReport.fixture = 'NOT FOUND'
        } else {
          legReport.fixture = {
            api_home: fixture.teams?.home?.name,
            api_away: fixture.teams?.away?.name,
            league:   fixture.league?.name,
            date:     fixture.fixture?.date,
            status:   fixture.fixture?.status?.short,
            score:    `${fixture.goals?.home ?? '?'}-${fixture.goals?.away ?? '?'}`,
          }
        }
      } catch (e: any) {
        legReport.fixture_error = e.message
      }

      slipReport.legs.push(legReport)
    }

    report.push(slipReport)
  }

  return NextResponse.json({ slips_with_legs: report.length, report }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}