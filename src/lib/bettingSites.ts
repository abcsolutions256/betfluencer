// Bookies the bet-code worker can load a booking/share code on — mirrors
// bet-code-worker/src/adapters.js (keep in sync). These strings are sent as
// `betting_site` to the worker's /verify; getAdapter() normalises them
// (case/spacing-insensitive), so display spelling is safe.
//
// Ordered most-reliable first: the top group is HTML-confirmed against real
// loaded slips; SportyBet/Betway are best-effort (unverified).
export const BETTING_SITES = [
  'Betika',
  'betPawa',
  '1xBet',
  '22Bet',
  'SportPesa',
  'MozzartBet',
  'SportyBet',
  'Betway',
] as const

// Display-only bookies for markets the bet-code worker has NO adapter for yet
// (e.g. Brazil). These are NOT verifiable by the worker — safe during the free
// open beta, where coded slips are not scraped (payments_enabled=false). Before
// turning payments on for a market that uses these, add matching worker adapters
// in bet-code-worker/src/adapters.js and move the site into BETTING_SITES.
export const DISPLAY_ONLY_SITES = [
  'Betano',
  'Superbet',
  'Sportingbet',
  'Stake',
  'KTO',
  'Betfair',
  'EstrelaBet',
  'Bet365',
] as const

// Every bookie name the app may display across all markets.
const KNOWN_SITES = [...BETTING_SITES, ...DISPLAY_ONLY_SITES] as const

export type BettingSite = (typeof BETTING_SITES)[number] | (typeof DISPLAY_ONLY_SITES)[number]

/**
 * The ordered site list for a market: the country's own preference list
 * (countries.betting_sites), filtered to KNOWN_SITES and de-duplicated, in the
 * country's order. Unknown names are ignored (a countries-table typo can't
 * surface an unsupported bookie). With no/empty preference it falls back to the
 * canonical worker-supported list (today's UG default).
 *
 * NOTE: this returns ONLY the market's declared sites — it no longer appends
 * every other bookie. Existing markets are unaffected (each lists the full
 * pan-African set); new markets (Brazil) show their own bookies instead of
 * inheriting the African ones.
 */
export function orderSitesForCountry(preference: string[] | null | undefined): BettingSite[] {
  if (!preference?.length) return [...BETTING_SITES]
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  const byNorm = new Map<string, BettingSite>(KNOWN_SITES.map(s => [norm(s), s]))
  const picked: BettingSite[] = []
  for (const p of preference) {
    const hit = byNorm.get(norm(p))
    if (hit && !picked.includes(hit)) picked.push(hit)
  }
  return picked.length ? picked : [...BETTING_SITES]
}
