// ── Per-country About-page content ─────────────────────────────────
// The About page copy varies by market (local leagues, betting sites,
// company framing). Source of truth is `countries.about_content` (jsonb,
// migration 0012, updated by 0014's open-beta copy) so copy can be edited
// without a deploy; the ABOUT_CONTENT map below is the seed AND the
// fallback — if the column is missing, the fetch fails, or the row is
// null, each market still renders from code.
//
// Betfluencer is a FREE, public betslip-sharing community — no payments,
// no commission, no payouts. The copy here reflects that; there is no
// "pay per slip" / Mobile Money language anywhere.
//
// Country-neutral sections (verification, contact) stay hardcoded in
// src/app/about/page.tsx.
//
// NOTE for tooling: scripts/generate-about-seed.js parses the object
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

// ── Shared free-model copy ─────────────────────────────────────────
// Sections that don't change per market. Built once and spread into each
// market so the wording stays consistent; markets override only the
// locally-specific bits (name, sites, leagues, company copy).

const ACCESS_ROWS = [
  { label: 'Cost', val: 'Free' },
  { label: 'Subscriptions', val: 'None' },
  { label: 'Unlock fees', val: 'None' },
  { label: 'Who can post', val: 'Any registered tipster' },
  { label: 'Who can view', val: 'Everyone' },
]

const PAYMENTS_HEADING = 'Free & open, for everyone'
const PAYMENTS_INTRO =
  'Betfluencer is completely free. No unlock fees, no subscriptions, no payouts — it is a community for sharing football tips, not a shop. Anyone can register and post, and everyone can view.'

const TIPSTER_INTRO =
  'Got a good eye for football? Share your betslips with the whole community and build a public track record. Here is how it works:'

function tipsterSteps(): { title: string; desc: string }[] {
  return [
    { title: 'Create your channel', desc: 'Sign up with your phone number and set up your public tipster channel. Your channel shows your win rate, average odds, and full performance history.' },
    { title: 'Post your slips', desc: 'Share a booking code or upload a screenshot, add the betting platform, and post. Put up as many slips as you like, at any odds — everything you post is free for the community to see.' },
    { title: 'Build your following', desc: 'There are no fees and nothing to sell — you share tips to grow your audience. Every result is tracked automatically, so a strong run puts you in front of more followers.' },
    { title: 'Earn your reputation', desc: 'Your win rate and rankings are calculated automatically from your results over the last 28 days. Consistent winners earn a verified tick and rise up the rankings — bringing more followers to their channel.' },
  ]
}

function bettorSteps(sites: string): { title: string; desc: string }[] {
  return [
    { title: 'Browse the feed', desc: 'See every betslip posted by every tipster, free. Filter by odds range — from safe low-risk slips to high-odds accumulators. Each slip shows the total odds, number of legs, and the tipster\'s win record.' },
    { title: 'Check the tipster', desc: 'Tap any tipster chip to visit their channel. See their full 4-week performance record, win rate, average odds, streak, and their last 5 results — so you know exactly whose tips you are following.' },
    { title: 'Open any pick, free', desc: 'Every slip is free to open — no payment, no unlock fee. Tap a slip to reveal the full booking code or screenshot instantly.' },
    { title: 'Load the slip and bet', desc: `Use the booking code to load the full betslip on your betting platform — ${sites}, or any other. Place your bet and follow the results.` },
    { title: 'Finished slips show results', desc: 'Once a slip\'s matches have all played out, the result is public for everyone. You can see exactly what a tipster picked and whether it won — building an honest, verifiable record.' },
  ]
}

const EU_REGIONS = [
  { region: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England', leagues: ['Premier League', 'Championship', 'FA Cup', 'EFL Trophy'] },
  { region: '🌍 Europe', leagues: ['UEFA Champions League', 'UEFA Europa League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1'] },
  { region: '🌎 Americas & Asia', leagues: ['MLS', 'Copa Libertadores', 'J-League', 'Saudi Pro League'] },
]

function sharedFaq(country: string, sites: string): { q: string; a: string }[] {
  return [
    { q: 'Is Betfluencer free to use?', a: 'Yes — completely. Viewing tipsters, opening betslips (booking codes and screenshots), and checking results are all free. There are no unlock fees and no subscriptions.' },
    { q: 'How do I know a tipster is genuine?', a: 'Every tipster\'s win rate, average odds, and 4-week performance record is publicly visible. Booking codes can be verified on the relevant betting platform. Tipsters with a verified tick have earned it through consistent performance — it cannot be purchased.' },
    { q: 'Are the tips guaranteed to win?', a: 'No. A tip is one person\'s opinion, and like all betting, results are never guaranteed. That is exactly why every tipster\'s full track record is public — follow the ones with a proven record, and always bet responsibly.' },
    { q: 'Can I become a tipster?', a: 'Yes. Sign up through the Tipster tab, create your channel, and start posting slips. It is free — there are no fees and nothing to sell. You share tips to build your reputation and following.' },
    { q: 'Which betting platforms are supported?', a: `Betfluencer works with any betting platform that supports booking codes — including ${sites}, and others.` },
    { q: `Is Betfluencer available outside ${country}?`, a: 'Yes — Betfluencer runs free, dedicated communities across Africa. Visit betfluencer.org to choose your country.' },
  ]
}

// ── Content map: seed + fallback (free open-beta copy). ────────────

export const ABOUT_CONTENT: Record<string, AboutContent> = {
  UG: {
    meta: {
      title: 'About Betfluencer — Free Football Tips in Uganda',
      description: 'Betfluencer is Uganda\'s free community for sharing and discovering football betslips. Follow verified tipsters, open booking codes and screenshots, and track real win rates — no payments, ever.',
      keywords: 'betfluencer, free football tips uganda, betting tipsters uganda, booking codes uganda, betpawa tips, football predictions uganda',
      ogTitle: 'About Betfluencer',
      ogDescription: 'Uganda\'s free football betslip community. Follow verified tipsters and track real win rates — free.',
      ogUrl: 'https://betfluencer.org/about',
    },
    heroTitle: ['Uganda\'s football tips —', 'free & open'],
    heroIntro: 'Betfluencer is where Uganda\'s football tipsters share their betslips — booking codes and screenshots — with everyone, free. Follow the sharpest tipsters, check real win rates, and load their picks on your own bookie.',
    heroChips: ['Free to use', 'Uganda Premier League', 'Premier League', 'Champions League', 'BetPawa'],
    whatHeading: 'Football tips, shared openly in Uganda',
    whatParas: [
      'Betfluencer is a free, public platform built for the Ugandan football community. Tipsters post their betslips — complete with booking codes or screenshots, odds, and their verified win record — and anyone can view them. No paywall, no fees.',
      'We do not place bets for you and we do not handle any money. We simply give tipsters a place to share their picks and build a public track record, and give everyone else a transparent way to find tipsters worth following.',
      'Every tipster on Betfluencer has a public win rate, average odds, and a rolling four-week performance record — so you always know exactly whose tips you are following, backed by real results.',
    ],
    bettorSteps: bettorSteps('BetPawa, Betway, SportPesa, Mozzart'),
    tipsterIntro: TIPSTER_INTRO,
    tipsterSteps: tipsterSteps(),
    paymentsHeading: PAYMENTS_HEADING,
    paymentsIntro: PAYMENTS_INTRO,
    paymentsRows: ACCESS_ROWS,
    coverageIntro: 'Betfluencer tipsters cover any football league or competition — from local Ugandan football to the biggest European competitions.',
    coverageRegions: [
      { region: '🇺🇬 Uganda', leagues: ['Uganda Premier League', 'FUFA Big League', 'FUFA Women Super League'] },
      { region: '🌍 Africa', leagues: ['AFCON', 'CAF Champions League', 'Kenya Premier League', 'NPFL Nigeria', 'ABSA Premiership South Africa'] },
      ...EU_REGIONS,
    ],
    companyHeading: 'Built in Uganda, for Uganda',
    companyParas: [
      'Betfluencer was built by ABC Input Solutions, a Ugandan technology company focused on building digital products that solve real problems for East African markets.',
      'Uganda has thousands of skilled football analysts and tipsters sharing picks informally on WhatsApp groups and social media — but no structured, public place to build a reputation or reach a wider audience. At the same time, bettors had no reliable way to find and evaluate tipsters beyond word of mouth.',
      'Betfluencer gives them that place — free. It gives tipsters a professional platform and a public track record, and gives everyone else transparent, verifiable performance data to decide who to follow.',
    ],
    faq: sharedFaq('Uganda', 'BetPawa, Betway, SportPesa, Mozzart, 1xBet'),
  },

  NG: {
    meta: {
      title: 'About Betfluencer — Free Football Tips in Nigeria',
      description: 'Betfluencer is Nigeria\'s free community for sharing and discovering football betslips. Follow verified tipsters, open booking codes and screenshots, and track real win rates — no payments, ever.',
      keywords: 'betfluencer, free football tips nigeria, betting tipsters nigeria, sportybet booking codes, npfl tips, football predictions nigeria',
      ogTitle: 'About Betfluencer',
      ogDescription: 'Nigeria\'s free football betslip community. Follow verified tipsters and track real win rates — free.',
      ogUrl: 'https://ng.betfluencer.org/about',
    },
    heroTitle: ['Nigeria\'s football tips —', 'free & open'],
    heroIntro: 'Betfluencer is where Nigeria\'s football tipsters share their betslips — booking codes and screenshots — with everyone, free. Follow the sharpest tipsters, check real win rates, and load their picks on your own bookie.',
    heroChips: ['Free to use', 'NPFL', 'Premier League', 'Champions League', 'SportyBet'],
    whatHeading: 'Football tips, shared openly in Nigeria',
    whatParas: [
      'Betfluencer is a free, public platform built for the Nigerian football community. Tipsters post their betslips — complete with booking codes or screenshots, odds, and their verified win record — and anyone can view them. No paywall, no fees.',
      'We do not place bets for you and we do not handle any money. We simply give tipsters a place to share their picks and build a public track record, and give everyone else a transparent way to find tipsters worth following.',
      'Every tipster on Betfluencer has a public win rate, average odds, and a rolling four-week performance record — so you always know exactly whose tips you are following, backed by real results.',
    ],
    bettorSteps: bettorSteps('SportyBet, 1xBet, Betway, betPawa'),
    tipsterIntro: TIPSTER_INTRO,
    tipsterSteps: tipsterSteps(),
    paymentsHeading: PAYMENTS_HEADING,
    paymentsIntro: PAYMENTS_INTRO,
    paymentsRows: ACCESS_ROWS,
    coverageIntro: 'Betfluencer tipsters cover any football league or competition — from the NPFL to the biggest European competitions.',
    coverageRegions: [
      { region: '🇳🇬 Nigeria', leagues: ['NPFL', 'President Federation Cup'] },
      { region: '🌍 Africa', leagues: ['AFCON', 'CAF Champions League', 'Uganda Premier League', 'Kenya Premier League', 'ABSA Premiership South Africa'] },
      ...EU_REGIONS,
    ],
    companyHeading: 'Built in Africa, for Nigeria',
    companyParas: [
      'Betfluencer was built by ABC Input Solutions, an African technology company focused on building digital products that solve real problems for markets across the continent.',
      'Nigeria has thousands of skilled football analysts and tipsters sharing picks informally on WhatsApp, Telegram, and social media — but no structured, public place to build a reputation or reach a wider audience. At the same time, bettors have no reliable way to find and evaluate tipsters beyond word of mouth.',
      'Betfluencer gives them that place — free. It gives tipsters a professional platform and a public track record, and gives everyone else transparent, verifiable performance data to decide who to follow.',
    ],
    faq: sharedFaq('Nigeria', 'SportyBet, 1xBet, Betway, betPawa'),
  },

  GH: {
    meta: {
      title: 'About Betfluencer — Free Football Tips in Ghana',
      description: 'Betfluencer is Ghana\'s free community for sharing and discovering football betslips. Follow verified tipsters, open booking codes and screenshots, and track real win rates — no payments, ever.',
      keywords: 'betfluencer, free football tips ghana, betting tipsters ghana, sportybet booking codes ghana, ghana premier league tips, football predictions ghana',
      ogTitle: 'About Betfluencer',
      ogDescription: 'Ghana\'s free football betslip community. Follow verified tipsters and track real win rates — free.',
      ogUrl: 'https://gh.betfluencer.org/about',
    },
    heroTitle: ['Ghana\'s football tips —', 'free & open'],
    heroIntro: 'Betfluencer is where Ghana\'s football tipsters share their betslips — booking codes and screenshots — with everyone, free. Follow the sharpest tipsters, check real win rates, and load their picks on your own bookie.',
    heroChips: ['Free to use', 'Ghana Premier League', 'Premier League', 'Champions League', 'SportyBet'],
    whatHeading: 'Football tips, shared openly in Ghana',
    whatParas: [
      'Betfluencer is a free, public platform built for the Ghanaian football community. Tipsters post their betslips — complete with booking codes or screenshots, odds, and their verified win record — and anyone can view them. No paywall, no fees.',
      'We do not place bets for you and we do not handle any money. We simply give tipsters a place to share their picks and build a public track record, and give everyone else a transparent way to find tipsters worth following.',
      'Every tipster on Betfluencer has a public win rate, average odds, and a rolling four-week performance record — so you always know exactly whose tips you are following, backed by real results.',
    ],
    bettorSteps: bettorSteps('SportyBet, Betway, 1xBet, betPawa'),
    tipsterIntro: TIPSTER_INTRO,
    tipsterSteps: tipsterSteps(),
    paymentsHeading: PAYMENTS_HEADING,
    paymentsIntro: PAYMENTS_INTRO,
    paymentsRows: ACCESS_ROWS,
    coverageIntro: 'Betfluencer tipsters cover any football league or competition — from the Ghana Premier League to the biggest European competitions.',
    coverageRegions: [
      { region: '🇬🇭 Ghana', leagues: ['Ghana Premier League', 'MTN FA Cup'] },
      { region: '🌍 Africa', leagues: ['AFCON', 'CAF Champions League', 'NPFL Nigeria', 'Uganda Premier League', 'ABSA Premiership South Africa'] },
      ...EU_REGIONS,
    ],
    companyHeading: 'Built in Africa, for Ghana',
    companyParas: [
      'Betfluencer was built by ABC Input Solutions, an African technology company focused on building digital products that solve real problems for markets across the continent.',
      'Ghana has thousands of skilled football analysts and tipsters sharing picks informally on WhatsApp groups and social media — but no structured, public place to build a reputation or reach a wider audience. At the same time, bettors have no reliable way to find and evaluate tipsters beyond word of mouth.',
      'Betfluencer gives them that place — free. It gives tipsters a professional platform and a public track record, and gives everyone else transparent, verifiable performance data to decide who to follow.',
    ],
    faq: sharedFaq('Ghana', 'SportyBet, Betway, 1xBet, betPawa'),
  },

  ZA: {
    meta: {
      title: 'About Betfluencer — Free Football Tips in South Africa',
      description: 'Betfluencer is South Africa\'s free community for sharing and discovering football betslips. Follow verified tipsters, open booking codes and screenshots, and track real win rates — no payments, ever.',
      keywords: 'betfluencer, free football tips south africa, betting tipsters south africa, betway booking codes, psl tips, football predictions south africa',
      ogTitle: 'About Betfluencer',
      ogDescription: 'South Africa\'s free football betslip community. Follow verified tipsters and track real win rates — free.',
      ogUrl: 'https://za.betfluencer.org/about',
    },
    heroTitle: ['South Africa\'s football tips —', 'free & open'],
    heroIntro: 'Betfluencer is where South Africa\'s football tipsters share their betslips — booking codes and screenshots — with everyone, free. Follow the sharpest tipsters, check real win rates, and load their picks on your own bookie.',
    heroChips: ['Free to use', 'DStv Premiership', 'Premier League', 'Champions League', 'Betway'],
    whatHeading: 'Football tips, shared openly in South Africa',
    whatParas: [
      'Betfluencer is a free, public platform built for the South African football community. Tipsters post their betslips — complete with booking codes or screenshots, odds, and their verified win record — and anyone can view them. No paywall, no fees.',
      'We do not place bets for you and we do not handle any money. We simply give tipsters a place to share their picks and build a public track record, and give everyone else a transparent way to find tipsters worth following.',
      'Every tipster on Betfluencer has a public win rate, average odds, and a rolling four-week performance record — so you always know exactly whose tips you are following, backed by real results.',
    ],
    bettorSteps: bettorSteps('Betway, SportyBet, 1xBet'),
    tipsterIntro: TIPSTER_INTRO,
    tipsterSteps: tipsterSteps(),
    paymentsHeading: PAYMENTS_HEADING,
    paymentsIntro: PAYMENTS_INTRO,
    paymentsRows: ACCESS_ROWS,
    coverageIntro: 'Betfluencer tipsters cover any football league or competition — from the DStv Premiership to the biggest European competitions.',
    coverageRegions: [
      { region: '🇿🇦 South Africa', leagues: ['DStv Premiership', 'Nedbank Cup', 'MTN 8'] },
      { region: '🌍 Africa', leagues: ['AFCON', 'CAF Champions League', 'NPFL Nigeria', 'Kenya Premier League', 'Uganda Premier League'] },
      ...EU_REGIONS,
    ],
    companyHeading: 'Built in Africa, for South Africa',
    companyParas: [
      'Betfluencer was built by ABC Input Solutions, an African technology company focused on building digital products that solve real problems for markets across the continent.',
      'South Africa has thousands of skilled football analysts and tipsters sharing picks informally on WhatsApp groups and social media — but no structured, public place to build a reputation or reach a wider audience. At the same time, bettors have no reliable way to find and evaluate tipsters beyond word of mouth.',
      'Betfluencer gives them that place — free. It gives tipsters a professional platform and a public track record, and gives everyone else transparent, verifiable performance data to decide who to follow.',
    ],
    faq: sharedFaq('South Africa', 'Betway, SportyBet, 1xBet'),
  },

  KE: {
    meta: {
      title: 'About Betfluencer — Free Football Tips in Kenya',
      description: 'Betfluencer is Kenya\'s free community for sharing and discovering football betslips. Follow verified tipsters, open booking codes and screenshots, and track real win rates — no payments, ever.',
      keywords: 'betfluencer, free football tips kenya, betting tipsters kenya, sportpesa booking codes, betika tips, football predictions kenya',
      ogTitle: 'About Betfluencer',
      ogDescription: 'Kenya\'s free football betslip community. Follow verified tipsters and track real win rates — free.',
      ogUrl: 'https://ke.betfluencer.org/about',
    },
    heroTitle: ['Kenya\'s football tips —', 'free & open'],
    heroIntro: 'Betfluencer is where Kenya\'s football tipsters share their betslips — booking codes and screenshots — with everyone, free. Follow the sharpest tipsters, check real win rates, and load their picks on your own bookie.',
    heroChips: ['Free to use', 'FKF Premier League', 'Premier League', 'Champions League', 'Betika'],
    whatHeading: 'Football tips, shared openly in Kenya',
    whatParas: [
      'Betfluencer is a free, public platform built for the Kenyan football community. Tipsters post their betslips — complete with booking codes or screenshots, odds, and their verified win record — and anyone can view them. No paywall, no fees.',
      'We do not place bets for you and we do not handle any money. We simply give tipsters a place to share their picks and build a public track record, and give everyone else a transparent way to find tipsters worth following.',
      'Every tipster on Betfluencer has a public win rate, average odds, and a rolling four-week performance record — so you always know exactly whose tips you are following, backed by real results.',
    ],
    bettorSteps: bettorSteps('Betika, SportPesa, betPawa'),
    tipsterIntro: TIPSTER_INTRO,
    tipsterSteps: tipsterSteps(),
    paymentsHeading: PAYMENTS_HEADING,
    paymentsIntro: PAYMENTS_INTRO,
    paymentsRows: ACCESS_ROWS,
    coverageIntro: 'Betfluencer tipsters cover any football league or competition — from the FKF Premier League to the biggest European competitions.',
    coverageRegions: [
      { region: '🇰🇪 Kenya', leagues: ['FKF Premier League', 'National Super League'] },
      { region: '🌍 Africa', leagues: ['AFCON', 'CAF Champions League', 'Uganda Premier League', 'NPFL Nigeria', 'ABSA Premiership South Africa'] },
      ...EU_REGIONS,
    ],
    companyHeading: 'Built in Africa, for Kenya',
    companyParas: [
      'Betfluencer was built by ABC Input Solutions, an African technology company focused on building digital products that solve real problems for East African markets.',
      'Kenya has thousands of skilled football analysts and tipsters sharing picks informally on WhatsApp groups and social media — but no structured, public place to build a reputation or reach a wider audience. At the same time, bettors have no reliable way to find and evaluate tipsters beyond word of mouth.',
      'Betfluencer gives them that place — free. It gives tipsters a professional platform and a public track record, and gives everyone else transparent, verifiable performance data to decide who to follow.',
    ],
    faq: sharedFaq('Kenya', 'Betika, SportPesa, betPawa, 1xBet'),
  },
}
