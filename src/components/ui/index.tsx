'use client'
import Link from 'next/link'
import { FollowButton } from './FollowButton'
import { ShieldCheck } from 'lucide-react'
import type { TipsterPublic } from '@/types'

export function VerifiedTick({ tickType }: { tickType: 'earned' | 'paid' | null }) {
  if (!tickType) return null
  return (
    <span title={tickType === 'earned' ? 'Top performer' : 'Verified tipster'}>
      <ShieldCheck size={14} color="var(--gold)" style={{ flexShrink: 0 }} />
    </span>
  )
}

export function WinRate({ wins, outOf = 10 }: { wins: number; outOf?: number }) {
  const pct = (wins / outOf) * 100
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{wins}/{outOf}</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 5, fontWeight: 600 }}>wins</div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.15)' }}>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--green)', width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ResultPill({ result }: { result: 'pending' | 'win' | 'loss' }) {
  if (result === 'win')  return <span className="pill-green">Won ✓</span>
  if (result === 'loss') return <span className="pill-red">Lost</span>
  return <span className="pill-gold">Waiting...</span>
}

export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: 12,
      background: 'var(--bg3)', color: 'var(--green)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size > 40 ? 16 : 13, fontWeight: 800, flexShrink: 0,
    }}>{initials}</div>
  )
}

export function TipsterCard({ tipster, rank }: { tipster: TipsterPublic; rank: number }) {
  return (
    <div className="card" style={{ borderLeft: rank === 1 ? '3px solid var(--gold)' : undefined }}>
      <div className="flex items-start gap-3 mb-4">
        <Avatar name={tipster.name} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--white)' }}>{tipster.name}</span>
            <VerifiedTick tickType={tipster.tick_type} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>@{tipster.username}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{tipster.sport}</div>
        </div>
        {rank <= 3
          ? <span className="pill-gold">{rank === 1 ? '🔥 #1' : `#${rank}`}</span>
          : <span className="pill-muted">#{rank}</span>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="sbox"><WinRate wins={tipster.wins_last_10 ?? 0} /></div>
        <div className="sbox">
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold)' }}>{(tipster.avg_odds ?? 0).toFixed(1)}x</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, fontWeight: 600 }}>avg odds</div>
        </div>
        <div className="sbox">
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--white)' }}>{(tipster.subscriber_count ?? 0).toLocaleString()}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, fontWeight: 600 }}>fans</div>
        </div>
      </div>

      {/* Per-slip pricing note */}
      <div style={{ background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--offwhite)', fontWeight: 500 }}>
        Pay per slip — buy only the tips you want
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 0 }}>
        <FollowButton tipsterId={tipster.id} />
        <Link href={`/channel/${tipster.username}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 12, fontSize: 14, fontWeight: 800, background: 'var(--gold)', color: '#1a0a00', textDecoration: 'none' }}>
          View
        </Link>
      </div>
    </div>
  )
}
