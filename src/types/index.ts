// ── Core types ────────────────────────────────────────────────────

export type TipResult  = 'pending' | 'win' | 'loss'
// SubPlan removed — per-slip only model
export type SubStatus  = 'active' | 'expired' | 'refunded'
export type PayStatus  = 'pending' | 'confirmed' | 'failed' | 'refunded'
export type TickType   = 'earned' | 'paid' | null

export interface Tipster {
  id:            string
  name:          string
  username:      string       // public display name / channel identity
  phone:         string       // login identity + payout number
  description:   string
  sport:         string
  verified:      boolean
  tick_type:     TickType     // 'earned' | 'paid' | null
  created_at:    string
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

export interface Tip {
  id:          string
  tipster_id:  string
  match:       string
  pick:        string
  odds:        number
  result:      TipResult
  match_time:  string
  created_at:  string
}

export interface Subscription {
  id:           string
  tipster_id:   string
  user_phone:   string
  user_name:    string        // name filled in on Mine page
  status:       SubStatus
  amount_paid:  number
  started_at:   string
  expires_at:   string
}

export interface Payment {
  id:                string
  subscription_id:   string
  user_phone:        string
  tipster_id:        string
  gross_amount:      number
  commission_amount: number
  tipster_amount:    number   // already sent to tipster — not held
  status:            PayStatus
  at_transaction_id: string
  payout_attempts:   number
  created_at:        string
}

export interface EarningsRecord {
  id:           string
  tipster_id:   string
  amount:       number        // what landed in their Mobile Money
  source:       string        // "weekly sub" | "monthly sub"
  user_phone:   string
  created_at:   string
}
