// ── Bookie adapters ───────────────────────────────────────────────
// How the scraper loads a booking code on each bookie and where the
// selected matches render.
//
// Selectors marked "confirmed" were verified against real loaded-betslip
// HTML (the codes were already loaded in the captured pages). Sites with
// no capture (SportyBet, Betway) are best-effort — verify before trusting.
//
// Per site: a direct `codeUrl(code)` (best, least fragile) OR type the
// code into `inputSelector` + click `submitSelector`. `waitFor` /
// `resultSelector` = where loaded selections appear; `rowSelector` +
// `fields` extract each match. Comma-separated selectors are valid CSS
// lists (first match wins). Several bookies pack market+pick into ONE
// node ("1X2: W1") — split downstream if you need them apart; empty-string
// fields are safe (the scraper skips them) and just return "".

export const adapters = {
  // ── 1xBet ── confirmed (code KSA6G was loaded in the capture) ───
  '1xbet': {
    name: '1xBet',
    url: 'https://1xbet.ug/en/',
    inputSelector:  'input.coupon-loader__input, input[placeholder="Event code" i]',
    // Save + Load share a class; target Load (gray theme) specifically so
    // we don't click Save and load an empty coupon.
    submitSelector: '.coupon-loader__box button.ui-button--theme-gray.coupon-loader__button, .coupon-loader__box button:last-of-type',
    waitFor:        '.coupon-bets__items, li.coupon-bets__bet',
    resultSelector: '.coupon-bets__items, .coupon-bets',
    rowSelector:    'li.coupon-bets__bet, .coupon-bet--is-line',
    fields: {
      teams:   '.ui-coupon-bet-teams__link, .coupon-bet__teams',
      league:  '.ui-coupon-bet-champ__caption, .coupon-bet-header__champ', // has "NNNNNN. " id prefix
      market:  '.ui-coupon-bet-market__name',
      pick:    '.ui-coupon-bet-market__name',   // 1xbet stores the pick AS the market string ("1X2: W1")
      kickoff: '.coupon-bet__time, time',        // not in the capture — best-effort
    },
  },

  // ── 22Bet ── confirmed (code XLD6G was loaded in the capture) ───
  '22bet': {
    name: '22Bet',
    url: 'https://22bet.ug/en/',
    inputSelector:  '.cc-controls__input_text, input[placeholder="Bet slip code" i]',
    submitSelector: '#loadCodeInCoupon, .cc-controls__btn-main_upload',   // a <span>; .click() works
    waitFor:        '#all_bets section.bet-info, #bet-con section.bet-info',
    resultSelector: '#all_bets, #bet-con',
    rowSelector:    'section.bet-info',
    fields: {
      teams:   '.teams',
      league:  '.liga',                          // has "NNNNNN. " id prefix
      market:  '.type .type-name, .type-name',   // "1x2   W1" (market+pick, multi-space)
      pick:    '.type .type-name, .type-name',
      kickoff: '',                                // 22bet slip rows carry no time
    },
  },

  // ── betPawa ── confirmed (code 1K1DRRH was loaded in the capture) ─
  betpawa: {
    name: 'betPawa',
    url: 'https://www.betpawa.ug/',
    inputSelector:  '#bookingCode, [data-test-id="bet-booking-code-input"]',
    submitSelector: '[data-test-id="load-betslip"]', 
    waitFor:        '[data-test-id="betslipGame"]',
    resultSelector: '[data-test-id="betslipGame"]',
    rowSelector:    '[data-test-id="betslipGame"]',
    fields: {
      teams:   '[data-test-id="gameInfo"] a span',
      league:  '',                                // not in betPawa slip
      market:  '[data-test-id="betChosen"] span', // "1X2 | Full Time - 1" (market+pick)
      pick:    '[data-test-id="betChosen"] span',
      kickoff: '',                                // not in betPawa slip
    },
  },

  // ── SportPesa ── confirmed (code HXHWHV was loaded in the capture) ─
  sportpesa: {
    name: 'SportPesa',
    url: 'https://www.sportpesa.com/en/sports-betting/football-1/',
    inputSelector:  '[data-qa="betslip-load-input"]',
    submitSelector: '[data-qa="betslip-load-button"]',
    waitFor:        '#selected-bets-list-container, .betslip-content.has-prematch-bets',
    resultSelector: '#selected-bets-list-container',
    rowSelector:    '.betslip-content-bet',
    fields: {
      teams:   '[data-qa="selection-event-description"]',
      league:  '',                                // not in SportPesa slip
      market:  '[data-qa="selection-market"]',
      pick:    '[data-qa="selection-your-pick"]',
      kickoff: '',                                // not in SportPesa slip
    },
  },

  // ── MozzartBet ── codeUrl confirmed (numeric ticket route); result rows inferred ─
  mozzart: {
    name: 'MozzartBet',
    url: 'https://www.mozzartbet.ug/en',
    // Numeric ticket ids (e.g. 41372843) load directly via the ticket-status route.
    codeUrl: (code) => `https://www.mozzartbet.ug/en/ticket-status-sport/${encodeURIComponent(code)}`,
    inputSelector:  'input[placeholder="Ticket code | Sharecode" i], .find-ticket-shortcut input[type="text"]',
    submitSelector: 'button.find-ticket-button, .find-ticket-shortcut button[type="submit"]',
    waitFor:        '.ticket-status, [class*="ticket-status"], .ticket-details, .ticket-pairs',
    resultSelector: '.ticket-status, [class*="ticket-status"], .ticket-details',
    rowSelector:    '.ticket-pair, .ticket-row, [class*="ticket-pair"], [class*="match-row"]',
    fields: {
      teams:   '.teams, .pair-teams, .names',
      league:  '.league, .competition, .pair-league',
      market:  '.market, .game, .bet-type',
      pick:    '.pick, .outcome, .selection, .odd-name',
      kickoff: '.time, .kickoff, .match-time',
    },
  },

  // ── SportyBet ── NO capture provided; load_code URL is a known pattern, selectors UNVERIFIED.
  sportybet: {
    name: 'SportyBet',
    codeUrl: (code) => `https://www.sportybet.com/ug/sport/load_code/${encodeURIComponent(code)}`,
    waitFor:        '.m-booking, .booklet, .af-booking-detail',
    resultSelector: '.m-booking, .booklet, .af-booking-detail',
    rowSelector:    '.m-table-row, .booklet-item, .af-match',
    fields: {
      teams:   '.teams, .m-team',
      league:  '.league, .tournament',
      market:  '.market',
      pick:    '.outcome, .pick',
      kickoff: '.time, .date',
    },
  },

  // ── Betway ── NO capture provided; UNVERIFIED placeholders.
  betway: {
    name: 'Betway',
    url: 'https://www.betway.co.ug/',
    inputSelector:  'input[name="bookingCode"], input[placeholder*="booking" i]',
    submitSelector: 'button[data-load-code], button[type="submit"]',
    waitFor:        '.betslip-selections, .booking-details',
    resultSelector: '.betslip-selections, .booking-details',
    rowSelector:    '.selection, .betslip-item',
    fields: {
      teams:   '.event-name, .match-name',
      league:  '.league-name, .competition',
      market:  '.market-name',
      pick:    '.outcome-name, .selection-name',
      kickoff: '.event-time, .start-time',
    },
  },
}

// Normalise a betting-site name (e.g. "Sporty Bet", "1xBet", "22 Bet") to an adapter.
export function getAdapter(site) {
  if (!site) return null
  const key = String(site).toLowerCase().replace(/[^a-z0-9]/g, '')
  const alias = {
    sportybet: 'sportybet',
    betway:    'betway',
    '1xbet':   '1xbet', onexbet: '1xbet',
    '22bet':   '22bet', twentytwobet: '22bet',
    betpawa:   'betpawa', pawa: 'betpawa',
    sportpesa: 'sportpesa', pesa: 'sportpesa',
    mozzart:   'mozzart', mozzartbet: 'mozzart',
  }
  return adapters[alias[key] ?? key] ?? null
}

export const supportedSites = () => Object.values(adapters).map(a => a.name)
