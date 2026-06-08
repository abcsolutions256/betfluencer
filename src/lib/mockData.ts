import type { TipsterPublic, Tip, Subscription } from '@/types'

export const MOCK_TIPSTERS: TipsterPublic[] = [
  {
    id: '1', name: 'Enzo Kampala', username: 'EnzoKampala',
    description: 'Data-driven picks. High odds, high precision.',
    sport: 'Premier League · Champions League',
    verified: true, tick_type: 'earned',
    subscriber_count: 2840, wins_last_10: 7, avg_odds: 2.4, score: 16.8,
  },
  {
    id: '2', name: 'Nairobi King', username: 'NairobiKing',
    description: 'Premier League specialist since 2019.',
    sport: 'Premier League only',
    verified: true, tick_type: 'paid',
    subscriber_count: 1420, wins_last_10: 7, avg_odds: 2.1, score: 14.7,
  },
  {
    id: '3', name: 'StatAttack', username: 'StatAttack',
    description: 'Stats-based, consistent returns across all European leagues.',
    sport: 'All European leagues',
    verified: false, tick_type: null,
    subscriber_count: 3910, wins_last_10: 7, avg_odds: 1.9, score: 13.3,
  },
  {
    id: '4', name: 'BetWise UG', username: 'BetWiseUG',
    description: 'Local Uganda Premier League expert.',
    sport: 'AFCON · UPL · Premier League',
    verified: false, tick_type: null,
    subscriber_count: 980, wins_last_10: 6, avg_odds: 2.2, score: 13.2,
  },
]

export const MOCK_TIPS: Record<string, Tip[]> = {
  '1': [
    { id:'t1', tipster_id:'1', match:'Man City vs Arsenal',   pick:'Over 2.5 goals',      odds:2.10, result:'win',     match_time:'2026-05-19T19:45:00Z', created_at:'2026-05-19T10:00:00Z' },
    { id:'t2', tipster_id:'1', match:'PSG vs Lyon',           pick:'PSG -1 handicap',     odds:2.30, result:'pending', match_time:'2026-05-19T21:00:00Z', created_at:'2026-05-19T09:00:00Z' },
    { id:'t3', tipster_id:'1', match:'Liverpool vs Chelsea',  pick:'Liverpool win',        odds:2.05, result:'win',     match_time:'2026-05-18T19:45:00Z', created_at:'2026-05-18T10:00:00Z' },
    { id:'t4', tipster_id:'1', match:'Bayern vs Dortmund',    pick:'Both teams to score',  odds:1.75, result:'loss',    match_time:'2026-05-18T18:30:00Z', created_at:'2026-05-18T09:00:00Z' },
    { id:'t5', tipster_id:'1', match:'Real Madrid vs Sevilla',pick:'Real Madrid win',      odds:1.65, result:'win',     match_time:'2026-05-17T20:00:00Z', created_at:'2026-05-17T10:00:00Z' },
  ],
  '2': [
    { id:'t6', tipster_id:'2', match:'Spurs vs Everton',     pick:'Spurs win & BTTS',    odds:2.60, result:'win',  match_time:'2026-05-18T14:00:00Z', created_at:'2026-05-18T08:00:00Z' },
    { id:'t7', tipster_id:'2', match:'Man Utd vs Newcastle', pick:'Draw',                 odds:3.20, result:'loss', match_time:'2026-05-17T16:30:00Z', created_at:'2026-05-17T08:00:00Z' },
  ],
  '3': [
    { id:'t9',  tipster_id:'3', match:'Barcelona vs Atletico',pick:'Draw',                odds:3.40, result:'win',     match_time:'2026-05-19T19:00:00Z', created_at:'2026-05-19T08:00:00Z' },
    { id:'t10', tipster_id:'3', match:'Juventus vs Inter',    pick:'Both teams to score', odds:1.85, result:'pending', match_time:'2026-05-19T20:45:00Z', created_at:'2026-05-19T07:00:00Z' },
  ],
  '4': [
    { id:'t12', tipster_id:'4', match:'KCCA vs Express FC',  pick:'KCCA win',            odds:2.10, result:'win',     match_time:'2026-05-19T16:00:00Z', created_at:'2026-05-19T08:00:00Z' },
  ],
}

export const MOCK_SUBS: (Subscription & { tipster: TipsterPublic })[] = [
  {
    id:'s1', tipster_id:'1', user_phone:'+256700000099', user_name:'James Okello',
    status:'active', amount_paid:8000,
    started_at:'2026-05-12T00:00:00Z', expires_at:'2026-05-26T00:00:00Z',
    tipster: MOCK_TIPSTERS[0],
  },
  {
    id:'s2', tipster_id:'3', user_phone:'+256700000099', user_name:'James Okello',
    status:'active', amount_paid:16000,
    started_at:'2026-05-01T00:00:00Z', expires_at:'2026-06-01T00:00:00Z',
    tipster: MOCK_TIPSTERS[2],
  },
]

// Mock earnings log — money already sent, just the receipt
export const MOCK_EARNINGS = [
  { id:'e1', tipster_id:'1', amount:7200,  gross:8000,  commission:800,  user_phone:'+256700000099', created_at:'2026-05-19T09:14:00Z' },
  { id:'e2', tipster_id:'1', amount:22500, gross:25000, commission:2500, user_phone:'+256700000088', created_at:'2026-05-18T14:22:00Z' },
  { id:'e3', tipster_id:'1', amount:7200,  gross:8000,  commission:800,  user_phone:'+256700000077', created_at:'2026-05-17T11:05:00Z' },
]

export function getTipsterBySlug(slug: string): TipsterPublic | undefined {
  return MOCK_TIPSTERS.find(t => t.username.toLowerCase() === slug.toLowerCase() || t.id === slug)
}
export function getTipsForTipster(id: string): Tip[] { return MOCK_TIPS[id] ?? [] }
export function getSubsForPhone(phone: string) { return MOCK_SUBS.filter(s => s.user_phone === phone) }

// ── MOCK BETSLIPS ────────────────────────────────────────────────
import type { Betslip } from '@/types/betslip'

export const MOCK_BETSLIPS: Record<string, Betslip[]> = {
  '1': [
    {
      id: 'bs1', tipster_id: '1', result: 'pending', posted_at: '2026-05-21T09:14:00Z',
      posting_mode: 'screenshot' as const, total_odds: 12.40, slip_price: 3000, leg_count: 4, slip_image_url: '', result_proof_pending: true,
      legs: [
        { id:'l1', match:'Man City vs Arsenal',   league:'Premier League', pick:'Over 2.5 goals',    odds:1.95, match_time:'2026-05-21T19:45:00Z', result:'win'     },
        { id:'l2', match:'Liverpool vs Chelsea',  league:'Premier League', pick:'Liverpool win',      odds:2.10, match_time:'2026-05-21T17:30:00Z', result:'win'     },
        { id:'l3', match:'Real Madrid vs Sevilla',league:'La Liga',        pick:'Real Madrid win',    odds:1.65, match_time:'2026-05-21T20:00:00Z', result:'win'     },
        { id:'l4', match:'PSG vs Lyon',           league:'Ligue 1',        pick:'PSG -1 handicap',   odds:1.85, match_time:'2026-05-21T21:00:00Z', result:'pending' },
      ]
    },
    {
      id: 'bs2', tipster_id: '1', result: 'win', posted_at: '2026-05-21T09:14:00Z',
      posting_mode: 'manual' as const, total_odds: 3.25, slip_price: 1000, leg_count: 3,
      legs: [
        { id:'l5', match:'Man City vs Arsenal',   league:'Premier League', pick:'Both teams score',   odds:1.75, match_time:'2026-05-21T19:45:00Z', result:'win' },
        { id:'l6', match:'Liverpool vs Chelsea',  league:'Premier League', pick:'Over 1.5 goals',     odds:1.40, match_time:'2026-05-21T17:30:00Z', result:'win' },
        { id:'l7', match:'Bayern vs Dortmund',    league:'Bundesliga',     pick:'Bayern win',          odds:1.55, match_time:'2026-05-21T18:30:00Z', result:'win' },
      ]
    },
    {
      id: 'bs3', tipster_id: '1', result: 'pending', posted_at: '2026-05-21T09:14:00Z',
      posting_mode: 'manual' as const, total_odds: 28.60, slip_price: 5000, leg_count: 5,
      legs: [
        { id:'l8',  match:'Man City vs Arsenal',   league:'Premier League', pick:'Man City win & Over 3.5', odds:3.20, match_time:'2026-05-21T19:45:00Z', result:'pending' },
        { id:'l9',  match:'Barcelona vs Atletico', league:'La Liga',        pick:'Barcelona win',            odds:2.10, match_time:'2026-05-21T20:00:00Z', result:'pending' },
        { id:'l10', match:'Inter vs AC Milan',     league:'Serie A',        pick:'Inter win & BTTS',         odds:2.80, match_time:'2026-05-21T20:45:00Z', result:'pending' },
        { id:'l11', match:'PSG vs Lyon',           league:'Ligue 1',        pick:'PSG win & Over 2.5',       odds:1.95, match_time:'2026-05-21T21:00:00Z', result:'pending' },
        { id:'l12', match:'KCCA vs Express FC',    league:'UPL',            pick:'KCCA win',                 odds:2.10, match_time:'2026-05-21T16:00:00Z', result:'pending' },
      ]
    },
    {
      id: 'bs4', tipster_id: '1', result: 'loss', posted_at: '2026-05-20T14:22:00Z',
      posting_mode: 'screenshot' as const, total_odds: 8.75, slip_price: 2000, leg_count: 3, slip_image_url: '', result_image_url: '',
      legs: [
        { id:'l13', match:'Bayern vs Dortmund',    league:'Bundesliga',     pick:'BTTS',              odds:1.75, match_time:'2026-05-20T18:30:00Z', result:'win'  },
        { id:'l14', match:'Barcelona vs Atletico', league:'La Liga',        pick:'Draw',               odds:3.40, match_time:'2026-05-20T20:00:00Z', result:'loss' },
        { id:'l15', match:'Juventus vs Inter',     league:'Serie A',        pick:'Over 2.5',           odds:1.85, match_time:'2026-05-20T20:45:00Z', result:'win'  },
      ]
    },
  ],
  '2': [
    {
      id: 'bs5', tipster_id: '2', result: 'win', posted_at: '2026-05-21T08:00:00Z',
      posting_mode: 'manual' as const, total_odds: 4.60, slip_price: 1500, leg_count: 2,
      legs: [
        { id:'l16', match:'Spurs vs Everton',      league:'Premier League', pick:'Spurs win & BTTS',  odds:2.60, match_time:'2026-05-21T14:00:00Z', result:'win' },
        { id:'l17', match:'Wolves vs Brentford',   league:'Premier League', pick:'Under 2.5',         odds:1.80, match_time:'2026-05-21T14:00:00Z', result:'win' },
      ]
    },
  ],
  '3': [
    {
      id: 'bs6', tipster_id: '3', result: 'pending', posted_at: '2026-05-21T07:00:00Z',
      posting_mode: 'manual' as const, total_odds: 6.30, slip_price: 2000, leg_count: 2,
      legs: [
        { id:'l18', match:'Barcelona vs Atletico', league:'La Liga',        pick:'Draw',               odds:3.40, match_time:'2026-05-21T19:00:00Z', result:'pending' },
        { id:'l19', match:'Juventus vs Inter',     league:'Serie A',        pick:'BTTS',               odds:1.85, match_time:'2026-05-21T20:45:00Z', result:'pending' },
      ]
    },
  ],
}

export function getBetslipsForTipster(tipsterId: string): Betslip[] {
  return MOCK_BETSLIPS[tipsterId] ?? []
}
