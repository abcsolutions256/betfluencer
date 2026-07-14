'use client'
// ── Active-country context for client components ──────────────────
// Fetches GET /api/country once per page load (module-cached, so many
// components share one request) and exposes:
//   const { country, fmtMoney, sites } = useCountry()
// Until the fetch resolves — and on ANY failure — the value is the
// hardcoded Uganda default, so UG renders identically to today and a
// broken fetch can never blank out prices.
import { createContext, useContext, useEffect, useState } from 'react'
import { DEFAULT_COUNTRY, type Country } from '@/lib/country'
import { orderSitesForCountry } from '@/lib/bettingSites'

const CountryContext = createContext<Country>(DEFAULT_COUNTRY)

// One in-flight/settled fetch per page load, shared by all providers.
let fetched: Promise<Country> | null = null
function fetchCountry(): Promise<Country> {
  if (!fetched) {
    fetched = fetch('/api/country', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`country ${r.status}`))))
      .then(d => (d?.country?.code ? (d.country as Country) : DEFAULT_COUNTRY))
      .catch(() => DEFAULT_COUNTRY)
  }
  return fetched
}

export function CountryProvider({ children }: { children: React.ReactNode }) {
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY)
  useEffect(() => {
    let alive = true
    fetchCountry().then(c => { if (alive) setCountry(c) })
    return () => { alive = false }
  }, [])
  return <CountryContext.Provider value={country}>{children}</CountryContext.Provider>
}

export function useCountry() {
  const country = useContext(CountryContext)
  return {
    country,
    /** e.g. 'UGX 5,000' / '₦ 5,000' — integer money, symbol prefix. */
    fmtMoney: (amount: number) => `${country.currency_symbol} ${(amount ?? 0).toLocaleString()}`,
    /** Betting sites for the post-slip form: local favourites first, everything still listed. */
    sites: orderSitesForCountry(country.betting_sites),
  }
}
