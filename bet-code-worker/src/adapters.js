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
    // /line/football reliably renders the betslip panel (the homepage shows a
    // promo instead). The coupon-code input is hidden until "Save/load events"
    // is clicked — expandSelector does that first (confirmed 2026-06-19).
    url: 'https://1xbet.ug/en/line/football',
    expandSelector: '.coupon-loader-toggle',
    navigatesOnSubmit: true,                  // Load reloads the page to apply the coupon
    inputSelector:  'input.coupon-loader__input, input[placeholder="Event code" i]',
    // Save + Load share .coupon-loader__button; Save is theme-accent (green),
    // Load is theme-gray. Target Load by theme so we don't re-Save. (They are
    // NOT inside .coupon-loader__box; Load is disabled until a code is typed,
    // which the scraper does before clicking — so it's enabled by click time.)
    submitSelector: 'button.coupon-loader__button.ui-button--theme-gray',
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

  // ── betPawa ── confirmed 2026-06-19 (codes MZHM3IA single + V8V72AV combo loaded live) ─
  // betPawa migrated its data-test-ids from camelCase → kebab-case
  // (betslipGame→betslip-game, gameInfo→game-info, betChosen→bet-chosen),
  // which broke the old selectors. Handles BOTH single bets (bet-chosen)
  // and accumulator/combo bets (combo-legs holds the per-leg picks).
  betpawa: {
    name: 'betPawa',
    url: 'https://www.betpawa.ug/',
    inputSelector:  '#bookingCode, [data-test-id="bet-booking-code-input"]',
    submitSelector: '[data-test-id="load-betslip"]',
    waitFor:        '[data-test-id="betslip-game"]',
    resultSelector: '[data-test-id="betslip-game"]',
    rowSelector:    '[data-test-id="betslip-game"]',
    fields: {
      // eventTitleLink is the clean "Home - Away" (game-info also carries odds); CSS-module hash stripped via [class*=].
      teams:   '[class*="eventTitleLink"], [data-test-id="game-info"]',
      league:  '',                                       // not in betPawa slip
      // single bet: bet-chosen = "1X2 | Full Time - 1". combo: combo-legs = all legs' markets+picks.
      market:  '[data-test-id="bet-chosen"], [data-test-id="combo-legs"]',
      pick:    '[data-test-id="bet-chosen"], [data-test-id="combo-legs"]',
      kickoff: '',                                       // not in betPawa slip
    },
  },

  // ── Betika ── confirmed 2026-06-19 (code KkxPBu loaded live, UG site) ─
  // Betika has a first-class shared-betslip-code feature: the homepage
  // right panel asks "Do you have a shared betslip code?" and a Share button
  // produces /en-ug/share/<code>. The share URL auto-populates the betslip,
  // so we load it directly (cleanest). Each selection is a `.stacked` row
  // inside `.main-betslip`; `.stacked__link` = "Home Vs. Away",
  // `.stacked__market--odd` = the pick (e.g. "Morocco").
  betika: {
    name: 'Betika',
    url: 'https://www.betika.com/en-ug/',
    codeUrl: (code) => `https://www.betika.com/en-ug/share/${encodeURIComponent(code)}`,
    // Fallback loader (only used if codeUrl is removed): the shared-code box
    // is shown when the betslip is empty; the button text is "Load Betslip".
    inputSelector:  'input[placeholder*="VBmSU" i], input[placeholder*="betslip code" i], input[placeholder*="shared" i]',
    waitFor:        '.main-betslip .stacked, .stacked',
    resultSelector: '.main-betslip, .betslip-content, .betslip',
    rowSelector:    '.main-betslip .stacked',
    fields: {
      teams:   '.stacked__link',
      league:  '',                                 // not in betika slip
      market:  '.stacked__market span:first-child',            // the pick, e.g. "Morocco"
      pick:    '.stacked__market--odd',
      kickoff: '',                                 // unclassed in slip
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

// ── NOT SUPPORTED (investigated 2026-06-19) ──────────────────────
// These UG bookies have NO public "load a shared booking code → see the
// selections" flow, so the worker can't verify them. Deliberately omitted
// from `adapters` so /verify returns a clear "unsupported site" rather than
// silently failing. Re-evaluate only if they ship a pin-less share-code:
//   • Fortebet (fortebet.ug) — "SAVE i-TICKET" yields a short numeric code
//     (e.g. "112") meant to be taken to a counter ("report at the counter"),
//     valid ~30 min, and NOT loadable online. The public "Ticket search"
//     rejects it: "The ticket number is at least 14 digits" — it only checks
//     already-placed 14-digit tickets, which need a real (paid) bet.
//   • Championbet (championbet.ug) — "Ticket status" requires Ticket code +
//     PIN (a placed-ticket receipt); there is no public "book bet" that mints
//     a pin-less, shareable code others can load.

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
    betika:    'betika',
    sportpesa: 'sportpesa', pesa: 'sportpesa',
    mozzart:   'mozzart', mozzartbet: 'mozzart',
  }
  return adapters[alias[key] ?? key] ?? null
}

export const supportedSites = () => Object.values(adapters).map(a => a.name)
