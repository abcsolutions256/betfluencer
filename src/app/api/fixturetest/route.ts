import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Targeted test: can the API find yesterday's fixtures?
// Visit /api/fixturetest
export async function GET() {
  const API_KEY  = process.env.FOOTBALL_API_KEY ?? ''
  const BASE_URL = 'https://v3.football.api-sports.io'

  const out: any = {}

  async function call(label: string, endpoint: string) {
    try {
      const res = await fetch(`${BASE_URL}${endpoint}`, { headers: { 'x-apisports-key': API_KEY } })
      const json = await res.json()
      out[label] = {
        status: res.status,
        errors: json.errors,
        results: json.results,
        teams: (json.response ?? []).map((f: any) =>
          `${f.teams?.home?.name} vs ${f.teams?.away?.name} [${f.fixture?.status?.short}] ${f.goals?.home}-${f.goals?.away}`
        ).slice(0, 60),
      }
    } catch (e: any) {
      out[label] = { error: e.message }
    }
  }

  // What dates does the free plan allow right now?
  const now = Date.now()
  out.dates_in_window = []
  for (let d = -1; d <= 2; d++) {
    out.dates_in_window.push(new Date(now + d * 86400000).toISOString().split('T')[0])
  }

  // Try fetching all fixtures for June 17 (yesterday)
  await call('jun17_all', '/fixtures?date=2026-06-17')

  // Search Portugal team to see if the friendly is in there
  await call('portugal_search', '/teams?search=Portugal')

  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}