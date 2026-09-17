// ── /welcome — main-domain landing + country picker ───────────────
// Rendered when a visitor lands on the bare main domain and neither the
// remember-choice cookie nor Cloudflare geo maps to a live market (the
// middleware rewrites those requests here). Lists ALL markets; live ones
// click through to their subdomain, the rest carry a "coming soon" tag.
import type { Metadata } from 'next'
import { loadCountries } from '@/lib/country'
import CountryPicker from './CountryPicker'

export const metadata: Metadata = {
  title: 'Betfluencer — Free Football Tips Across Africa',
  description:
    'Follow verified football tipsters across Africa. Browse betslips, check real win records, and see every pick free — no payments, no account needed. Choose your country to get started.',
}

export const dynamic = 'force-dynamic'

export default async function WelcomePage() {
  const countries = await loadCountries()
  return <CountryPicker countries={countries} />
}
