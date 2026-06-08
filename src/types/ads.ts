export type AdFormat  = 'banner' | 'text'
export type AdModel   = 'daily' | 'weekly' | 'per_click'
export type AdStatus  = 'active' | 'paused' | 'removed' | 'expired'
export type AdPlacement = 'between_cards' | 'inside_card' | 'both'

export interface Ad {
  id:            string
  // Advertiser info
  business_name: string
  contact_phone: string
  // Ad content
  format:        AdFormat
  headline:      string
  description:   string        // text ads only
  image_url:     string        // banner ads only
  cta:           string        // call to action e.g. "Bet now"
  link:          string        // where tapping takes the user
  // Placement
  placement:     AdPlacement
  // Pricing
  model:         AdModel
  rate:          number        // UGX per day / per week / per click
  budget:        number        // total UGX budget (for per_click)
  // Status
  status:        AdStatus
  clicks:        number
  impressions:   number
  spent:         number        // UGX spent so far
  // Dates
  starts_at:     string
  ends_at:       string
  created_at:    string
}

export interface AdBooking {
  business_name: string
  contact_phone: string
  format:        AdFormat
  headline:      string
  description?:  string
  image_url?:    string
  cta:           string
  link:          string
  placement:     AdPlacement
  model:         AdModel
  rate:          number
  budget?:       number
  days?:         number        // for daily/weekly model
}
