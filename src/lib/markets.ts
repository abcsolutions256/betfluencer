// ── Betting market types ──────────────────────────────────────────

export interface Market {
  id:          string
  label:       string
  category:    'auto' | 'manual'   // auto = API can verify, manual = admin reviews
  description: string
  example:     string
}

export const MARKETS: Market[] = [
  // ── AUTO-VERIFIABLE ───────────────────────────────────────────
  { id: 'match_result',    label: 'Match result (1X2)',       category: 'auto',   description: 'Home win, draw, or away win',             example: 'Man City win'          },
  { id: 'over_under',      label: 'Over/Under goals',         category: 'auto',   description: 'Total goals over or under a line',        example: 'Over 2.5 goals'        },
  { id: 'btts',            label: 'Both teams to score',      category: 'auto',   description: 'Both teams score at least one goal',      example: 'BTTS Yes'              },
  { id: 'double_chance',   label: 'Double chance',            category: 'auto',   description: 'Two of three possible outcomes',          example: 'Home or Draw (1X)'     },
  { id: 'handicap',        label: 'Handicap',                 category: 'auto',   description: 'Result after applying goal handicap',     example: 'Man City -1 handicap'  },
  { id: 'ht_result',       label: 'Half time result',         category: 'auto',   description: 'Result at half time only',                example: 'Arsenal HT win'        },
  { id: 'clean_sheet',     label: 'Clean sheet',              category: 'auto',   description: 'Team keeps a clean sheet',                example: 'Liverpool clean sheet' },
  { id: 'exact_score',     label: 'Correct score',            category: 'auto',   description: 'Exact final scoreline',                   example: '2-1'                   },
  { id: 'score_first',     label: 'Team to score first',      category: 'auto',   description: 'Which team scores the opening goal',      example: 'Chelsea to score first'},
  { id: 'win_margin',      label: 'Winning margin',           category: 'auto',   description: 'Win by exactly N goals',                  example: 'Win by 2+ goals'       },
  { id: 'total_cards',     label: 'Total cards',              category: 'auto',   description: 'Over/under total cards in the match',     example: 'Over 3.5 cards'        },

  // ── MANUAL (admin reviews) ────────────────────────────────────
  { id: 'player_score',    label: 'Player to score',          category: 'manual', description: 'Specific player scores anytime',         example: 'Salah to score'        },
  { id: 'player_first',    label: 'Player to score first',    category: 'manual', description: 'Specific player scores the first goal',  example: 'Mbappe first scorer'   },
  { id: 'player_assist',   label: 'Player to assist',         category: 'manual', description: 'Specific player provides an assist',     example: 'De Bruyne to assist'   },
  { id: 'player_card',     label: 'Player to be carded',      category: 'manual', description: 'Specific player receives a card',        example: 'Pepe to be booked'     },
  { id: 'anytime_scorer',  label: 'Anytime scorer',           category: 'manual', description: 'Player scores at any point',             example: 'Haaland anytime'       },
  { id: 'corners',         label: 'Total corners',            category: 'manual', description: 'Over/under total corners',               example: 'Over 9.5 corners'      },
  { id: 'asian_handicap',  label: 'Asian handicap',           category: 'manual', description: 'Quarter-ball Asian handicap lines',      example: 'Man City -1.5 AH'      },
  { id: 'other',           label: 'Other',                    category: 'manual', description: 'Any market not listed above',            example: ''                      },
]

export const AUTO_MARKETS   = MARKETS.filter(m => m.category === 'auto')
export const MANUAL_MARKETS = MARKETS.filter(m => m.category === 'manual')

export function getMarket(id: string) {
  return MARKETS.find(m => m.id === id) ?? MARKETS.find(m => m.id === 'other')!
}

export function isAutoVerifiable(marketId: string): boolean {
  return getMarket(marketId).category === 'auto'
}
