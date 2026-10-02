// Channels — server wrapper for SEO metadata (title/description + hreflang
// across live markets). The interactive tipster directory is ChannelsClient.
import type { Metadata } from 'next'
import { marketAlternates } from '@/lib/seo'
import ChannelsClient from './ChannelsClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const title = 'Football Tipsters — Browse Verified Channels | Betfluencer'
  const description = 'Browse verified football tipsters, check their real win records, and follow the ones you trust. Free betslips — booking codes and screenshots, no payment needed.'
  return {
    title,
    description,
    alternates: await marketAlternates('/channels'),
    openGraph: { title, description, siteName: 'Betfluencer', type: 'website' },
  }
}

export default function ChannelsPage() {
  return <ChannelsClient />
}
