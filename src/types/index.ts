// ── Core types ────────────────────────────────────────────────────

export type TipResult = 'pending' | 'win' | 'loss'
export type TickType  = 'earned' | 'paid' | null

export interface Tipster {
  id:          string
  name:        string
  username:    string       // public display name / channel identity
  phone:       string       // login identity + payout number
  description: string
  sport:       string
  verified:    boolean
  tick_type:   TickType
  created_at:  string
}

export interface TipsterPublic {
  id:               string
  name:             string
  username:         string
  description:      string
  sport:            string
  verified:         boolean
  tick_type:        TickType
  subscriber_count: number
  wins_last_10:     number
  avg_odds:         number
  score:            number
}

// Client-side notification shape only (localStorage — see useNotifications).
// Not a DB table; tips are stored as `betslips` + `betslip_legs`.
export interface Tip {
  id:         string
  tipster_id: string
  match:      string
  pick:       string
  odds:       number
  result:     TipResult
  match_time: string
  created_at: string
}
