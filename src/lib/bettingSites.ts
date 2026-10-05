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

export type BettingSite = (typeof BETTING_SITES)[number]

/**
 * Order the canonical site list for a market: the country's preference
 * order (countries.betting_sites) first, then every remaining site in
 * canonical order. Sites are REORDERED, never removed — all bookies the
 * worker supports stay selectable in every market — and unknown names in
 * the preference list are ignored, so a countries-table typo can't make
 * an unsupported site appear. With no/empty preference (or UG, whose
 * preference equals the canonical order) this returns BETTING_SITES
 * unchanged — today's exact behaviour.
 */
export function orderSitesForCountry(preference: string[] | null | undefined): BettingSite[] {
  const canonical = [...BETTING_SITES]
  if (!preference?.length) return canonical
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
  const byNorm = new Map(canonical.map(s => [norm(s), s]))
  const first: BettingSite[] = []
  for (const p of preference) {
    const hit = byNorm.get(norm(p))
    if (hit && !first.includes(hit)) first.push(hit)
  }
  return [...first, ...canonical.filter(s => !first.includes(s))]
}
