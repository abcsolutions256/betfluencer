import { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { supabaseServer } from '@/lib/supabase'
import { isMainDomainHost, subdomainCode, loadCountries, MAIN_DOMAIN } from '@/lib/country'
import { tipsterIdsForCountry } from '@/lib/countryFilter'

// Host-aware, DB-driven sitemap. Channel pages serve only on market subdomains
// (the apex redirects/rewrites page paths), so each subdomain gets its own
// sitemap listing that market's tipster profiles; the apex lists the picker,
// about, and the live-market entry points. Served per host, absolute URLs.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = headers().get('host') ?? MAIN_DOMAIN
  const base = `https://${host}`
  const now  = new Date()

  // ── Apex / bare main domain: picker + live-market entry points ──
  if (isMainDomainHost(host)) {
    const live = (await loadCountries()).filter(c => c.active)
    return [
      { url: `${base}/welcome`, lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
      { url: `${base}/about`,   lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
      ...live.map(c => ({
        url: `https://${c.subdomain}.${MAIN_DOMAIN}`,
        lastModified: now, changeFrequency: 'daily' as const, priority: 0.9,
      })),
    ]
  }

  // ── Market subdomain: core pages + this market's tipster channels ──
  const core: MetadataRoute.Sitemap = [
    { url: base,               lastModified: now, changeFrequency: 'daily',   priority: 1.0 },
    { url: `${base}/channels`, lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${base}/rankings`, lastModified: now, changeFrequency: 'daily',   priority: 0.8 },
    { url: `${base}/about`,    lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/advertise`,lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ]

  const db = supabaseServer()
  if (!db) return core

  const code = subdomainCode(host) ?? 'UG'
  const ids  = await tipsterIdsForCountry(db, code)   // null = fail-open (UG = all)
  let q = db.from('tipsters').select('username').not('username', 'is', null).limit(5000)
  if (ids) {
    if (ids.size === 0) return core                    // market with no tipsters yet
    q = q.in('id', Array.from(ids))
  }
  const { data } = await q
  const channels: MetadataRoute.Sitemap = (data ?? []).map((t: any) => ({
    url: `${base}/channel/${t.username}`,
    lastModified: now, changeFrequency: 'daily', priority: 0.7,
  }))

  return [...core, ...channels]
}
