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
