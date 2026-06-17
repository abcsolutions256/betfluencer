import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// One-off raw API-Football test. Visit /api/apitest in browser.
// Tests: (1) does the key work, (2) what does a known team search return.
export async function GET() {
  const API_KEY  = process.env.FOOTBALL_API_KEY ?? ''
  const BASE_URL = 'https://v3.football.api-sports.io'

  const out: any = { keyPresent: !!API_KEY, keyLength: API_KEY.length }

  async function call(label: string, endpoint: string) {
    try {
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        headers: { 'x-apisports-key': API_KEY },
      })
      const json = await res.json()
      out[label] = {
        status: res.status,
        errors: json.errors,
        results: json.results,
        sample: (json.response ?? []).slice(0, 2).map((f: any) => ({
          home: f.teams?.home?.name,
          away: f.teams?.away?.name,
          league: f.league?.name,
          date: f.fixture?.date,
          status: f.fixture?.status?.short,
          score: `${f.goals?.home ?? '?'}-${f.goals?.away ?? '?'}`,
        })),
      }
    } catch (e: any) {
      out[label] = { error: e.message }
    }
  }

  // Test 1: account status — confirms key works and shows plan/quota
  await call('status', '/status')

  // Test 2: search a well-known team by name (no date)
  await call('searchArsenal', '/teams?search=Arsenal')

  // Test 3: search the Icelandic fixture by date (June 15 2026)
  await call('iceland_jun15', '/fixtures?date=2026-06-15&search=Akureyri')

  // Test 4: same but June 16
  await call('iceland_jun16', '/fixtures?date=2026-06-16&search=Akureyri')

  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}