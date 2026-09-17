// Rankings — server wrapper for SEO metadata (title/description + hreflang
// across live markets). The interactive leaderboard is RankingsClient.
import type { Metadata } from 'next'
import { marketAlternates } from '@/lib/seo'
import RankingsClient from './RankingsClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const title = 'Tipster Rankings — Best Football Tipsters | Betfluencer'
  const description = 'Live leaderboard of the top football tipsters — ranked by real win rate, ROI and settled record. Follow the best and get their free betslips on Betfluencer.'
  return {
    title,
    description,
    alternates: await marketAlternates('/rankings'),
    openGraph: { title, description, siteName: 'Betfluencer', type: 'website' },
  }
}

export default function RankingsPage() {
  return <RankingsClient />
}
