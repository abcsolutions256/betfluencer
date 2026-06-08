// ── API-Football (api-sports.io) ──────────────────────────────────
// Auto-verifies betslip legs after match ends
// Free tier: 100 requests/day — sufficient for launch
// Docs: https://www.api-football.com/documentation-v3

const API_KEY  = process.env.FOOTBALL_API_KEY ?? ''
const BASE_URL = 'https://v3.football.api-sports.io'

async function apiFetch(endpoint: string) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'x-apisports-key': API_KEY,
      'x-rapidapi-key':  API_KEY,
    },
  })
  if (!res.ok) throw new Error(`API-Football error: ${res.status}`)
  return res.json()
}

// ── FIXTURE LOOKUP ────────────────────────────────────────────────
export async function findFixture(homeTeam: string, awayTeam: string, date: string) {
  // date format: YYYY-MM-DD
  const data = await apiFetch(`/fixtures?date=${date}&search=${encodeURIComponent(homeTeam)}`)
  const fixtures = data.response ?? []
  // Find best match
  return fixtures.find((f: any) => {
    const home = f.teams?.home?.name?.toLowerCase() ?? ''
    const away = f.teams?.away?.name?.toLowerCase() ?? ''
    const h    = homeTeam.toLowerCase()
    const a    = awayTeam.toLowerCase()
    return (home.includes(h) || h.includes(home)) &&
           (away.includes(a) || a.includes(away))
  }) ?? null
}

// ── MARKET VERIFICATION ───────────────────────────────────────────
// Returns 'win' | 'loss' | 'pending' | 'unverifiable'

export type VerifyResult = 'win' | 'loss' | 'pending' | 'unverifiable'

export async function verifyLeg(leg: {
  match:      string   // "Man City vs Arsenal"
  pick:       string   // "Over 2.5 goals"
  match_time: string   // ISO datetime
}): Promise<VerifyResult> {
  try {
    // Parse match teams
    const parts = leg.match.split(/\s+vs\.?\s+/i)
    if (parts.length < 2) return 'unverifiable'
    const [home, away] = parts.map(s => s.trim())
    const date = leg.match_time.split('T')[0]

    // Check if match has ended
    if (new Date(leg.match_time).getTime() > Date.now() - 2 * 60 * 60 * 1000) {
      return 'pending' // match probably not finished yet
    }

    const fixture = await findFixture(home, away, date)
    if (!fixture) return 'unverifiable'

    const status = fixture.fixture?.status?.short
    if (!['FT','AET','PEN'].includes(status)) return 'pending'

    const homeGoals = fixture.goals?.home ?? 0
    const awayGoals = fixture.goals?.away ?? 0
    const totalGoals = homeGoals + awayGoals

    // HT score
    const htHome = fixture.score?.halftime?.home ?? 0
    const htAway = fixture.score?.halftime?.away ?? 0

    const pick = leg.pick.toLowerCase().trim()

    return determineResult(pick, { homeGoals, awayGoals, totalGoals, htHome, htAway, home, away, fixture })
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

  // ── OVER/UNDER ────────────────────────────────────────────────
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

  // ── BOTH TEAMS TO SCORE ──────────────────────────────────────
  if (pick.includes('both teams') || pick.includes('btts')) {
    const btts = homeGoals > 0 && awayGoals > 0
    if (pick.includes('no') || pick.includes('not')) return btts ? 'loss' : 'win'
    return btts ? 'win' : 'loss'
  }

  // ── MATCH RESULT (1X2) ───────────────────────────────────────
  if (pick.includes('home win') || pick.match(/^1$/) || pick.includes(home.toLowerCase() + ' win')) {
    return homeGoals > awayGoals ? 'win' : 'loss'
  }
  if (pick.includes('away win') || pick.match(/^2$/) || pick.includes(away.toLowerCase() + ' win')) {
    return awayGoals > homeGoals ? 'win' : 'loss'
  }
  if (pick.includes('draw') || pick.match(/^x$/)) {
    return homeGoals === awayGoals ? 'win' : 'loss'
  }

  // ── DOUBLE CHANCE ────────────────────────────────────────────
  if (pick.includes('1x') || pick.includes('home or draw')) {
    return homeGoals >= awayGoals ? 'win' : 'loss'
  }
  if (pick.includes('x2') || pick.includes('away or draw')) {
    return awayGoals >= homeGoals ? 'win' : 'loss'
  }
  if (pick.includes('12') || pick.includes('home or away')) {
    return homeGoals !== awayGoals ? 'win' : 'loss'
  }

  // ── CLEAN SHEET ──────────────────────────────────────────────
  if (pick.includes('clean sheet')) {
    if (pick.includes(home.toLowerCase())) return awayGoals === 0 ? 'win' : 'loss'
    if (pick.includes(away.toLowerCase())) return homeGoals === 0 ? 'win' : 'loss'
    // generic — either team
    return (homeGoals === 0 || awayGoals === 0) ? 'win' : 'loss'
  }

  // ── HALF TIME RESULT ─────────────────────────────────────────
  if (pick.includes('half time') || pick.includes('ht ')) {
    if (pick.includes('draw') || pick.includes('ht draw')) return htHome === htAway ? 'win' : 'loss'
    if (pick.includes('home') || pick.includes('1')) return htHome > htAway ? 'win' : 'loss'
    if (pick.includes('away') || pick.includes('2')) return htAway > htHome ? 'win' : 'loss'
  }

  // ── HT/FT RESULT ─────────────────────────────────────────────
  if (pick.match(/ht\/ft|half.*full/)) {
    // e.g. "HT/FT Home/Home" — complex, mark unverifiable
    return 'unverifiable'
  }

  // ── HANDICAP ─────────────────────────────────────────────────
  const handicapMatch = pick.match(/([a-z\s]+)\s*([+-]\d+\.?\d*)\s*(handicap)?/)
  if (handicapMatch) {
    const team      = handicapMatch[1].trim()
    const handicap  = parseFloat(handicapMatch[2])
    const isHome    = team.includes('home') || team.toLowerCase().includes(home.toLowerCase())
    const adjustedHome = homeGoals + (isHome ? handicap : 0)
    const adjustedAway = awayGoals + (!isHome ? handicap : 0)
    if (isHome) return adjustedHome > awayGoals ? 'win' : adjustedHome === awayGoals ? 'win' : 'loss'
    return adjustedAway > homeGoals ? 'win' : adjustedAway === homeGoals ? 'win' : 'loss'
  }

  // ── EXACT SCORE ──────────────────────────────────────────────
  const exactScore = pick.match(/(\d+)\s*[-:]\s*(\d+)/)
  if (exactScore) {
    const pg = parseInt(exactScore[1]), ag = parseInt(exactScore[2])
    return homeGoals === pg && awayGoals === ag ? 'win' : 'loss'
  }

  // ── TOTAL GOALS EXACT ────────────────────────────────────────
  const totalExact = pick.match(/exactly\s+(\d+)\s+goal/)
  if (totalExact) {
    return totalGoals === parseInt(totalExact[1]) ? 'win' : 'loss'
  }

  // ── WINNING MARGIN ───────────────────────────────────────────
  const marginMatch = pick.match(/win\s+by\s+(\d+)/)
  if (marginMatch) {
    const margin = parseInt(marginMatch[1])
    const diff = Math.abs(homeGoals - awayGoals)
    return diff >= margin ? 'win' : 'loss'
  }

  // ── TEAM TO SCORE FIRST ──────────────────────────────────────
  if (pick.includes('score first') || pick.includes('first goal')) {
    // Requires goal timeline — check if API provides events
    const events = data.fixture?.events ?? []
    const firstGoal = events.find((e: any) => e.type === 'Goal')
    if (!firstGoal) return 'unverifiable'
    const scorerTeam = firstGoal.team?.name?.toLowerCase() ?? ''
    if (pick.includes(home.toLowerCase())) return scorerTeam.includes(home.toLowerCase()) ? 'win' : 'loss'
    if (pick.includes(away.toLowerCase())) return scorerTeam.includes(away.toLowerCase()) ? 'win' : 'loss'
    return 'unverifiable'
  }

  // ── PLAYER TO SCORE ──────────────────────────────────────────
  // These need goal scorer data — flag as unverifiable
  if (pick.includes('to score') && !pick.includes('both') && !pick.includes('first')) {
    return 'unverifiable'
  }

  // ── CARDS ────────────────────────────────────────────────────
  const cardMatch = pick.match(/over\s+(\d+\.?\d*)\s+card/)
  if (cardMatch) {
    const events  = data.fixture?.events ?? []
    const cards   = events.filter((e: any) => e.type === 'Card').length
    return cards > parseFloat(cardMatch[1]) ? 'win' : 'loss'
  }

  return 'unverifiable'
}

// ── BATCH VERIFY ALL LEGS OF A SLIP ──────────────────────────────
export async function verifySlip(legs: {
  id: string; match: string; pick: string; match_time: string
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
// All legs must win for the slip to win
export function calcSlipResult(legResults: VerifyResult[]): 'win' | 'loss' | 'pending' | 'unverifiable' {
  if (legResults.some(r => r === 'loss'))          return 'loss'         // any loss = slip lost
  if (legResults.some(r => r === 'pending'))        return 'pending'      // still waiting
  if (legResults.some(r => r === 'unverifiable'))   return 'unverifiable' // needs admin review
  if (legResults.every(r => r === 'win'))           return 'win'          // all won
  return 'pending'
}
