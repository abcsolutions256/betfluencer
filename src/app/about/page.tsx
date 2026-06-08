import type { Metadata } from 'next'
import Link from 'next/link'
import { TopBar, BottomNav } from '@/components/layout/Navigation'

export const metadata: Metadata = {
  title: 'About Betfluencer — Uganda\'s Football Tipster Marketplace',
  description: 'Betfluencer is Uganda\'s first marketplace connecting football betting tipsters with bettors. Discover verified tipsters, buy betslips, and bet smarter with real win-rate data.',
  keywords: 'betfluencer, football tips uganda, betting tipsters uganda, sports betting uganda, betpawa tips, mtn mobile money betting',
  openGraph: {
    title: 'About Betfluencer',
    description: 'Uganda\'s first football tipster marketplace. Buy betslips from verified tipsters and bet smarter.',
    url: 'https://betfluencer.org/about',
    siteName: 'Betfluencer',
    type: 'website',
  },
}

const S = {
  page:        { background: 'var(--bg)', minHeight: '100vh' } as React.CSSProperties,
  hero:        { background: 'var(--bg2)', borderBottom: '1px solid var(--line)', padding: '32px 20px 36px' } as React.CSSProperties,
  section:     { padding: '28px 20px', borderBottom: '1px solid var(--line)' } as React.CSSProperties,
  sectionLast: { padding: '28px 20px 40px' } as React.CSSProperties,
  label:       { fontSize: 10, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: 8, display: 'block' },
  h2:          { fontSize: 22, fontWeight: 800, color: 'var(--white)', marginBottom: 12, lineHeight: 1.3 } as React.CSSProperties,
  h3:          { fontSize: 16, fontWeight: 700, color: 'var(--white)', marginBottom: 8 } as React.CSSProperties,
  p:           { fontSize: 14, color: 'var(--offwhite)', lineHeight: 1.8, marginBottom: 12 } as React.CSSProperties,
  card:        { background: 'var(--card)', borderRadius: 14, border: '1px solid var(--line)', padding: '16px', marginBottom: 10 } as React.CSSProperties,
  chip:        { display: 'inline-block', background: 'var(--gold-lt)', color: 'var(--gold)', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(245,166,35,0.3)', marginRight: 6, marginBottom: 6 } as React.CSSProperties,
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--gold)', color: '#1a0a00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0, marginTop: 2 }}>{n}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={S.card}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={S.h3}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{desc}</div>
    </div>
  )
}

export default function AboutPage() {
  return (
    <div style={S.page}>
      <TopBar />
      <main>

        {/* ── HERO ── */}
        <div style={S.hero}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚽</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--white)', marginBottom: 10, lineHeight: 1.2 }}>
            Uganda's football<br />tipster marketplace
          </h1>
          <p style={{ fontSize: 15, color: 'var(--offwhite)', lineHeight: 1.7, marginBottom: 20, maxWidth: 480 }}>
            Betfluencer connects football bettors with Uganda's best tipsters. Browse betslips, check win rates, pay per slip, and bet smarter — all in one place.
          </p>
          <div>
            <span style={S.chip}>MTN Mobile Money</span>
            <span style={S.chip}>Airtel Money</span>
            <span style={S.chip}>Uganda Premier League</span>
            <span style={S.chip}>Premier League</span>
            <span style={S.chip}>Champions League</span>
          </div>
        </div>

        {/* ── WHAT IS BETFLUENCER ── */}
        <div style={S.section}>
          <span style={S.label}>What we are</span>
          <h2 style={S.h2}>The smartest way to bet in Uganda</h2>
          <p style={S.p}>
            Betfluencer is a two-sided marketplace built specifically for the Ugandan betting market. On one side, skilled football tipsters post their betslips — complete with booking codes, odds, and their verified win record. On the other side, bettors browse those slips, pay only for the ones they want, and place their bets with more confidence.
          </p>
          <p style={S.p}>
            We do not place bets for you. We do not hold your money. We simply connect you with tipsters who have a proven track record, and let you decide who to follow and which slips to buy.
          </p>
          <p style={{ ...S.p, marginBottom: 0 }}>
            Every tipster on Betfluencer has a public win rate, average odds, and a rolling four-week performance record — so you always know exactly who you are buying from before you spend a single shilling.
          </p>
        </div>

        {/* ── HOW IT WORKS FOR BETTORS ── */}
        <div style={S.section}>
          <span style={S.label}>For bettors</span>
          <h2 style={S.h2}>How to use Betfluencer</h2>
          <Step n={1} title="Browse the marketplace" desc="See all available betslips from every tipster. Filter by odds range — from safe low-risk slips to high-odds accumulators. Every slip shows the total odds, number of legs, and the tipster's win record." />
          <Step n={2} title="Check the tipster" desc="Tap any tipster chip to visit their channel. See their full 4-week performance record, win rate, average odds, streak, and their last 5 results. Make an informed decision before you pay anything." />
          <Step n={3} title="Buy only what you want" desc="Pay per slip — no monthly subscriptions, no commitments. If you like a slip, pay for it once using MTN or Airtel Mobile Money. The booking code unlocks immediately after payment." />
          <Step n={4} title="Load the slip and bet" desc="Use the booking code to load the full betslip on your betting platform — BetPawa, Betway, SportPesa, Mozzart, or any other. Place your bet and follow the results." />
          <Step n={5} title="Finished slips are free" desc="Once a slip's matches have all played out, the result is public and free for everyone to view. You can see exactly what a tipster picked and whether it won — before buying their next slip." />
        </div>

        {/* ── HOW IT WORKS FOR TIPSTERS ── */}
        <div style={S.section}>
          <span style={S.label}>For tipsters</span>
          <h2 style={S.h2}>Turn your knowledge into income</h2>
          <p style={S.p}>If you consistently pick winners, Betfluencer lets you earn from every bettor who buys your slip. Here is how it works:</p>
          <Step n={1} title="Create your channel" desc="Sign up with your phone number and set up your public tipster channel. Your channel shows your win rate, average odds, and full performance history." />
          <Step n={2} title="Post betslips" desc="Enter your booking code and betting platform when you post a slip. Set your own price per slip — from UGX 500 to whatever you think it is worth. You can post multiple slips at different odds levels simultaneously." />
          <Step n={3} title="Earn per purchase" desc="Every time a bettor buys your slip, 90% of the payment goes straight to your Mobile Money account instantly. Betfluencer keeps 10% as a platform fee. No monthly fees, no minimum payouts, no waiting." />
          <Step n={4} title="Build your reputation" desc="Your win rate and rankings are calculated automatically from your results over the last 28 days. Consistent winners earn a verified tick and appear higher in the rankings — bringing more buyers to their channel." />
        </div>

        {/* ── VERIFICATION SYSTEM ── */}
        <div style={S.section}>
          <span style={S.label}>Trust & verification</span>
          <h2 style={S.h2}>How we verify tipster results</h2>
          <p style={S.p}>
            Betfluencer uses a two-tier automatic verification system to ensure tipster results are accurate and trustworthy.
          </p>
          <FeatureCard
            icon="⚡"
            title="Automatic API verification"
            desc="For common markets — match result, over/under goals, both teams to score, handicap, half-time result, clean sheet, correct score, and more — our system automatically queries a global football results API after every match and marks each leg Won or Lost. No human involvement needed."
          />
          <FeatureCard
            icon="👤"
            title="Admin manual review"
            desc="For player-specific markets — player to score, first scorer, assists, bookings — our admin team reviews and marks results manually. These are flagged automatically and resolved within a few hours of the match ending."
          />
          <FeatureCard
            icon="📊"
            title="Rolling 4-week rankings"
            desc="All tipster statistics — win rate, average odds, score, streak — are calculated from the last 28 days only. Old results drop off automatically. Rankings always reflect current form, not historical performance from months ago."
          />
          <FeatureCard
            icon="✓"
            title="Verified tick"
            desc="Tipsters who achieve 7 or more wins in their last 10 slips at average odds of 2.0 or higher automatically earn a verified tick on their channel. The tick is removed if performance drops below 4 wins in 10. It cannot be purchased."
          />
        </div>

        {/* ── PAYMENTS ── */}
        <div style={S.section}>
          <span style={S.label}>Payments</span>
          <h2 style={S.h2}>Simple, instant Mobile Money</h2>
          <p style={S.p}>
            Betfluencer is built for Uganda. All payments are processed in Ugandan Shillings (UGX) via Mobile Money — no bank account, no credit card, no international payment hassle.
          </p>
          <div style={S.card}>
            {[
              { label: 'Supported networks', val: 'MTN Uganda · Airtel Uganda' },
              { label: 'Currency', val: 'Ugandan Shillings (UGX)' },
              { label: 'Tipster payout', val: '90% of each slip purchase — instant' },
              { label: 'Platform fee', val: '10% per transaction' },
              { label: 'Subscriptions', val: 'None — pay per slip only' },
              { label: 'Minimum purchase', val: 'Set by each tipster individually' },
            ].map((r, i, arr) => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)', flexShrink: 0 }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)', textAlign: 'right' }}>{r.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── LEAGUES COVERED ── */}
        <div style={S.section}>
          <span style={S.label}>Coverage</span>
          <h2 style={S.h2}>Leagues and competitions</h2>
          <p style={{ ...S.p, marginBottom: 16 }}>
            Betfluencer supports tipsters covering any football league or competition that can be bet on — from local Ugandan football to the biggest European competitions.
          </p>
          <div>
            {[
              { region: '🇺🇬 Uganda', leagues: ['Uganda Premier League', 'FUFA Big League', 'FUFA Women Super League'] },
              { region: '🌍 Africa', leagues: ['AFCON', 'CAF Champions League', 'Kenya Premier League', 'NPFL Nigeria', 'ABSA Premiership South Africa'] },
              { region: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England', leagues: ['Premier League', 'Championship', 'FA Cup', 'EFL Trophy'] },
              { region: '🌍 Europe', leagues: ['UEFA Champions League', 'UEFA Europa League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1'] },
              { region: '🌎 Americas & Asia', leagues: ['MLS', 'Copa Libertadores', 'J-League', 'Saudi Pro League'] },
            ].map(r => (
              <div key={r.region} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--offwhite)', marginBottom: 6 }}>{r.region}</div>
                <div>{r.leagues.map(l => <span key={l} style={{ display: 'inline-block', background: 'var(--bg3)', color: 'var(--muted)', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, border: '1px solid var(--line)', marginRight: 5, marginBottom: 5 }}>{l}</span>)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── ABOUT THE COMPANY ── */}
        <div style={S.section}>
          <span style={S.label}>About us</span>
          <h2 style={S.h2}>Built in Uganda, for Uganda</h2>
          <p style={S.p}>
            Betfluencer was built by ABC Input Solutions, a Ugandan technology company focused on building digital products that solve real problems for East African markets.
          </p>
          <p style={S.p}>
            We noticed that Uganda has thousands of skilled football analysts and tipsters sharing picks informally on WhatsApp groups and social media — but no structured way to build a reputation, reach a wider audience, or earn fairly from their knowledge. At the same time, bettors had no reliable way to find and evaluate tipsters beyond word of mouth.
          </p>
          <p style={{ ...S.p, marginBottom: 0 }}>
            Betfluencer solves both problems. It gives tipsters a professional platform and a fair income stream, and gives bettors transparent, verifiable performance data to make smarter decisions.
          </p>
        </div>

        {/* ── FAQ ── */}
        <div style={S.section}>
          <span style={S.label}>FAQ</span>
          <h2 style={S.h2}>Frequently asked questions</h2>
          {[
            { q: 'Is Betfluencer free to use?', a: 'Browsing tipster channels and viewing finished slip results is completely free. You only pay when you choose to buy a specific pending slip.' },
            { q: 'How do I know a tipster is genuine?', a: 'Every tipster\'s win rate, average odds, and 4-week performance record is publicly visible. Booking codes can be verified on the relevant betting platform. Tipsters with a verified tick have earned it through consistent performance — it cannot be purchased.' },
            { q: 'What happens if I pay and the slip loses?', a: 'Slip purchases are for access to the tipster\'s pick — not a guarantee of winning. Like all betting, results are not guaranteed. This is why we encourage you to review a tipster\'s full track record before buying.' },
            { q: 'Can I become a tipster?', a: 'Yes. Sign up through the Tipster tab, create your channel, and start posting slips. There are no upfront fees. You earn 90% of every slip purchase.' },
            { q: 'Which betting platforms are supported?', a: 'Betfluencer works with any betting platform that supports booking codes — including BetPawa, Betway, SportPesa, Mozzart, 1xBet, and others.' },
            { q: 'Is Betfluencer available outside Uganda?', a: 'Currently Betfluencer is optimised for Uganda with UGX pricing and MTN/Airtel Mobile Money payments. We plan to expand to Kenya, Tanzania, and Rwanda in future.' },
          ].map((item, i, arr) => (
            <div key={i} style={{ marginBottom: i < arr.length - 1 ? 16 : 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 6 }}>Q: {item.q}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>{item.a}</div>
              {i < arr.length - 1 && <div style={{ height: 1, background: 'var(--line)', marginTop: 16 }} />}
            </div>
          ))}
        </div>

        {/* ── CONTACT ── */}
        <div style={S.sectionLast}>
          <span style={S.label}>Contact</span>
          <h2 style={S.h2}>Get in touch</h2>
          <p style={S.p}>Have a question, want to advertise, or need support? Reach us directly.</p>
          <div style={S.card}>
            {[
              { label: 'Email', val: 'betfluencer11@gmail.com', href: 'mailto:betfluencer11@gmail.com' },
              { label: 'Website', val: 'betfluencer.org', href: 'https://betfluencer.org' },
              { label: 'Advertising', val: 'See our advertise page', href: '/advertise' },
            ].map((r, i, arr) => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{r.label}</span>
                <a href={r.href} style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', textDecoration: 'none' }}>{r.val}</a>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 28px', background: 'var(--gold)', color: '#1a0a00', borderRadius: 14, fontSize: 14, fontWeight: 800, textDecoration: 'none' }}>
              Browse slips →
            </Link>
          </div>
        </div>

      </main>
      <BottomNav />
    </div>
  )
}
