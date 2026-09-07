// ── Per-country About-page content ─────────────────────────────────
// The About page copy varies by market (currency, betting sites, local
// leagues, payment rails). Source of truth is `countries.about_content`
// (jsonb, migration 0012) so copy can be edited without a deploy; the
// ABOUT_CONTENT map below is the seed AND the fallback — if the column
// is missing (migration not yet applied), the fetch fails, or the row
// is null, each market still renders from code. UG's entry is the
// pre-expansion About copy verbatim, so Uganda can never change from
// this system existing.
//
// Country-neutral sections (verification, contact) stay hardcoded in
// src/app/about/page.tsx.
//
// NOTE for tooling: scripts/generate-about-seed.js eval()s the object
// literal assigned to ABOUT_CONTENT to emit the migration seed SQL —
// keep the const LAST in this file and keep its body pure data
// (strings/arrays/objects only).

export type AboutContent = {
  meta: {
    title: string
    description: string
    keywords: string
    ogTitle: string
    ogDescription: string
    ogUrl: string
  }
  heroTitle: string[] // h1 lines
  heroIntro: string
  heroChips: string[]
  whatHeading: string
  whatParas: string[]
  bettorSteps: { title: string; desc: string }[]
  tipsterIntro: string
  tipsterSteps: { title: string; desc: string }[]
  paymentsHeading: string
  paymentsIntro: string
  paymentsRows: { label: string; val: string }[]
  coverageIntro: string
  coverageRegions: { region: string; leagues: string[] }[]
  companyHeading: string
  companyParas: string[]
  faq: { q: string; a: string }[]
}

function isAboutContent(v: unknown): v is AboutContent {
  const c = v as AboutContent
  return (
    !!c && typeof c === 'object' &&
    typeof c.meta?.title === 'string' &&
    Array.isArray(c.heroTitle) &&
    Array.isArray(c.whatParas) &&
    Array.isArray(c.bettorSteps) &&
    Array.isArray(c.paymentsRows) &&
    Array.isArray(c.faq)
  )
}

// ── DB-first loading (60s cache per code, code-map fallback) ───────
// Same edge-safe REST pattern as loadCountries() in country.ts. Only
// the About page calls this, so the (potentially large) jsonb never
// rides along in the middleware's country cache.

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { at: number; content: AboutContent }>()

export async function getAboutContent(code: string | null | undefined): Promise<AboutContent> {
  const norm = (code ?? '').trim().toUpperCase()
  const fallback = ABOUT_CONTENT[norm] ?? ABOUT_CONTENT.UG
  if (!ABOUT_CONTENT[norm]) return fallback // unknown market → UG, no fetch

  const hit = cache.get(norm)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.content

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return fallback

  try {
    const res = await fetch(
      `${url}/rest/v1/countries?code=eq.${norm}&select=about_content`,
      { headers: { apikey: key, authorization: `Bearer ${key}` }, cache: 'no-store' },
    )
    if (!res.ok) throw new Error(`about_content fetch → ${res.status}`)
    const rows = (await res.json()) as { about_content: unknown }[]
    const dbContent = rows?.[0]?.about_content
    const content = isAboutContent(dbContent) ? dbContent : fallback
    cache.set(norm, { at: Date.now(), content })
    return content
  } catch {
    // column not migrated yet / network error → code copy, never a crash
    return fallback
  }
}

// ── Content map: seed + fallback. UG is verbatim pre-expansion copy. ──

export const ABOUT_CONTENT: Record<string, AboutContent> = {
  UG: {
    meta: {
      title: 'About Betfluencer — Uganda\'s Football Tipster Marketplace',
      description: 'Betfluencer is Uganda\'s first marketplace connecting football betting tipsters with bettors. Discover verified tipsters, buy betslips, and bet smarter with real win-rate data.',
      keywords: 'betfluencer, football tips uganda, betting tipsters uganda, sports betting uganda, betpawa tips, mtn mobile money betting',
      ogTitle: 'About Betfluencer',
      ogDescription: 'Uganda\'s first football tipster marketplace. Buy betslips from verified tipsters and bet smarter.',
      ogUrl: 'https://betfluencer.org/about',
    },
    heroTitle: ['Uganda\'s football', 'tipster marketplace'],
    heroIntro: 'Betfluencer connects football bettors with Uganda\'s best tipsters. Browse betslips, check win rates, pay per slip, and bet smarter — all in one place.',
    heroChips: ['MTN Mobile Money', 'Airtel Money', 'Uganda Premier League', 'Premier League', 'Champions League'],
    whatHeading: 'The smartest way to bet in Uganda',
    whatParas: [
      'Betfluencer is a two-sided marketplace built specifically for the Ugandan betting market. On one side, skilled football tipsters post their betslips — complete with booking codes, odds, and their verified win record. On the other side, bettors browse those slips, pay only for the ones they want, and place their bets with more confidence.',
      'We do not place bets for you. We do not hold your money. We simply connect you with tipsters who have a proven track record, and let you decide who to follow and which slips to buy.',
      'Every tipster on Betfluencer has a public win rate, average odds, and a rolling four-week performance record — so you always know exactly who you are buying from before you spend a single shilling.',
    ],
    bettorSteps: [
      { title: 'Browse the marketplace', desc: 'See all available betslips from every tipster. Filter by odds range — from safe low-risk slips to high-odds accumulators. Every slip shows the total odds, number of legs, and the tipster\'s win record.' },
      { title: 'Check the tipster', desc: 'Tap any tipster chip to visit their channel. See their full 4-week performance record, win rate, average odds, streak, and their last 5 results. Make an informed decision before you pay anything.' },
      { title: 'Buy only what you want', desc: 'Pay per slip — no monthly subscriptions, no commitments. If you like a slip, pay for it once using MTN or Airtel Mobile Money. The booking code unlocks immediately after payment.' },
      { title: 'Load the slip and bet', desc: 'Use the booking code to load the full betslip on your betting platform — BetPawa, Betway, SportPesa, Mozzart, or any other. Place your bet and follow the results.' },
      { title: 'Finished slips are free', desc: 'Once a slip\'s matches have all played out, the result is public and free for everyone to view. You can see exactly what a tipster picked and whether it won — before buying their next slip.' },
    ],
    tipsterIntro: 'If you consistently pick winners, Betfluencer lets you earn from every bettor who buys your slip. Here is how it works:',
    tipsterSteps: [
      { title: 'Create your channel', desc: 'Sign up with your phone number and set up your public tipster channel. Your channel shows your win rate, average odds, and full performance history.' },
      { title: 'Post betslips', desc: 'Enter your booking code and betting platform when you post a slip. Set your own price per slip — from UGX 500 to whatever you think it is worth. You can post multiple slips at different odds levels simultaneously.' },
      { title: 'Earn per purchase', desc: 'Every time a bettor buys your slip, 90% of the payment goes straight to your Mobile Money account instantly. Betfluencer keeps 10% as a platform fee. No monthly fees, no minimum payouts, no waiting.' },
      { title: 'Build your reputation', desc: 'Your win rate and rankings are calculated automatically from your results over the last 28 days. Consistent winners earn a verified tick and appear higher in the rankings — bringing more buyers to their channel.' },
    ],
    paymentsHeading: 'Simple, instant Mobile Money',
    paymentsIntro: 'Betfluencer is built for Uganda. All payments are processed in Ugandan Shillings (UGX) via Mobile Money — no bank account, no credit card, no international payment hassle.',
    paymentsRows: [
      { label: 'Supported networks', val: 'MTN Uganda · Airtel Uganda' },
      { label: 'Currency', val: 'Ugandan Shillings (UGX)' },
      { label: 'Tipster payout', val: '90% of each slip purchase — instant' },
      { label: 'Platform fee', val: '10% per transaction' },
      { label: 'Subscriptions', val: 'None — pay per slip only' },
      { label: 'Minimum purchase', val: 'Set by each tipster individually' },
    ],
    coverageIntro: 'Betfluencer supports tipsters covering any football league or competition that can be bet on — from local Ugandan football to the biggest European competitions.',
    coverageRegions: [
      { region: '🇺🇬 Uganda', leagues: ['Uganda Premier League', 'FUFA Big League', 'FUFA Women Super League'] },
      { region: '🌍 Africa', leagues: ['AFCON', 'CAF Champions League', 'Kenya Premier League', 'NPFL Nigeria', 'ABSA Premiership South Africa'] },
      { region: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England', leagues: ['Premier League', 'Championship', 'FA Cup', 'EFL Trophy'] },
      { region: '🌍 Europe', leagues: ['UEFA Champions League', 'UEFA Europa League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1'] },
      { region: '🌎 Americas & Asia', leagues: ['MLS', 'Copa Libertadores', 'J-League', 'Saudi Pro League'] },
    ],
    companyHeading: 'Built in Uganda, for Uganda',
    companyParas: [
      'Betfluencer was built by ABC Input Solutions, a Ugandan technology company focused on building digital products that solve real problems for East African markets.',
      'We noticed that Uganda has thousands of skilled football analysts and tipsters sharing picks informally on WhatsApp groups and social media — but no structured way to build a reputation, reach a wider audience, or earn fairly from their knowledge. At the same time, bettors had no reliable way to find and evaluate tipsters beyond word of mouth.',
      'Betfluencer solves both problems. It gives tipsters a professional platform and a fair income stream, and gives bettors transparent, verifiable performance data to make smarter decisions.',
    ],
    faq: [
      { q: 'Is Betfluencer free to use?', a: 'Browsing tipster channels and viewing finished slip results is completely free. You only pay when you choose to buy a specific pending slip.' },
      { q: 'How do I know a tipster is genuine?', a: 'Every tipster\'s win rate, average odds, and 4-week performance record is publicly visible. Booking codes can be verified on the relevant betting platform. Tipsters with a verified tick have earned it through consistent performance — it cannot be purchased.' },
      { q: 'What happens if I pay and the slip loses?', a: 'Slip purchases are for access to the tipster\'s pick — not a guarantee of winning. Like all betting, results are not guaranteed. This is why we encourage you to review a tipster\'s full track record before buying.' },
      { q: 'Can I become a tipster?', a: 'Yes. Sign up through the Tipster tab, create your channel, and start posting slips. There are no upfront fees. You earn 90% of every slip purchase.' },
      { q: 'Which betting platforms are supported?', a: 'Betfluencer works with any betting platform that supports booking codes — including BetPawa, Betway, SportPesa, Mozzart, 1xBet, and others.' },
      { q: 'Is Betfluencer available outside Uganda?', a: 'Currently Betfluencer is optimised for Uganda with UGX pricing and MTN/Airtel Mobile Money payments. We plan to expand to Kenya, Tanzania, and Rwanda in future.' },
    ],
  },

  NG: {
    meta: {
      title: 'About Betfluencer — Nigeria\'s Football Tipster Marketplace',
      description: 'Betfluencer is Nigeria\'s marketplace connecting football betting tipsters with bettors. Discover verified tipsters, buy betslips, and bet smarter with real win-rate data.',
      keywords: 'betfluencer, football tips nigeria, betting tipsters nigeria, sports betting nigeria, sportybet tips, npfl betting tips',
      ogTitle: 'About Betfluencer',
      ogDescription: 'Nigeria\'s football tipster marketplace. Buy betslips from verified tipsters and bet smarter.',
      ogUrl: 'https://ng.betfluencer.org/about',
    },
    heroTitle: ['Nigeria\'s football', 'tipster marketplace'],
    heroIntro: 'Betfluencer connects football bettors with Nigeria\'s best tipsters. Browse betslips, check win rates, pay per slip, and bet smarter — all in one place.',
    heroChips: ['SportyBet', '1xBet', 'NPFL', 'Premier League', 'Champions League'],
    whatHeading: 'The smartest way to bet in Nigeria',
    whatParas: [
      'Betfluencer is a two-sided marketplace built specifically for the Nigerian betting market. On one side, skilled football tipsters post their betslips — complete with booking codes, odds, and their verified win record. On the other side, bettors browse those slips, pay only for the ones they want, and place their bets with more confidence.',
      'We do not place bets for you. We do not hold your money. We simply connect you with tipsters who have a proven track record, and let you decide who to follow and which slips to buy.',
      'Every tipster on Betfluencer has a public win rate, average odds, and a rolling four-week performance record — so you always know exactly who you are buying from before you spend a single naira.',
    ],
    bettorSteps: [
      { title: 'Browse the marketplace', desc: 'See all available betslips from every tipster. Filter by odds range — from safe low-risk slips to high-odds accumulators. Every slip shows the total odds, number of legs, and the tipster\'s win record.' },
      { title: 'Check the tipster', desc: 'Tap any tipster chip to visit their channel. See their full 4-week performance record, win rate, average odds, streak, and their last 5 results. Make an informed decision before you pay anything.' },
      { title: 'Buy only what you want', desc: 'Pay per slip — no monthly subscriptions, no commitments. If you like a slip, pay for it once in Naira. The booking code unlocks immediately after payment.' },
      { title: 'Load the slip and bet', desc: 'Use the booking code to load the full betslip on your betting platform — SportyBet, 1xBet, Betway, betPawa, or any other. Place your bet and follow the results.' },
      { title: 'Finished slips are free', desc: 'Once a slip\'s matches have all played out, the result is public and free for everyone to view. You can see exactly what a tipster picked and whether it won — before buying their next slip.' },
    ],
    tipsterIntro: 'If you consistently pick winners, Betfluencer lets you earn from every bettor who buys your slip. Here is how it works:',
    tipsterSteps: [
      { title: 'Create your channel', desc: 'Sign up with your phone number and set up your public tipster channel. Your channel shows your win rate, average odds, and full performance history.' },
      { title: 'Post betslips', desc: 'Enter your booking code and betting platform when you post a slip. Set your own price per slip — from ₦500 to whatever you think it is worth. You can post multiple slips at different odds levels simultaneously.' },
      { title: 'Earn per purchase', desc: 'Every time a bettor buys your slip, 90% of the payment is yours. Betfluencer keeps 10% as a platform fee. No monthly fees, no minimum payouts, no waiting.' },
      { title: 'Build your reputation', desc: 'Your win rate and rankings are calculated automatically from your results over the last 28 days. Consistent winners earn a verified tick and appear higher in the rankings — bringing more buyers to their channel.' },
    ],
    paymentsHeading: 'Simple, local payments in Naira',
    paymentsIntro: 'Betfluencer Nigeria runs entirely in Naira. Pay with your debit card, bank transfer, or USSD — no international payment hassle.',
    paymentsRows: [
      { label: 'Supported methods', val: 'Cards · Bank transfer · USSD' },
      { label: 'Currency', val: 'Nigerian Naira (₦)' },
      { label: 'Tipster payout', val: '90% of each slip purchase' },
      { label: 'Platform fee', val: '10% per transaction' },
      { label: 'Subscriptions', val: 'None — pay per slip only' },
      { label: 'Minimum purchase', val: 'Set by each tipster individually' },
    ],
    coverageIntro: 'Betfluencer supports tipsters covering any football league or competition that can be bet on — from the NPFL to the biggest European competitions.',
    coverageRegions: [
      { region: '🇳🇬 Nigeria', leagues: ['NPFL', 'President Federation Cup'] },
      { region: '🌍 Africa', leagues: ['AFCON', 'CAF Champions League', 'Uganda Premier League', 'Kenya Premier League', 'ABSA Premiership South Africa'] },
      { region: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England', leagues: ['Premier League', 'Championship', 'FA Cup', 'EFL Trophy'] },
      { region: '🌍 Europe', leagues: ['UEFA Champions League', 'UEFA Europa League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1'] },
      { region: '🌎 Americas & Asia', leagues: ['MLS', 'Copa Libertadores', 'J-League', 'Saudi Pro League'] },
    ],
    companyHeading: 'Built in Africa, for Nigeria',
    companyParas: [
      'Betfluencer was built by ABC Input Solutions, an African technology company focused on building digital products that solve real problems for markets across the continent.',
      'Nigeria has thousands of skilled football analysts and tipsters sharing picks informally on WhatsApp, Telegram, and social media — but no structured way to build a reputation, reach a wider audience, or earn fairly from their knowledge. At the same time, bettors have no reliable way to find and evaluate tipsters beyond word of mouth.',
      'Betfluencer solves both problems. It gives tipsters a professional platform and a fair income stream, and gives bettors transparent, verifiable performance data to make smarter decisions.',
    ],
    faq: [
      { q: 'Is Betfluencer free to use?', a: 'Browsing tipster channels and viewing finished slip results is completely free. You only pay when you choose to buy a specific pending slip.' },
      { q: 'How do I know a tipster is genuine?', a: 'Every tipster\'s win rate, average odds, and 4-week performance record is publicly visible. Booking codes can be verified on the relevant betting platform. Tipsters with a verified tick have earned it through consistent performance — it cannot be purchased.' },
      { q: 'What happens if I pay and the slip loses?', a: 'Slip purchases are for access to the tipster\'s pick — not a guarantee of winning. Like all betting, results are not guaranteed. This is why we encourage you to review a tipster\'s full track record before buying.' },
      { q: 'Can I become a tipster?', a: 'Yes. Sign up through the Tipster tab, create your channel, and start posting slips. There are no upfront fees. You earn 90% of every slip purchase.' },
      { q: 'Which betting platforms are supported?', a: 'Betfluencer works with any betting platform that supports booking codes — including SportyBet, 1xBet, Betway, betPawa, and others.' },
      { q: 'Is Betfluencer available outside Nigeria?', a: 'Yes — Betfluencer runs dedicated markets across Africa, each with local pricing and payment methods. Visit betfluencer.org to choose your country.' },
    ],
  },

  GH: {
    meta: {
      title: 'About Betfluencer — Ghana\'s Football Tipster Marketplace',
      description: 'Betfluencer is Ghana\'s marketplace connecting football betting tipsters with bettors. Discover verified tipsters, buy betslips, and bet smarter with real win-rate data.',
      keywords: 'betfluencer, football tips ghana, betting tipsters ghana, sports betting ghana, sportybet tips ghana, mtn momo betting',
      ogTitle: 'About Betfluencer',
      ogDescription: 'Ghana\'s football tipster marketplace. Buy betslips from verified tipsters and bet smarter.',
      ogUrl: 'https://gh.betfluencer.org/about',
    },
    heroTitle: ['Ghana\'s football', 'tipster marketplace'],
    heroIntro: 'Betfluencer connects football bettors with Ghana\'s best tipsters. Browse betslips, check win rates, pay per slip, and bet smarter — all in one place.',
    heroChips: ['MTN Mobile Money', 'SportyBet', 'Ghana Premier League', 'Premier League', 'Champions League'],
    whatHeading: 'The smartest way to bet in Ghana',
    whatParas: [
      'Betfluencer is a two-sided marketplace built specifically for the Ghanaian betting market. On one side, skilled football tipsters post their betslips — complete with booking codes, odds, and their verified win record. On the other side, bettors browse those slips, pay only for the ones they want, and place their bets with more confidence.',
      'We do not place bets for you. We do not hold your money. We simply connect you with tipsters who have a proven track record, and let you decide who to follow and which slips to buy.',
      'Every tipster on Betfluencer has a public win rate, average odds, and a rolling four-week performance record — so you always know exactly who you are buying from before you spend a single cedi.',
    ],
    bettorSteps: [
      { title: 'Browse the marketplace', desc: 'See all available betslips from every tipster. Filter by odds range — from safe low-risk slips to high-odds accumulators. Every slip shows the total odds, number of legs, and the tipster\'s win record.' },
      { title: 'Check the tipster', desc: 'Tap any tipster chip to visit their channel. See their full 4-week performance record, win rate, average odds, streak, and their last 5 results. Make an informed decision before you pay anything.' },
      { title: 'Buy only what you want', desc: 'Pay per slip — no monthly subscriptions, no commitments. If you like a slip, pay for it once using MTN Mobile Money or AirtelTigo Money. The booking code unlocks immediately after payment.' },
      { title: 'Load the slip and bet', desc: 'Use the booking code to load the full betslip on your betting platform — SportyBet, Betway, 1xBet, betPawa, or any other. Place your bet and follow the results.' },
      { title: 'Finished slips are free', desc: 'Once a slip\'s matches have all played out, the result is public and free for everyone to view. You can see exactly what a tipster picked and whether it won — before buying their next slip.' },
    ],
    tipsterIntro: 'If you consistently pick winners, Betfluencer lets you earn from every bettor who buys your slip. Here is how it works:',
    tipsterSteps: [
      { title: 'Create your channel', desc: 'Sign up with your phone number and set up your public tipster channel. Your channel shows your win rate, average odds, and full performance history.' },
      { title: 'Post betslips', desc: 'Enter your booking code and betting platform when you post a slip. Set your own price per slip — from GH₵5 to whatever you think it is worth. You can post multiple slips at different odds levels simultaneously.' },
      { title: 'Earn per purchase', desc: 'Every time a bettor buys your slip, 90% of the payment is yours. Betfluencer keeps 10% as a platform fee. No monthly fees, no minimum payouts, no waiting.' },
      { title: 'Build your reputation', desc: 'Your win rate and rankings are calculated automatically from your results over the last 28 days. Consistent winners earn a verified tick and appear higher in the rankings — bringing more buyers to their channel.' },
    ],
    paymentsHeading: 'Simple Mobile Money payments',
    paymentsIntro: 'Betfluencer Ghana runs entirely in Ghana Cedis. Pay with MTN Mobile Money or AirtelTigo Money — no bank account, no credit card, no international payment hassle.',
    paymentsRows: [
      { label: 'Supported networks', val: 'MTN Mobile Money · AirtelTigo Money' },
      { label: 'Currency', val: 'Ghana Cedi (GH₵)' },
      { label: 'Tipster payout', val: '90% of each slip purchase' },
      { label: 'Platform fee', val: '10% per transaction' },
      { label: 'Subscriptions', val: 'None — pay per slip only' },
      { label: 'Minimum purchase', val: 'Set by each tipster individually' },
    ],
    coverageIntro: 'Betfluencer supports tipsters covering any football league or competition that can be bet on — from the Ghana Premier League to the biggest European competitions.',
    coverageRegions: [
      { region: '🇬🇭 Ghana', leagues: ['Ghana Premier League', 'MTN FA Cup'] },
      { region: '🌍 Africa', leagues: ['AFCON', 'CAF Champions League', 'NPFL Nigeria', 'Uganda Premier League', 'ABSA Premiership South Africa'] },
      { region: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England', leagues: ['Premier League', 'Championship', 'FA Cup', 'EFL Trophy'] },
      { region: '🌍 Europe', leagues: ['UEFA Champions League', 'UEFA Europa League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1'] },
      { region: '🌎 Americas & Asia', leagues: ['MLS', 'Copa Libertadores', 'J-League', 'Saudi Pro League'] },
    ],
    companyHeading: 'Built in Africa, for Ghana',
    companyParas: [
      'Betfluencer was built by ABC Input Solutions, an African technology company focused on building digital products that solve real problems for markets across the continent.',
      'Ghana has thousands of skilled football analysts and tipsters sharing picks informally on WhatsApp groups and social media — but no structured way to build a reputation, reach a wider audience, or earn fairly from their knowledge. At the same time, bettors have no reliable way to find and evaluate tipsters beyond word of mouth.',
      'Betfluencer solves both problems. It gives tipsters a professional platform and a fair income stream, and gives bettors transparent, verifiable performance data to make smarter decisions.',
    ],
    faq: [
      { q: 'Is Betfluencer free to use?', a: 'Browsing tipster channels and viewing finished slip results is completely free. You only pay when you choose to buy a specific pending slip.' },
      { q: 'How do I know a tipster is genuine?', a: 'Every tipster\'s win rate, average odds, and 4-week performance record is publicly visible. Booking codes can be verified on the relevant betting platform. Tipsters with a verified tick have earned it through consistent performance — it cannot be purchased.' },
      { q: 'What happens if I pay and the slip loses?', a: 'Slip purchases are for access to the tipster\'s pick — not a guarantee of winning. Like all betting, results are not guaranteed. This is why we encourage you to review a tipster\'s full track record before buying.' },
      { q: 'Can I become a tipster?', a: 'Yes. Sign up through the Tipster tab, create your channel, and start posting slips. There are no upfront fees. You earn 90% of every slip purchase.' },
      { q: 'Which betting platforms are supported?', a: 'Betfluencer works with any betting platform that supports booking codes — including SportyBet, Betway, 1xBet, betPawa, and others.' },
      { q: 'Is Betfluencer available outside Ghana?', a: 'Yes — Betfluencer runs dedicated markets across Africa, each with local pricing and payment methods. Visit betfluencer.org to choose your country.' },
    ],
  },

  ZA: {
    meta: {
      title: 'About Betfluencer — South Africa\'s Football Tipster Marketplace',
      description: 'Betfluencer is South Africa\'s marketplace connecting football betting tipsters with bettors. Discover verified tipsters, buy betslips, and bet smarter with real win-rate data.',
      keywords: 'betfluencer, football tips south africa, betting tipsters south africa, sports betting south africa, betway tips, psl betting tips',
      ogTitle: 'About Betfluencer',
      ogDescription: 'South Africa\'s football tipster marketplace. Buy betslips from verified tipsters and bet smarter.',
      ogUrl: 'https://za.betfluencer.org/about',
    },
    heroTitle: ['South Africa\'s football', 'tipster marketplace'],
    heroIntro: 'Betfluencer connects football bettors with South Africa\'s best tipsters. Browse betslips, check win rates, pay per slip, and bet smarter — all in one place.',
    heroChips: ['Betway', 'SportyBet', 'DStv Premiership', 'Premier League', 'Champions League'],
    whatHeading: 'The smartest way to bet in South Africa',
    whatParas: [
      'Betfluencer is a two-sided marketplace built specifically for the South African betting market. On one side, skilled football tipsters post their betslips — complete with booking codes, odds, and their verified win record. On the other side, bettors browse those slips, pay only for the ones they want, and place their bets with more confidence.',
      'We do not place bets for you. We do not hold your money. We simply connect you with tipsters who have a proven track record, and let you decide who to follow and which slips to buy.',
      'Every tipster on Betfluencer has a public win rate, average odds, and a rolling four-week performance record — so you always know exactly who you are buying from before you spend a single rand.',
    ],
    bettorSteps: [
      { title: 'Browse the marketplace', desc: 'See all available betslips from every tipster. Filter by odds range — from safe low-risk slips to high-odds accumulators. Every slip shows the total odds, number of legs, and the tipster\'s win record.' },
      { title: 'Check the tipster', desc: 'Tap any tipster chip to visit their channel. See their full 4-week performance record, win rate, average odds, streak, and their last 5 results. Make an informed decision before you pay anything.' },
      { title: 'Buy only what you want', desc: 'Pay per slip — no monthly subscriptions, no commitments. If you like a slip, pay for it once in Rand. The booking code unlocks immediately after payment.' },
      { title: 'Load the slip and bet', desc: 'Use the booking code to load the full betslip on your betting platform — Betway, SportyBet, 1xBet, or any other. Place your bet and follow the results.' },
      { title: 'Finished slips are free', desc: 'Once a slip\'s matches have all played out, the result is public and free for everyone to view. You can see exactly what a tipster picked and whether it won — before buying their next slip.' },
    ],
    tipsterIntro: 'If you consistently pick winners, Betfluencer lets you earn from every bettor who buys your slip. Here is how it works:',
    tipsterSteps: [
      { title: 'Create your channel', desc: 'Sign up with your phone number and set up your public tipster channel. Your channel shows your win rate, average odds, and full performance history.' },
      { title: 'Post betslips', desc: 'Enter your booking code and betting platform when you post a slip. Set your own price per slip — from R10 to whatever you think it is worth. You can post multiple slips at different odds levels simultaneously.' },
      { title: 'Earn per purchase', desc: 'Every time a bettor buys your slip, 90% of the payment is yours. Betfluencer keeps 10% as a platform fee. No monthly fees, no minimum payouts, no waiting.' },
      { title: 'Build your reputation', desc: 'Your win rate and rankings are calculated automatically from your results over the last 28 days. Consistent winners earn a verified tick and appear higher in the rankings — bringing more buyers to their channel.' },
    ],
    paymentsHeading: 'Simple, local payments in Rand',
    paymentsIntro: 'Betfluencer South Africa runs entirely in Rand. Pay with your card, instant EFT, or prepaid voucher — no international payment hassle.',
    paymentsRows: [
      { label: 'Supported methods', val: 'Cards · Instant EFT · Vouchers' },
      { label: 'Currency', val: 'South African Rand (R)' },
      { label: 'Tipster payout', val: '90% of each slip purchase' },
      { label: 'Platform fee', val: '10% per transaction' },
      { label: 'Subscriptions', val: 'None — pay per slip only' },
      { label: 'Minimum purchase', val: 'Set by each tipster individually' },
    ],
    coverageIntro: 'Betfluencer supports tipsters covering any football league or competition that can be bet on — from the DStv Premiership to the biggest European competitions.',
    coverageRegions: [
      { region: '🇿🇦 South Africa', leagues: ['DStv Premiership', 'Nedbank Cup', 'MTN 8'] },
      { region: '🌍 Africa', leagues: ['AFCON', 'CAF Champions League', 'NPFL Nigeria', 'Kenya Premier League', 'Uganda Premier League'] },
      { region: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England', leagues: ['Premier League', 'Championship', 'FA Cup', 'EFL Trophy'] },
      { region: '🌍 Europe', leagues: ['UEFA Champions League', 'UEFA Europa League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1'] },
      { region: '🌎 Americas & Asia', leagues: ['MLS', 'Copa Libertadores', 'J-League', 'Saudi Pro League'] },
    ],
    companyHeading: 'Built in Africa, for South Africa',
    companyParas: [
      'Betfluencer was built by ABC Input Solutions, an African technology company focused on building digital products that solve real problems for markets across the continent.',
      'South Africa has thousands of skilled football analysts and tipsters sharing picks informally on WhatsApp groups and social media — but no structured way to build a reputation, reach a wider audience, or earn fairly from their knowledge. At the same time, bettors have no reliable way to find and evaluate tipsters beyond word of mouth.',
      'Betfluencer solves both problems. It gives tipsters a professional platform and a fair income stream, and gives bettors transparent, verifiable performance data to make smarter decisions.',
    ],
    faq: [
      { q: 'Is Betfluencer free to use?', a: 'Browsing tipster channels and viewing finished slip results is completely free. You only pay when you choose to buy a specific pending slip.' },
      { q: 'How do I know a tipster is genuine?', a: 'Every tipster\'s win rate, average odds, and 4-week performance record is publicly visible. Booking codes can be verified on the relevant betting platform. Tipsters with a verified tick have earned it through consistent performance — it cannot be purchased.' },
      { q: 'What happens if I pay and the slip loses?', a: 'Slip purchases are for access to the tipster\'s pick — not a guarantee of winning. Like all betting, results are not guaranteed. This is why we encourage you to review a tipster\'s full track record before buying.' },
      { q: 'Can I become a tipster?', a: 'Yes. Sign up through the Tipster tab, create your channel, and start posting slips. There are no upfront fees. You earn 90% of every slip purchase.' },
      { q: 'Which betting platforms are supported?', a: 'Betfluencer works with any betting platform that supports booking codes — including Betway, SportyBet, 1xBet, and others.' },
      { q: 'Is Betfluencer available outside South Africa?', a: 'Yes — Betfluencer runs dedicated markets across Africa, each with local pricing and payment methods. Visit betfluencer.org to choose your country.' },
    ],
  },

  KE: {
    meta: {
      title: 'About Betfluencer — Kenya\'s Football Tipster Marketplace',
      description: 'Betfluencer is Kenya\'s marketplace connecting football betting tipsters with bettors. Discover verified tipsters, buy betslips, and bet smarter with real win-rate data.',
      keywords: 'betfluencer, football tips kenya, betting tipsters kenya, sports betting kenya, sportpesa tips, mpesa betting',
      ogTitle: 'About Betfluencer',
      ogDescription: 'Kenya\'s football tipster marketplace. Buy betslips from verified tipsters and bet smarter.',
      ogUrl: 'https://ke.betfluencer.org/about',
    },
    heroTitle: ['Kenya\'s football', 'tipster marketplace'],
    heroIntro: 'Betfluencer connects football bettors with Kenya\'s best tipsters. Browse betslips, check win rates, pay per slip, and bet smarter — all in one place.',
    heroChips: ['M-Pesa', 'Betika', 'SportPesa', 'FKF Premier League', 'Premier League'],
    whatHeading: 'The smartest way to bet in Kenya',
    whatParas: [
      'Betfluencer is a two-sided marketplace built specifically for the Kenyan betting market. On one side, skilled football tipsters post their betslips — complete with booking codes, odds, and their verified win record. On the other side, bettors browse those slips, pay only for the ones they want, and place their bets with more confidence.',
      'We do not place bets for you. We do not hold your money. We simply connect you with tipsters who have a proven track record, and let you decide who to follow and which slips to buy.',
      'Every tipster on Betfluencer has a public win rate, average odds, and a rolling four-week performance record — so you always know exactly who you are buying from before you spend a single shilling.',
    ],
    bettorSteps: [
      { title: 'Browse the marketplace', desc: 'See all available betslips from every tipster. Filter by odds range — from safe low-risk slips to high-odds accumulators. Every slip shows the total odds, number of legs, and the tipster\'s win record.' },
      { title: 'Check the tipster', desc: 'Tap any tipster chip to visit their channel. See their full 4-week performance record, win rate, average odds, streak, and their last 5 results. Make an informed decision before you pay anything.' },
      { title: 'Buy only what you want', desc: 'Pay per slip — no monthly subscriptions, no commitments. If you like a slip, pay for it once using M-Pesa or Airtel Money. The booking code unlocks immediately after payment.' },
      { title: 'Load the slip and bet', desc: 'Use the booking code to load the full betslip on your betting platform — Betika, SportPesa, betPawa, or any other. Place your bet and follow the results.' },
      { title: 'Finished slips are free', desc: 'Once a slip\'s matches have all played out, the result is public and free for everyone to view. You can see exactly what a tipster picked and whether it won — before buying their next slip.' },
    ],
    tipsterIntro: 'If you consistently pick winners, Betfluencer lets you earn from every bettor who buys your slip. Here is how it works:',
    tipsterSteps: [
      { title: 'Create your channel', desc: 'Sign up with your phone number and set up your public tipster channel. Your channel shows your win rate, average odds, and full performance history.' },
      { title: 'Post betslips', desc: 'Enter your booking code and betting platform when you post a slip. Set your own price per slip — from KSh 20 to whatever you think it is worth. You can post multiple slips at different odds levels simultaneously.' },
      { title: 'Earn per purchase', desc: 'Every time a bettor buys your slip, 90% of the payment is yours. Betfluencer keeps 10% as a platform fee. No monthly fees, no minimum payouts, no waiting.' },
      { title: 'Build your reputation', desc: 'Your win rate and rankings are calculated automatically from your results over the last 28 days. Consistent winners earn a verified tick and appear higher in the rankings — bringing more buyers to their channel.' },
    ],
    paymentsHeading: 'Simple mobile money payments',
    paymentsIntro: 'Betfluencer Kenya runs entirely in Kenya Shillings. Pay with M-Pesa or Airtel Money — no bank account, no credit card, no international payment hassle.',
    paymentsRows: [
      { label: 'Supported networks', val: 'M-Pesa · Airtel Money' },
      { label: 'Currency', val: 'Kenya Shillings (KSh)' },
      { label: 'Tipster payout', val: '90% of each slip purchase' },
      { label: 'Platform fee', val: '10% per transaction' },
      { label: 'Subscriptions', val: 'None — pay per slip only' },
      { label: 'Minimum purchase', val: 'Set by each tipster individually' },
    ],
    coverageIntro: 'Betfluencer supports tipsters covering any football league or competition that can be bet on — from the FKF Premier League to the biggest European competitions.',
    coverageRegions: [
      { region: '🇰🇪 Kenya', leagues: ['FKF Premier League', 'National Super League'] },
      { region: '🌍 Africa', leagues: ['AFCON', 'CAF Champions League', 'Uganda Premier League', 'NPFL Nigeria', 'ABSA Premiership South Africa'] },
      { region: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England', leagues: ['Premier League', 'Championship', 'FA Cup', 'EFL Trophy'] },
      { region: '🌍 Europe', leagues: ['UEFA Champions League', 'UEFA Europa League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1'] },
      { region: '🌎 Americas & Asia', leagues: ['MLS', 'Copa Libertadores', 'J-League', 'Saudi Pro League'] },
    ],
    companyHeading: 'Built in Africa, for Kenya',
    companyParas: [
      'Betfluencer was built by ABC Input Solutions, an African technology company focused on building digital products that solve real problems for East African markets.',
      'Kenya has thousands of skilled football analysts and tipsters sharing picks informally on WhatsApp groups and social media — but no structured way to build a reputation, reach a wider audience, or earn fairly from their knowledge. At the same time, bettors have no reliable way to find and evaluate tipsters beyond word of mouth.',
      'Betfluencer solves both problems. It gives tipsters a professional platform and a fair income stream, and gives bettors transparent, verifiable performance data to make smarter decisions.',
    ],
    faq: [
      { q: 'Is Betfluencer free to use?', a: 'Browsing tipster channels and viewing finished slip results is completely free. You only pay when you choose to buy a specific pending slip.' },
      { q: 'How do I know a tipster is genuine?', a: 'Every tipster\'s win rate, average odds, and 4-week performance record is publicly visible. Booking codes can be verified on the relevant betting platform. Tipsters with a verified tick have earned it through consistent performance — it cannot be purchased.' },
      { q: 'What happens if I pay and the slip loses?', a: 'Slip purchases are for access to the tipster\'s pick — not a guarantee of winning. Like all betting, results are not guaranteed. This is why we encourage you to review a tipster\'s full track record before buying.' },
      { q: 'Can I become a tipster?', a: 'Yes. Sign up through the Tipster tab, create your channel, and start posting slips. There are no upfront fees. You earn 90% of every slip purchase.' },
      { q: 'Which betting platforms are supported?', a: 'Betfluencer works with any betting platform that supports booking codes — including Betika, SportPesa, betPawa, 1xBet, and others.' },
      { q: 'Is Betfluencer available outside Kenya?', a: 'Yes — Betfluencer runs dedicated markets across Africa, each with local pricing and payment methods. Visit betfluencer.org to choose your country.' },
    ],
  },
}
