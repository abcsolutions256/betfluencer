'use client'
// Country picker for the /welcome landing page. Live markets navigate to
// their subdomain (or ?country=XX on non-production hosts, where
// subdomains don't resolve). Coming-soon markets are visible but not
// clickable. "Remember my choice" stores the pick in the bf_country
// cookie the middleware redirects on; unticked = ask every visit.
import { useState } from 'react'
import type { Country } from '@/lib/country'

const MAIN_DOMAIN = process.env.NEXT_PUBLIC_MAIN_DOMAIN ?? 'betfluencer.org'
const REMEMBER_COOKIE = 'bf_country' // = REMEMBER_COOKIE in src/lib/country.ts
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 180 // 180 days

/** 'UG' → 🇺🇬 (regional-indicator pair). */
function flag(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
}

export default function CountryPicker({ countries }: { countries: Country[] }) {
  const [remember, setRemember] = useState(false)

  // Live markets first, then alphabetical.
  const sorted = [...countries].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)
  )

  function choose(c: Country) {
    if (!c.active) return

    // Only set the domain attribute on real *.MAIN_DOMAIN hosts — a
    // domain=.betfluencer.org cookie is rejected on localhost.
    const host = window.location.hostname
    const onMainDomain = host === MAIN_DOMAIN || host.endsWith(`.${MAIN_DOMAIN}`)
    const domainAttr = onMainDomain ? `; domain=.${MAIN_DOMAIN}` : ''

    if (remember) {
      document.cookie = `${REMEMBER_COOKIE}=${c.code}; path=/; max-age=${REMEMBER_MAX_AGE}; SameSite=Lax${domainAttr}`
    } else {
      // "Ask each time": clear any previously remembered choice.
      document.cookie = `${REMEMBER_COOKIE}=; path=/; max-age=0${domainAttr}`
    }

    window.location.href = onMainDomain
      ? `https://${c.subdomain}.${MAIN_DOMAIN}/`
      : `/?country=${c.code}` // local dev — subdomains don't resolve
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '0 20px 40px' }}>

      {/* ── Hero ── */}
      <div style={{ textAlign: 'center', padding: '52px 0 28px' }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--white)', letterSpacing: -0.5, marginBottom: 10 }}>
          bet<span style={{ color: 'var(--gold)' }}>fluencer</span>
        </div>
        <p style={{ fontSize: 14, color: 'var(--offwhite)', lineHeight: 1.7, maxWidth: 400, margin: '0 auto' }}>
          Africa&apos;s football tipster marketplace. Browse betslips from verified
          tipsters, check their real win record, and pay only for the slips you
          want. Finished slips are always free to view.
        </p>
      </div>

      {/* ── Picker ── */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
        Choose your country
      </div>

      {sorted.map(c => (
        <button
          key={c.code}
          onClick={() => choose(c)}
          disabled={!c.active}
          aria-label={c.active ? `Continue to Betfluencer ${c.name}` : `${c.name} — coming soon`}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14,
            padding: '14px 16px', marginBottom: 10, textAlign: 'left',
            cursor: c.active ? 'pointer' : 'default',
            opacity: c.active ? 1 : 0.55,
          }}
        >
          <span style={{ fontSize: 26, lineHeight: 1 }}>{flag(c.code)}</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: 'var(--white)' }}>{c.name}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {c.currency_code} · {c.subdomain}.{MAIN_DOMAIN}
            </span>
          </span>
          {c.active ? (
            <span style={{ color: 'var(--gold)', fontSize: 18, fontWeight: 800 }}>›</span>
          ) : (
            <span style={{
              background: 'var(--gold-lt)', color: 'var(--gold)', fontSize: 10, fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: 0.8, padding: '4px 10px',
              borderRadius: 20, border: '1px solid rgba(245,166,35,0.3)', flexShrink: 0,
            }}>
              Coming soon
            </span>
          )}
        </button>
      ))}

      {/* ── Remember my choice ── */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, cursor: 'pointer', userSelect: 'none' }}>
        <input
          type="checkbox"
          checked={remember}
          onChange={e => setRemember(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: 'var(--gold)', cursor: 'pointer' }}
        />
        <span style={{ fontSize: 13, color: 'var(--offwhite)' }}>
          Remember my choice
          <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            Skip this page and go straight to your country next time
          </span>
        </span>
      </label>

      <div style={{ marginTop: 'auto', paddingTop: 36, textAlign: 'center', fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
        Pay per slip · No subscriptions · 18+ only, bet responsibly
      </div>
    </div>
  )
}
