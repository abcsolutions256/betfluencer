import { headers } from 'next/headers'
import { loadCountries, MAIN_DOMAIN } from '@/lib/country'

// Build Next `alternates` (canonical + hreflang) for a market-shared page path
// like '/rankings'. Every live market has its own version of the page on its
// subdomain, so we emit an en-XX hreflang per live market plus an x-default
// pointing at the picker. Canonical is self-referential to the serving host
// (the apex redirects page paths, so content lives on the subdomains).
export async function marketAlternates(path: string): Promise<{
  canonical: string
  languages: Record<string, string>
}> {
  const host = headers().get('host') ?? `ug.${MAIN_DOMAIN}`
  const live = (await loadCountries()).filter(c => c.active)

  const languages: Record<string, string> = {}
  for (const c of live) languages[`en-${c.code}`] = `https://${c.subdomain}.${MAIN_DOMAIN}${path}`
  languages['x-default'] = `https://${MAIN_DOMAIN}/welcome`

  return { canonical: `https://${host}${path}`, languages }
}
