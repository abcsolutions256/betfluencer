import type { Metadata } from 'next'
import Link from 'next/link'
import { headers, cookies } from 'next/headers'
import { TopBar, BottomNav } from '@/components/layout/Navigation'
import { getAboutContent, type AboutContent } from '@/lib/aboutContent'
import { COUNTRY_HEADER, OVERRIDE_COOKIE } from '@/lib/country'

// Per-market copy is resolved per request (x-country header from
// middleware) and may come from the DB — never prerender this page.
export const dynamic = 'force-dynamic'

// Active market for this request. Same resolution the middleware feeds
// useCountry(), but server-side so the SEO metadata is per-market too:
// x-country header → dev-override cookie → UG.
async function activeAbout(): Promise<AboutContent> {
  const code =
    headers().get(COUNTRY_HEADER) ??
    cookies().get(OVERRIDE_COOKIE)?.value ??
    'UG'
  return getAboutContent(code)
}

export async function generateMetadata(): Promise<Metadata> {
  const c = await activeAbout()
  return {
    title: c.meta.title,
    description: c.meta.description,
    keywords: c.meta.keywords,
    openGraph: {
      title: c.meta.ogTitle,
      description: c.meta.ogDescription,
      url: c.meta.ogUrl,
      siteName: 'Betfluencer',
      type: 'website',
    },
  }
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

export default async function AboutPage() {
  const c = await activeAbout()

  return (
    <div style={S.page}>
      <TopBar />
      <main>

        {/* ── HERO ── */}
        <div style={S.hero}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚽</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--white)', marginBottom: 10, lineHeight: 1.2 }}>
            {c.heroTitle.map((line, i) => (
              <span key={i}>{i > 0 && <br />}{line}</span>
            ))}
          </h1>
          <p style={{ fontSize: 15, color: 'var(--offwhite)', lineHeight: 1.7, marginBottom: 20, maxWidth: 480 }}>
            {c.heroIntro}
          </p>
          <div>
            {c.heroChips.map(chip => <span key={chip} style={S.chip}>{chip}</span>)}
          </div>
        </div>

        {/* ── WHAT IS BETFLUENCER ── */}
        <div style={S.section}>
          <span style={S.label}>What we are</span>
          <h2 style={S.h2}>{c.whatHeading}</h2>
          {c.whatParas.map((para, i, arr) => (
            <p key={i} style={i < arr.length - 1 ? S.p : { ...S.p, marginBottom: 0 }}>{para}</p>
          ))}
        </div>

        {/* ── HOW IT WORKS FOR BETTORS ── */}
        <div style={S.section}>
          <span style={S.label}>For bettors</span>
          <h2 style={S.h2}>How to use Betfluencer</h2>
          {c.bettorSteps.map((s, i) => <Step key={i} n={i + 1} title={s.title} desc={s.desc} />)}
        </div>

        {/* ── HOW IT WORKS FOR TIPSTERS ── */}
        <div style={S.section}>
          <span style={S.label}>For tipsters</span>
          <h2 style={S.h2}>Turn your knowledge into income</h2>
          <p style={S.p}>{c.tipsterIntro}</p>
          {c.tipsterSteps.map((s, i) => <Step key={i} n={i + 1} title={s.title} desc={s.desc} />)}
        </div>

        {/* ── VERIFICATION SYSTEM (country-neutral) ── */}
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
          <h2 style={S.h2}>{c.paymentsHeading}</h2>
          <p style={S.p}>{c.paymentsIntro}</p>
          <div style={S.card}>
            {c.paymentsRows.map((r, i, arr) => (
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
          <p style={{ ...S.p, marginBottom: 16 }}>{c.coverageIntro}</p>
          <div>
            {c.coverageRegions.map(r => (
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
          <h2 style={S.h2}>{c.companyHeading}</h2>
          {c.companyParas.map((para, i, arr) => (
            <p key={i} style={i < arr.length - 1 ? S.p : { ...S.p, marginBottom: 0 }}>{para}</p>
          ))}
        </div>

        {/* ── FAQ ── */}
        <div style={S.section}>
          <span style={S.label}>FAQ</span>
          <h2 style={S.h2}>Frequently asked questions</h2>
          {c.faq.map((item, i, arr) => (
            <div key={i} style={{ marginBottom: i < arr.length - 1 ? 16 : 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 6 }}>Q: {item.q}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>{item.a}</div>
              {i < arr.length - 1 && <div style={{ height: 1, background: 'var(--line)', marginTop: 16 }} />}
            </div>
          ))}
        </div>

        {/* ── CONTACT (country-neutral) ── */}
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
