// ── API-Football (api-sports.io) ──────────────────────────────────
// Auto-verifies betslip legs after match ends
// FREE TIER CONSTRAINTS:
//   - Only ~3-day window available (yesterday → +2 days). Older dates blocked.
//   - Cannot combine ?date with ?search. Query by date only, match teams client-side.
//   - 100 requests/day.
// Docs: https://www.api-football.com/documentation-v3

const API_KEY  = process.env.FOOTBALL_API_KEY ?? ''
const BASE_URL = 'https://v3.football.api-sports.io'

async function apiFetch(endpoint: string) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'x-apisports-key': API_KEY },
  })
  if (!res.ok) throw new Error(`API-Football error: ${res.status}`)
  return res.json()
}

// Normalize a team name for fuzzy comparison
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|sc|afc|cf|sk|if|ks|women|ladies|w|u\d+|reserves?|ii)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function teamsMatch(apiName: string, slipName: string): boolean {
  const a = normalize(apiName)
  const s = normalize(slipName)
  if (!a || !s) return false
  return a.includes(s) || s.includes(a) || a.startsWith(s.slice(0, 5)) || s.startsWith(a.slice(0, 5))
}

// ── FIXTURE LOOKUP BY ID (free plan allows this for recent matches) ──
export async function getFixtureById(fixtureId: number | string) {
  try {
    const data = await apiFetch(`/fixtures?id=${fixtureId}`)
    return data.response?.[0] ?? null
  } catch (e) {
    console.error('getFixtureById error:', e)
    return null
  }
}

// ── FIXTURE LOOKUP BY TEAMS + DATE (free-plan compatible) ──────────
// Queries by DATE ONLY (no search param), then matches teams client-side.
// Returns null if outside the free-plan window or no match found.
export async function findFixture(homeTeam: string, awayTeam: string, date: string | null) {
  // Free plan only allows roughly yesterday → +2 days.
  // Build candidate dates within that window.
  const now = Date.now()
  const allowed = new Set<string>()
  for (let d = -1; d <= 2; d++) {
    allowed.add(new Date(now + d * 86400000).toISOString().split('T')[0])
  }

  const datesToTry: string[] = []
  if (date && allowed.has(date)) {
    datesToTry.push(date)
  } else {
    // No usable date — try the whole allowed window
    datesToTry.push(...Array.from(allowed))
  }

  for (const tryDate of datesToTry) {
    try {
      const data = await apiFetch(`/fixtures?date=${tryDate}`)
      const fixtures = data.response ?? []
      const match = fixtures.find((f: any) => {
        const home = f.teams?.home?.name ?? ''
        const away = f.teams?.away?.name ?? ''
        return teamsMatch(home, homeTeam) && teamsMatch(away, awayTeam)
      })
      if (match) return match
    } catch (e) {
      console.error('findFixture error for date', tryDate, e)
    }
  }
  return null
}

// ── MARKET VERIFICATION ───────────────────────────────────────────
export type VerifyResult = 'win' | 'loss' | 'pending' | 'unverifiable'

// Verify by fixture object (already fetched)
export function verifyLegAgainstFixture(pick: string, fixture: any): VerifyResult {
  const status = fixture.fixture?.status?.short
  if (!['FT','AET','PEN'].includes(status)) return 'pending'

  const homeGoals  = fixture.goals?.home ?? 0
  const awayGoals  = fixture.goals?.away ?? 0
  const totalGoals = homeGoals + awayGoals
  const htHome     = fixture.score?.halftime?.home ?? 0
  const htAway     = fixture.score?.halftime?.away ?? 0
  const home       = fixture.teams?.home?.name ?? ''
  const away       = fixture.teams?.away?.name ?? ''

  return determineResult(pick.toLowerCase().trim(), { homeGoals, awayGoals, totalGoals, htHome, htAway, home, away, fixture })
}

export async function verifyLeg(leg: {
  match:       string
  pick:        string
  match_time:  string | null
  fixture_id?: number | string | null
}): Promise<VerifyResult> {
  try {
    // If we already stored a fixture_id, verify directly by ID (most reliable)
    if (leg.fixture_id) {
      const fixture = await getFixtureById(leg.fixture_id)
      if (!fixture) return 'pending'
      return verifyLegAgainstFixture(leg.pick, fixture)
    }

    // Otherwise resolve by teams + date
    const parts = leg.match.split(/\s+vs\.?\s+/i)
    if (parts.length < 2) return 'unverifiable'
    const [home, away] = parts.map(s => s.trim())

    const date = leg.match_time ? leg.match_time.split('T')[0] : null

    if (leg.match_time && new Date(leg.match_time).getTime() > Date.now() - 2 * 60 * 60 * 1000) {
      return 'pending'
    }

    const fixture = await findFixture(home, away, date)
    if (!fixture) return 'unverifiable'

    return verifyLegAgainstFixture(leg.pick, fixture)
  } catch (err) {
    console.error('verifyLeg error:', err)
    return 'unverifiable'
  }
}

function determineResult(pick: string, data: {
  homeGoals: number; awayGoals: number; totalGoals: number
  htHome: number; htAway: number; home: string; away: string; fixture: any
}): VerifyResult {
  const { homeGoals, awayGoals, totalGoals, htHome, htAway, home, away } = data

  const overMatch = pick.match(/over\s+(\d+\.?\d*)/)
  if (overMatch) {
    const line = parseFloat(overMatch[1])
    return totalGoals > line ? 'win' : 'loss'
  }
  const underMatch = pick.match(/under\s+(\d+\.?\d*)/)
  if (underMatch) {
    const line = parseFloat(underMatch[1])
    return totalGoals < line ? 'win' : 'loss'
  }

  if (pick.includes('both teams') || pick.includes('btts')) {
    const btts = homeGoals > 0 && awayGoals > 0
    if (pick.includes('no') || pick.includes('not')) return btts ? 'loss' : 'win'
    return btts ? 'win' : 'loss'
  }

  if (pick.includes('home win') || pick.match(/^1$/) || pick.includes(home.toLowerCase() + ' win')) {
    return homeGoals > awayGoals ? 'win' : 'loss'
  }
  if (pick.includes('away win') || pick.match(/^2$/) || pick.includes(away.toLowerCase() + ' win')) {
    return awayGoals > homeGoals ? 'win' : 'loss'
  }
  if (pick.includes('draw') || pick.match(/^x$/)) {
    return homeGoals === awayGoals ? 'win' : 'loss'
  }

  if (pick.includes('1x') || pick.includes('home or draw')) {
    return homeGoals >= awayGoals ? 'win' : 'loss'
  }
  if (pick.includes('x2') || pick.includes('away or draw')) {
    return awayGoals >= homeGoals ? 'win' : 'loss'
  }
  if (pick.includes('12') || pick.includes('home or away')) {
    return homeGoals !== awayGoals ? 'win' : 'loss'
  }

  if (pick.includes('clean sheet')) {
    if (pick.includes(home.toLowerCase())) return awayGoals === 0 ? 'win' : 'loss'
    if (pick.includes(away.toLowerCase())) return homeGoals === 0 ? 'win' : 'loss'
    return (homeGoals === 0 || awayGoals === 0) ? 'win' : 'loss'
  }

  if (pick.includes('half time') || pick.includes('ht ')) {
    if (pick.includes('draw') || pick.includes('ht draw')) return htHome === htAway ? 'win' : 'loss'
    if (pick.includes('home') || pick.includes('1')) return htHome > htAway ? 'win' : 'loss'
    if (pick.includes('away') || pick.includes('2')) return htAway > htHome ? 'win' : 'loss'
  }

  if (pick.match(/ht\/ft|half.*full/)) return 'unverifiable'

  const handicapMatch = pick.match(/([a-z\s]+)\s*([+-]\d+\.?\d*)\s*(handicap)?/)
  if (handicapMatch) {
    const team     = handicapMatch[1].trim()
    const handicap = parseFloat(handicapMatch[2])
    const isHome   = team.includes('home') || team.toLowerCase().includes(home.toLowerCase())
    const adjustedHome = homeGoals + (isHome ? handicap : 0)
    const adjustedAway = awayGoals + (!isHome ? handicap : 0)
    if (isHome) return adjustedHome > awayGoals ? 'win' : adjustedHome === awayGoals ? 'win' : 'loss'
    return adjustedAway > homeGoals ? 'win' : adjustedAway === homeGoals ? 'win' : 'loss'
  }

  const exactScore = pick.match(/(\d+)\s*[-:]\s*(\d+)/)
  if (exactScore) {
    const pg = parseInt(exactScore[1]), ag = parseInt(exactScore[2])
    return homeGoals === pg && awayGoals === ag ? 'win' : 'loss'
  }

  const totalExact = pick.match(/exactly\s+(\d+)\s+goal/)
  if (totalExact) {
    return totalGoals === parseInt(totalExact[1]) ? 'win' : 'loss'
  }

  const marginMatch = pick.match(/win\s+by\s+(\d+)/)
  if (marginMatch) {
    const margin = parseInt(marginMatch[1])
    const diff   = Math.abs(homeGoals - awayGoals)
    return diff >= margin ? 'win' : 'loss'
  }

  if (pick.includes('score first') || pick.includes('first goal')) {
    const events    = data.fixture?.events ?? []
    const firstGoal = events.find((e: any) => e.type === 'Goal')
    if (!firstGoal) return 'unverifiable'
    const scorerTeam = firstGoal.team?.name?.toLowerCase() ?? ''
    if (pick.includes(home.toLowerCase())) return scorerTeam.includes(home.toLowerCase()) ? 'win' : 'loss'
    if (pick.includes(away.toLowerCase())) return scorerTeam.includes(away.toLowerCase()) ? 'win' : 'loss'
    return 'unverifiable'
  }

  if (pick.includes('to score') && !pick.includes('both') && !pick.includes('first')) {
    return 'unverifiable'
  }

  const cardMatch = pick.match(/over\s+(\d+\.?\d*)\s+card/)
  if (cardMatch) {
    const events = data.fixture?.events ?? []
    const cards  = events.filter((e: any) => e.type === 'Card').length
    return cards > parseFloat(cardMatch[1]) ? 'win' : 'loss'
  }

  return 'unverifiable'
}

// ── BATCH VERIFY ALL LEGS OF A SLIP ──────────────────────────────
export async function verifySlip(legs: {
  id: string; match: string; pick: string; match_time: string | null; fixture_id?: number | string | null
}[]): Promise<{ id: string; result: VerifyResult }[]> {
  const results = await Promise.all(
    legs.map(async leg => ({
      id:     leg.id,
      result: await verifyLeg(leg),
    }))
  )
  return results
}

// ── SLIP OVERALL RESULT ───────────────────────────────────────────
export function calcSlipResult(legResults: VerifyResult[]): 'win' | 'loss' | 'pending' | 'unverifiable' {
  if (legResults.some(r => r === 'loss'))        return 'loss'
  if (legResults.some(r => r === 'pending'))      return 'pending'
  if (legResults.some(r => r === 'unverifiable')) return 'unverifiable'
  if (legResults.every(r => r === 'win'))         return 'win'
  return 'pending'
}