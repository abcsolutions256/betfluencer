export type SlipResult  = 'pending' | 'win' | 'loss' | 'void'
export type PostingMode = 'manual' | 'screenshot' | 'booking_code'

export interface SlipLeg {
  id:              string
  match:           string
  league:          string
  pick:            string
  odds:            number
  match_time:      string
  result:          SlipResult
  market?:         string
  market_subject?: string           // team/player the pick applies to ('match' = whole match)
  side?:           string | null    // over | under | yes | no | home | draw | away | null
  line?:           number | null    // numeric threshold (e.g. 0.5) or null
}

export interface Betslip {
  id:                    string
  tipster_id:            string
  posting_mode:          PostingMode
  legs:                  SlipLeg[]
  total_odds:            number
  leg_count:             number
  result:                SlipResult
  posted_at:             string
  settled_at?:           string | null   // when result was last set to win/loss/void
  note?:                 string
  slip_price:            number
  slip_image_url?:       string
  result_image_url?:     string
  result_proof_pending?: boolean
  booking_code?:         string
  betting_site?:         string
  locked?:               boolean   // server gate: true = paid content stripped
  verification_status?:  'pending' | 'verified' | 'failed' | 'rejected'
  game_count?:           number
  leagues?:              string[]  // proof (no teams/picks)
  markets?:              string[]
  earliest_kickoff?:     string
}

export const ODDS_FILTERS = [
  { label: 'All',      min: 0,   max: Infinity },
  { label: 'Odd 1',   min: 1.0, max: 1.99 },
  { label: 'Odd 2',   min: 2.0, max: 2.99 },
  { label: 'Odd 3',   min: 3.0, max: 3.99 },
  { label: 'Odd 4',   min: 4.0, max: 4.99 },
  { label: 'Odd 5',   min: 5.0, max: 9.99 },
  { label: 'Odd 10+', min: 10,  max: Infinity },
]

export function getOddsFilter(label: string) {
  return ODDS_FILTERS.find(f => f.label === label) ?? ODDS_FILTERS[0]
}

export function parseOddsQuery(query: string): { min: number; max: number } | null {
  const match = query.toLowerCase().match(/odds?\s*(\d+\.?\d*)/)
  if (!match) return null
  const n = parseFloat(match[1])
  return { min: n, max: n + 0.99 }
}

export function getRiskLabel(odds: number): { label: string; color: string; bg: string } {
  if (odds < 3)  return { label: 'Low risk',  color: 'var(--green)', bg: 'var(--green-lt)' }
  if (odds < 8)  return { label: 'Medium',    color: 'var(--gold)',  bg: 'var(--gold-lt)'  }
  if (odds < 15) return { label: 'High risk', color: 'var(--red)',   bg: 'var(--red-lt)'   }
  return              { label: 'Very high', color: 'var(--red)',   bg: 'var(--red-lt)'   }
}