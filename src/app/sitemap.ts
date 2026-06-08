import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://betfluencer.org'
  return [
    { url: base,              lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${base}/about`,   lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/channels`,lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${base}/rankings`,lastModified: new Date(), changeFrequency: 'daily',   priority: 0.8 },
    { url: `${base}/advertise`,lastModified: new Date(), changeFrequency: 'monthly',priority: 0.6 },
  ]
}
