import { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { unstable_cache } from 'next/cache'
import { supabaseServer } from '@/lib/supabase'
import { isMainDomainHost, subdomainCode, loadCountries, MAIN_DOMAIN } from '@/lib/country'
import { tipsterIdsForCountry } from '@/lib/countryFilter'

// Host-aware, DB-driven sitemap. Channel pages serve only on market subdomains
// (the apex redirects/rewrites page paths), so each subdomain gets its own
// sitemap listing that market's tipster profiles; the apex lists the picker,
// about, and the live-market entry points.
//
// HARDENED: the DB lookup is cached (5 min) so repeated crawls don't hit
// Postgres, and every DB-dependent step is best-effort — a DB blip or a
// mid-deploy fetch still returns a valid sitemap (at least the core pages),
// never a 5xx/empty that shows up in Search Console as "Couldn't fetch".
export const dynamic = 'force-dynamic'

// Cached (country code → tipster usernames). Keyed by code, 5-min TTL. No
// headers()/cookies() inside — safe for unstable_cache.
const channelSlugsForCountry = unstable_cache(
  async (code: string): Promise<string[]> => {
    const db = supabaseServer()
    if (!db) return []
    const ids = await tipsterIdsForCountry(db, code)   // null = fail-open (UG = all)
    if (ids && ids.size === 0) return []                // live market, no tipsters yet
    let q = db.from('tipsters').select('username').not('username', 'is', null).limit(5000)
    if (ids) q = q.in('id', Array.from(ids))
    const { data, error } = await q
    if (error) throw error                              // caller catches → core-only
    return (data ?? []).map((t: any) => t.username).filter(Boolean)
  },
  ['sitemap-channel-slugs'],
  { revalidate: 300 },
)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = headers().get('host') ?? MAIN_DOMAIN
  const base = `https://${host}`
  const now  = new Date()

  // ── Apex / bare main domain: picker + live-market entry points ──
  if (isMainDomainHost(host)) {
    let live: Awaited<ReturnType<typeof loadCountries>> = []
    try { live = (await loadCountries()).filter(c => c.active) } catch { /* fail-safe: no market rows */ }
    return [
      { url: `${base}/welcome`, lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
      { url: `${base}/about`,   lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
      ...live.map(c => ({
        url: `https://${c.subdomain}.${MAIN_DOMAIN}`,
        lastModified: now, changeFrequency: 'daily' as const, priority: 0.9,
      })),
    ]
  }

  // ── Market subdomain: core pages (always) + tipster channels (best-effort) ──
  const core: MetadataRoute.Sitemap = [
    { url: base,               lastModified: now, changeFrequency: 'daily',   priority: 1.0 },
    { url: `${base}/channels`, lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${base}/rankings`, lastModified: now, changeFrequency: 'daily',   priority: 0.8 },
    { url: `${base}/about`,    lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/advertise`,lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ]

  let channels: MetadataRoute.Sitemap = []
  try {
    const slugs = await channelSlugsForCountry(subdomainCode(host) ?? 'UG')
    channels = slugs.map(u => ({
      url: `${base}/channel/${u}`,
      lastModified: now, changeFrequency: 'daily', priority: 0.7,
    }))
  } catch { /* DB blip / mid-deploy → still return the core sitemap */ }

  return [...core, ...channels]
}
