export type SlipResult  = 'pending' | 'win' | 'loss'
export type PostingMode = { posting_mode: 'manual' | 'screenshot' | 'booking_code' }

export interface SlipLeg {
  id:         string
  match:      string
  league:     string
  pick:       string
  odds:       number
  match_time: string
  result:     SlipResult
  market?:    string   // market type for auto-verification
}

export interface Betslip {
  id:               string
  tipster_id:       string
  posting_mode:     PostingMode
  legs:             SlipLeg[]        // populated for manual mode
  total_odds:       number
  leg_count:        number           // for screenshot mode
  result:           SlipResult
  posted_at:        string
  note?:            string
  slip_price:       number
  slip_image_url?:  string           // screenshot of the betslip
  result_image_url?: string          // screenshot of result (win/loss proof)
  result_proof_pending?: boolean     // screenshot mode, result not yet uploaded
  booking_code?:    string           // booking code for code-based slips
  betting_site?:    string           // which betting platform
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
