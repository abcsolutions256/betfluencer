// Tipster profile — SERVER component. Fetches the tipster server-side so the
// profile (name, record, bio) renders in the initial HTML (crawlable) and each
// profile gets its own <title>/description/canonical. The interactive body
// (tabs, follow, slips feed) lives in ChannelClient.
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getTipsterByIdentifier } from '@/lib/db'
import { MAIN_DOMAIN } from '@/lib/country'
import ChannelClient from './ChannelClient'

export const dynamic = 'force-dynamic'

function record(t: { wins_last_10?: number | null; losses?: number | null }) {
  const wins = t.wins_last_10 ?? 0, losses = t.losses ?? 0, settled = wins + losses
  return { settled, rate: settled > 0 ? `${Math.round((wins / settled) * 100)}% win rate (${wins}/${settled})` : 'a verified record' }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const t = await getTipsterByIdentifier(params.slug)
  if (!t) return { title: 'Tipster not found · Betfluencer', robots: { index: false, follow: true } }

  const { rate } = record(t)
  const bio = (t.description ?? '').trim()
  const title = `${t.name} — Free Football Tips & Win Record | Betfluencer`
  const description = (bio ? `${bio.slice(0, 110)} · ` : '') +
    `${t.name} (@${t.username}) shares free football betslips on Betfluencer — ${rate}. Booking codes & screenshots, no payment needed.`

  // Channel pages serve only on market subdomains (the apex redirects page
  // paths), so canonicalise to the serving host, not the apex metadataBase.
  const host = headers().get('host') ?? `ug.${MAIN_DOMAIN}`
  const canonical = `https://${host}/channel/${t.username}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: 'profile', siteName: 'Betfluencer', url: canonical },
    twitter:   { card: 'summary', title, description },
  }
}

export default async function ChannelPage({ params }: { params: { slug: string } }) {
  const tipster = await getTipsterByIdentifier(params.slug)
  if (!tipster) notFound()
  return <ChannelClient slug={params.slug} initialTipster={tipster} />
}
