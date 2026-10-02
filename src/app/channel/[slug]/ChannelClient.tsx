'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { TopBar, BottomNav } from '@/components/layout/Navigation'
import { Avatar, VerifiedTick } from '@/components/ui'
import { BetslipFeed } from '@/components/ui/BetslipFeed'
import { WinRateBadge } from '@/components/ui/WinHistory'
import { FollowButton } from '@/components/ui/FollowButton'
import { useCountry } from '@/components/CountryProvider'
import type { TipsterPublic } from '@/types'
import type { Betslip } from '@/types/betslip'

// Interactive channel body. The tipster profile is fetched server-side (in
// page.tsx) and passed as `initialTipster`, so the header/about render in the
// initial SSR HTML (crawlable, no loading flash). Only the slips feed is
// fetched client-side.
export default function ChannelClient({ slug, initialTipster }: { slug: string; initialTipster: TipsterPublic }) {
  const router    = useRouter()
  const [tipster] = useState<TipsterPublic>(initialTipster)
  const [slips,   setSlips]   = useState<Betslip[]>([])
  const [tab,     setTab]     = useState<'slips' | 'about'>('slips')
  const [slipsLoading, setSlipsLoading] = useState(true)
  const { country } = useCountry()
  const freeMode = country.payments_enabled === false

  // Fetch the tipster's betslips. Public PROOF only — secrets stay server-side
  // and are unlocked per-slip via /reveal. Exposed as a callback so a fresh
  // purchase can re-pull the feed (onPurchased) and reveal the bought slip.
  const loadSlips = useCallback(() => {
    if (!slug) return
    fetch(`/api/tipster/${slug}/slips`)
      .then(r => r.json())
      .then(d => { if (d.slips) setSlips(d.slips) })
      .finally(() => setSlipsLoading(false))
  }, [slug])

  useEffect(() => { loadSlips() }, [loadSlips])

  const wins    = tipster.wins_last_10 ?? 0
  const losses  = tipster.losses ?? 0
  const settled = wins + losses   // won + lost (excludes still-pending slips)

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar showBack onBack={() => router.push('/channels')} />

      {/* Profile header */}
      <div style={{ background: 'var(--bg2)', padding: '14px 16px 16px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Avatar name={tipster.name} size={52} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--white)', margin: 0 }}>{tipster.name}</h1>
              <VerifiedTick tickType={tipster.tick_type} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>@{tipster.username} · {tipster.sport}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <WinRateBadge wins={wins} total={settled} slips={slips} />
              <span className="pill-muted">{(tipster.subscriber_count ?? 0).toLocaleString()} fans</span>
            </div>
          </div>
        </div>

        <FollowButton tipsterId={tipster.id} />

        <div style={{ background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: 12, padding: '10px 14px', marginTop: 10, fontSize: 12, color: 'var(--offwhite)', fontWeight: 500, lineHeight: 1.5 }}>
          {freeMode
            ? '🎉 Free access — every pick is unlocked, no payment needed while we’re in open beta.'
            : '⚡ Pay per slip — buy only the tips you want. Finished slips are free to view.'}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'var(--bg2)', borderBottom: '1px solid var(--line)' }}>
        {(['slips', 'about'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '11px 0', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 700 : 500, color: tab === t ? 'var(--gold)' : 'var(--muted)', borderBottom: `2px solid ${tab === t ? 'var(--gold)' : 'transparent'}` }}>
            {t === 'slips' ? 'Betslips' : 'About'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-8">
        {tab === 'slips' && (
          slipsLoading && slips.length === 0
            ? <div style={{ textAlign: 'center', padding: '30px 0' }}><Loader2 size={22} color="var(--gold)" className="spin" style={{ margin: '0 auto', display: 'block' }} /></div>
            : <BetslipFeed slips={slips} tipsterName={tipster.name} onPurchased={loadSlips} />
        )}

        {tab === 'about' && (
          <div className="card">
            <div style={{ fontSize: 14, color: 'var(--offwhite)', lineHeight: 1.7, marginBottom: 14 }}>{tipster.description}</div>
            {[
              { label: 'Username',  val: `@${tipster.username}` },
              { label: 'Covers',    val: tipster.sport || 'Football' },
              { label: 'Win rate',  val: settled > 0 ? `${Math.round(wins / settled * 100)}% (${wins}/${settled})` : '—' },
              { label: 'Avg odds',  val: `${(tipster.avg_odds ?? 0).toFixed(2)}x` },
              { label: 'Fans',      val: (tipster.subscriber_count ?? 0).toLocaleString() },
            ].map((r, i) => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < 4 ? '1px solid var(--line)' : 'none' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)' }}>{r.val}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}
