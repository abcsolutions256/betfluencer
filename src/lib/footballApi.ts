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

// ── Plan-aware fixture window ──────────────────────────────────────
// Free tier can only fetch ~yesterday→+2 days. After upgrading, set
// FOOTBALL_API_PLAN=paid (or widen FOOTBALL_API_WINDOW_BACK_DAYS) and older
// matches resolve by date too — no code change needed. Forward window stays
// small (we only settle finished matches).
const PLAN             = (process.env.FOOTBALL_API_PLAN ?? 'free').toLowerCase()
const WINDOW_BACK_DAYS = Number(process.env.FOOTBALL_API_WINDOW_BACK_DAYS ?? (PLAN === 'paid' ? 400 : 1))
const WINDOW_FWD_DAYS  = Number(process.env.FOOTBALL_API_WINDOW_FWD_DAYS  ?? 2)

const dayStr = (ms: number) => new Date(ms).toISOString().split('T')[0]

// Is a fixture date within the current plan's fetchable window?
function planAllowsDate(date: string): boolean {
  const t = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(t)) return false
  const now = Date.now()
  return t >= now - WINDOW_BACK_DAYS * 86400000 && t <= now + WINDOW_FWD_DAYS * 86400000
}

// One fixtures-by-date request, cached per settlement run so a date is fetched
// at most once and shared across every leg — keeps us under the daily quota.
export type FixtureCache = Map<string, any[]>
async function getFixturesByDate(date: string, cache?: FixtureCache): Promise<any[]> {
  if (cache?.has(date)) return cache.get(date)!
  const data = await apiFetch(`/fixtures?date=${date}`)
  const fixtures = data.response ?? []
  cache?.set(date, fixtures)
  return fixtures
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
export async function findFixture(homeTeam: string, awayTeam: string, date: string | null, cache?: FixtureCache) {
  const now = Date.now()
  let datesToTry: string[]
  if (date) {
    // A known date: fetch it only if the plan can reach it (else give up —
    // older-than-window matches need a paid plan or manual settlement).
    if (!planAllowsDate(date)) return null
    datesToTry = [date]
  } else {
    // No date — best-effort over the recent few days (kept small to limit
    // request fan-out; the cache dedupes repeats across legs).
    datesToTry = []
    for (let d = -1; d <= WINDOW_FWD_DAYS; d++) datesToTry.push(dayStr(now + d * 86400000))
  }

  for (const tryDate of datesToTry) {
    try {
      const fixtures = await getFixturesByDate(tryDate, cache)
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

// Structured market data captured by the screenshot parser (nullable on legacy
// rows / booking-code legs — those fall back to grading off the pick string).
export interface LegMeta {
  market?:         string | null
  market_subject?: string | null
  side?:           string | null
  line?:           number | string | null
}

// Verify by fixture object (already fetched)
export function verifyLegAgainstFixture(pick: string, fixture: any, meta?: LegMeta): VerifyResult {
  const status = fixture.fixture?.status?.short
  if (!['FT','AET','PEN'].includes(status)) return 'pending'

  const homeGoals  = fixture.goals?.home ?? 0
  const awayGoals  = fixture.goals?.away ?? 0
  const totalGoals = homeGoals + awayGoals
  const htHome     = fixture.score?.halftime?.home ?? 0
  const htAway     = fixture.score?.halftime?.away ?? 0
  const home       = fixture.teams?.home?.name ?? ''
  const away       = fixture.teams?.away?.name ?? ''

  return determineResult(pick.toLowerCase().trim(), { homeGoals, awayGoals, totalGoals, htHome, htAway, home, away, fixture }, meta)
}

export interface LegVerifyResult { result: VerifyResult; fixtureId: number | null }

export async function verifyLeg(leg: {
  match:           string
  pick:            string
  match_time:      string | null
  fixture_id?:     number | string | null
  market?:         string | null
  market_subject?: string | null
  side?:           string | null
  line?:           number | string | null
}, cache?: FixtureCache): Promise<LegVerifyResult> {
  const toId = (v: any) => (typeof v === 'number' ? v : v ? Number(v) || null : null)
  const meta: LegMeta = { market: leg.market, market_subject: leg.market_subject, side: leg.side, line: leg.line }
  try {
    // If we already stored a fixture_id, verify directly by ID (most reliable
    // and quota-light — works for older matches the date window can't reach).
    if (leg.fixture_id) {
      const fixture = await getFixtureById(leg.fixture_id)
      if (!fixture) return { result: 'pending', fixtureId: toId(leg.fixture_id) }
      return { result: verifyLegAgainstFixture(leg.pick, fixture, meta), fixtureId: fixture.fixture?.id ?? toId(leg.fixture_id) }
    }

    // Otherwise resolve by teams + date
    const parts = leg.match.split(/\s+vs\.?\s+/i)
    if (parts.length < 2) return { result: 'unverifiable', fixtureId: null }
    const [home, away] = parts.map(s => s.trim())

    const date = leg.match_time ? leg.match_time.split('T')[0] : null

    if (leg.match_time && new Date(leg.match_time).getTime() > Date.now() - 2 * 60 * 60 * 1000) {
      return { result: 'pending', fixtureId: null }
    }

    const fixture = await findFixture(home, away, date, cache)
    if (!fixture) return { result: 'unverifiable', fixtureId: null }

    // Capture the resolved id so the caller can persist it → next run settles
    // this leg by ID (cheap + works even once it drops out of the date window).
    return { result: verifyLegAgainstFixture(leg.pick, fixture, meta), fixtureId: fixture.fixture?.id ?? null }
  } catch (err) {
    console.error('verifyLeg error:', err)
    return { result: 'unverifiable', fixtureId: null }
  }
}

function determineResult(pick: string, data: {
  homeGoals: number; awayGoals: number; totalGoals: number
  htHome: number; htAway: number; home: string; away: string; fixture: any
}, meta?: LegMeta): VerifyResult {
  const { homeGoals, awayGoals, totalGoals, htHome, htAway, home, away } = data

  // betPawa "1X2 1UP" settles the instant the pick goes one goal ahead — a team
  // can lead 1-0, lose 1-2, and the bet still WON. The final score can't grade
  // it, so never auto-settle; leave it for an admin to settle manually.
  if (/\b1\s*up\b/.test(pick)) return 'unverifiable'

  // TEAM TOTAL — "Croatia Over 0.5 Goals" means CROATIA's goals, not the match
  // total. Must run BEFORE the generic over/under below (which uses totalGoals
  // and would otherwise mis-grade this). Grades off the subject team's goals.
  if (meta?.market === 'team_total') {
    const subject = meta.market_subject ?? ''
    // Line: prefer the parsed field, else pull the first number out of the pick.
    const rawLine = meta.line != null && meta.line !== '' ? Number(meta.line)
      : (pick.match(/(\d+\.?\d*)/)?.[1] ? parseFloat(pick.match(/(\d+\.?\d*)/)![1]) : NaN)
    // Side: prefer the parsed field, else infer from the pick text.
    let side = (meta.side ?? '').toLowerCase()
    if (side !== 'over' && side !== 'under') {
      if (pick.includes('over'))  side = 'over'
      else if (pick.includes('under')) side = 'under'
    }
    // Resolve the subject to home or away (must be unambiguous).
    const isHome = subject ? teamsMatch(home, subject) : false
    const isAway = subject ? teamsMatch(away, subject) : false
    if (!subject || Number.isNaN(rawLine) || (side !== 'over' && side !== 'under') || isHome === isAway) {
      return 'unverifiable'   // can't confidently grade → leave for manual settle
    }
    const teamGoals = isHome ? homeGoals : awayGoals
    return side === 'over'
      ? (teamGoals > rawLine ? 'win' : 'loss')
      : (teamGoals < rawLine ? 'win' : 'loss')
  }

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
// Sequential (not Promise.all) so the per-date cache is populated before the
// next leg checks it — legs sharing a date then cost a single request.
export async function verifySlip(legs: {
  id: string; match: string; pick: string; match_time: string | null; fixture_id?: number | string | null
  market?: string | null; market_subject?: string | null; side?: string | null; line?: number | string | null
}[], cache?: FixtureCache): Promise<{ id: string; result: VerifyResult; fixtureId: number | null }[]> {
  const c = cache ?? new Map<string, any[]>()
  const results: { id: string; result: VerifyResult; fixtureId: number | null }[] = []
  for (const leg of legs) {
    const r = await verifyLeg(leg, c)
    results.push({ id: leg.id, result: r.result, fixtureId: r.fixtureId })
  }
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