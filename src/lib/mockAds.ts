import type { Ad } from '@/types/ads'

export const MOCK_ADS: Ad[] = [
  {
    id: 'ad1',
    business_name: 'Betway Uganda',
    contact_phone: '+256700111111',
    format: 'banner',
    headline: 'Bet smarter with Betway',
    description: '',
    image_url: '',   // placeholder — real ads use uploaded images
    cta: 'Bet now',
    link: 'https://betway.co.ug',
    placement: 'between_cards',
    model: 'weekly',
    rate: 150000,
    budget: 0,
    status: 'active',
    clicks: 142,
    impressions: 3840,
    spent: 150000,
    starts_at: '2026-05-18T00:00:00Z',
    ends_at:   '2026-05-25T00:00:00Z',
    created_at:'2026-05-17T10:00:00Z',
  },
  {
    id: 'ad2',
    business_name: 'MTN Mobile Money',
    contact_phone: '+256700222222',
    format: 'text',
    headline: 'Send money instantly with MTN MoMo',
    description: 'Pay bills, buy airtime and send money to anyone in Uganda. Fast. Safe. Easy.',
    image_url: '',
    cta: 'Learn more',
    link: 'https://mtn.co.ug/momo',
    placement: 'inside_card',
    model: 'daily',
    rate: 30000,
    budget: 0,
    status: 'active',
    clicks: 89,
    impressions: 2210,
    spent: 90000,
    starts_at: '2026-05-15T00:00:00Z',
    ends_at:   '2026-05-22T00:00:00Z',
    created_at:'2026-05-14T10:00:00Z',
  },
  {
    id: 'ad3',
    business_name: 'SportPesa Uganda',
    contact_phone: '+256700333333',
    format: 'text',
    headline: 'Win big on every match',
    description: 'Best odds on Premier League, UCL and more. Register free today.',
    image_url: '',
    cta: 'Register free',
    link: 'https://sportpesa.co.ug',
    placement: 'both',
    model: 'per_click',
    rate: 500,
    budget: 200000,
    status: 'active',
    clicks: 211,
    impressions: 4100,
    spent: 105500,
    starts_at: '2026-05-10T00:00:00Z',
    ends_at:   '2026-06-10T00:00:00Z',
    created_at:'2026-05-09T10:00:00Z',
  },
]

// Get ads for a specific placement
export function getAdsForPlacement(placement: 'between_cards' | 'inside_card'): Ad[] {
  return MOCK_ADS.filter(ad =>
    ad.status === 'active' &&
    (ad.placement === placement || ad.placement === 'both')
  )
}

// Rotate ads — pick one based on position index
export function pickAd(ads: Ad[], index: number): Ad | null {
  if (!ads.length) return null
  return ads[index % ads.length]
}

// Ad pricing display
export const AD_RATES = {
  daily:     { min: 20000,  label: 'per day',   example: 'UGX 20,000/day' },
  weekly:    { min: 100000, label: 'per week',   example: 'UGX 100,000/week' },
  per_click: { min: 300,    label: 'per click',  example: 'UGX 300/click' },
}
