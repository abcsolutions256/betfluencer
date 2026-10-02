import { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { MAIN_DOMAIN } from '@/lib/country'

// Host-aware so each market subdomain advertises its OWN sitemap (which lists
// that market's tipster channels). Served per host.
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  const host = headers().get('host') ?? MAIN_DOMAIN
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/tipster/dashboard'] },
    sitemap: `https://${host}/sitemap.xml`,
  }
}
