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

  BR: {
    meta: {
      title: 'Sobre o Betfluencer — Dicas de Futebol Grátis no Brasil',
      description: 'O Betfluencer é a comunidade gratuita do Brasil para compartilhar e descobrir bilhetes de apostas de futebol. Siga tipsters verificados, abra códigos de reserva e prints, e acompanhe taxas de acerto reais — sem pagamentos, nunca.',
      keywords: 'betfluencer, dicas de futebol grátis brasil, tipsters de apostas brasil, códigos de reserva, palpites de futebol, brasileirão dicas',
      ogTitle: 'Sobre o Betfluencer',
      ogDescription: 'A comunidade gratuita de bilhetes de futebol do Brasil. Siga tipsters verificados e acompanhe taxas de acerto reais — grátis.',
      ogUrl: 'https://br.betfluencer.org/about',
    },
    heroTitle: ['Dicas de futebol do Brasil —', 'grátis e abertas'],
    heroIntro: 'O Betfluencer é onde os tipsters de futebol do Brasil compartilham seus bilhetes — códigos de reserva e prints — com todo mundo, de graça. Siga os tipsters mais afiados, confira taxas de acerto reais e carregue os palpites na sua própria casa de apostas.',
    heroChips: ['Grátis para usar', 'Brasileirão', 'Libertadores', 'Champions League', 'Betano'],
    whatHeading: 'Dicas de futebol, compartilhadas abertamente no Brasil',
    whatParas: [
      'O Betfluencer é uma plataforma gratuita e pública feita para a comunidade brasileira de futebol. Os tipsters publicam seus bilhetes — com códigos de reserva ou prints, odds e seu histórico verificado de acertos — e qualquer pessoa pode ver. Sem paywall, sem taxas.',
      'Nós não apostamos por você e não movimentamos nenhum dinheiro. Apenas damos aos tipsters um lugar para compartilhar seus palpites e construir um histórico público, e damos a todos os outros uma forma transparente de encontrar tipsters que valem a pena seguir.',
      'Cada tipster no Betfluencer tem uma taxa de acerto pública, odds médias e um histórico de desempenho das últimas quatro semanas — então você sempre sabe exatamente de quem está seguindo os palpites, com base em resultados reais.',
    ],
    bettorSteps: [
      { title: 'Explore o feed', desc: 'Veja todos os bilhetes publicados por todos os tipsters, de graça. Filtre por faixa de odds — de bilhetes seguros de baixo risco a múltiplas de odds altas. Cada bilhete mostra as odds totais, o número de seleções e o histórico de acertos do tipster.' },
      { title: 'Confira o tipster', desc: 'Toque no nome de qualquer tipster para visitar o canal dele. Veja o histórico completo de quatro semanas, taxa de acerto, odds médias, sequência atual e os últimos 5 resultados — para saber exatamente de quem você está seguindo os palpites.' },
      { title: 'Abra qualquer palpite, de graça', desc: 'Todo bilhete é gratuito para abrir — sem pagamento, sem taxa de desbloqueio. Toque em um bilhete para revelar na hora o código de reserva completo ou o print.' },
      { title: 'Carregue o bilhete e aposte', desc: 'Use o código de reserva para carregar o bilhete completo na sua casa de apostas — Betano, Superbet, Bet365, ou qualquer outra. Faça sua aposta e acompanhe os resultados.' },
      { title: 'Bilhetes encerrados mostram o resultado', desc: 'Quando todos os jogos de um bilhete terminam, o resultado fica público para todos. Dá para ver exatamente o que o tipster escolheu e se ganhou — construindo um histórico honesto e verificável.' },
    ],
    tipsterIntro: 'Tem bom olho para futebol? Compartilhe seus bilhetes com toda a comunidade e construa um histórico público. Veja como funciona:',
    tipsterSteps: [
      { title: 'Crie seu canal', desc: 'Cadastre-se com seu número de telefone e monte seu canal público de tipster. Seu canal mostra sua taxa de acerto, odds médias e todo o histórico de desempenho.' },
      { title: 'Publique seus bilhetes', desc: 'Compartilhe um código de reserva ou envie um print, informe a casa de apostas e publique. Poste quantos bilhetes quiser, em qualquer odd — tudo o que você publica é grátis para a comunidade ver.' },
      { title: 'Construa seu público', desc: 'Não há taxas e nada para vender — você compartilha palpites para crescer sua audiência. Cada resultado é registrado automaticamente, então uma boa sequência coloca você na frente de mais seguidores.' },
      { title: 'Conquiste sua reputação', desc: 'Sua taxa de acerto e o ranking são calculados automaticamente a partir dos seus resultados nos últimos 28 dias. Quem ganha com consistência conquista o selo de verificado e sobe no ranking — atraindo mais seguidores para o canal.' },
    ],
    paymentsHeading: 'Grátis e aberto, para todos',
    paymentsIntro: 'O Betfluencer é totalmente gratuito. Sem taxas de desbloqueio, sem assinaturas, sem pagamentos — é uma comunidade para compartilhar dicas de futebol, não uma loja. Qualquer pessoa pode se cadastrar e publicar, e todos podem ver.',
    paymentsRows: [
      { label: 'Custo', val: 'Grátis' },
      { label: 'Assinaturas', val: 'Nenhuma' },
      { label: 'Taxas de desbloqueio', val: 'Nenhuma' },
      { label: 'Quem pode publicar', val: 'Qualquer tipster cadastrado' },
      { label: 'Quem pode ver', val: 'Todos' },
    ],
    coverageIntro: 'Os tipsters do Betfluencer cobrem qualquer liga ou competição de futebol — do futebol brasileiro às maiores competições europeias.',
    coverageRegions: [
      { region: '🇧🇷 Brasil', leagues: ['Brasileirão Série A', 'Brasileirão Série B', 'Copa do Brasil', 'Paulistão', 'Campeonato Carioca'] },
      { region: '🌎 América do Sul', leagues: ['Copa Libertadores', 'Copa Sul-Americana', 'Recopa Sul-Americana'] },
      { region: '🌍 Europa', leagues: ['Champions League', 'Europa League', 'Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1'] },
    ],
    companyHeading: 'Feito para o Brasil',
    companyParas: [
      'O Betfluencer foi criado pela ABC Input Solutions, uma empresa de tecnologia focada em construir produtos digitais que resolvem problemas reais em mercados emergentes.',
      'O Brasil tem milhares de analistas e tipsters de futebol talentosos compartilhando palpites de forma informal em grupos de WhatsApp, Telegram e redes sociais — mas nenhum lugar estruturado e público para construir uma reputação ou alcançar um público maior. Ao mesmo tempo, os apostadores não tinham uma forma confiável de encontrar e avaliar tipsters além do boca a boca.',
      'O Betfluencer oferece esse lugar — de graça. Dá aos tipsters uma plataforma profissional e um histórico público, e dá a todos os outros dados de desempenho transparentes e verificáveis para decidir quem seguir.',
    ],
    faq: [
      { q: 'O Betfluencer é gratuito?', a: 'Sim — totalmente. Ver tipsters, abrir bilhetes (códigos de reserva e prints) e conferir resultados são todos gratuitos. Não há taxas de desbloqueio nem assinaturas.' },
      { q: 'Como sei se um tipster é confiável?', a: 'A taxa de acerto, as odds médias e o histórico de quatro semanas de cada tipster são públicos. Os códigos de reserva podem ser conferidos na casa de apostas correspondente. Tipsters com selo de verificado conquistaram isso com desempenho consistente — não dá para comprar.' },
      { q: 'Os palpites têm garantia de acerto?', a: 'Não. Um palpite é a opinião de uma pessoa e, como toda aposta, os resultados nunca são garantidos. É exatamente por isso que todo o histórico de cada tipster é público — siga os que têm um histórico comprovado e aposte sempre com responsabilidade.' },
      { q: 'Posso me tornar um tipster?', a: 'Sim. Cadastre-se pela aba Tipster, crie seu canal e comece a publicar bilhetes. É grátis — não há taxas e nada para vender. Você compartilha palpites para construir sua reputação e seu público.' },
      { q: 'Quais casas de apostas são suportadas?', a: 'O Betfluencer funciona com qualquer casa de apostas que aceite códigos de reserva — incluindo Betano, Superbet, Bet365, Sportingbet, KTO, e outras.' },
      { q: 'O Betfluencer está disponível fora do Brasil?', a: 'Sim — o Betfluencer tem comunidades gratuitas e dedicadas em vários países. Acesse betfluencer.org para escolher o seu.' },
    ],
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
