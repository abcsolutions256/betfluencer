'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Ticket, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { TopBar, BottomNav } from '@/components/layout/Navigation'
import { ODDS_FILTERS, getOddsFilter, parseOddsQuery, getRiskLabel } from '@/types/betslip'
import type { Betslip } from '@/types/betslip'
import { PaymentSheet } from '@/components/ui/PaymentSheet'
import { SlipReveal } from '@/components/ui/SlipReveal'

type Row = { slip: Betslip; tipsterName: string; tipsterUsername: string }

function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ background: 'var(--bg3)', color: 'var(--offwhite)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid var(--line)' }}>{children}</span>
}

function SlipCard({ row, unlocked, onBuy }: { row: Row; unlocked: boolean; onBuy: () => void }) {
  const { slip, tipsterName, tipsterUsername } = row
  const router   = useRouter()
  const [open, setOpen] = useState(false)
  const finished = slip.result === 'win' || slip.result === 'loss'
  const canView  = finished || unlocked
  const risk     = getRiskLabel(slip.total_odds ?? 1)
  const games    = slip.game_count ?? slip.leg_count ?? 0
  const leagues  = slip.leagues ?? []
  const markets  = slip.markets ?? []

  return (
    <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)' }}>Betslip</span>
              <span style={{ background: 'var(--bg3)', color: 'var(--muted)', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20 }}>{games} games</span>
              <span style={{ background: risk.bg, color: risk.color, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, border: `1px solid ${risk.color}40` }}>{risk.label}</span>
              {finished
                ? <span style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted)', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20 }}>Free</span>
                : <span style={{ background: 'var(--green-lt)', color: 'var(--green)', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, border: '1px solid rgba(46,204,122,0.3)' }}>✓ Verified</span>}
            </div>
            <div onClick={() => router.push(`/channel/${tipsterUsername}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg3)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', border: '1px solid var(--line)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)' }}>{tipsterName}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>›</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--gold)', lineHeight: 1 }}>{(slip.total_odds ?? 0).toFixed(2)}</div>
            <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2, fontWeight: 600 }}>total odds</div>
          </div>
        </div>
        {(leagues.length > 0 || markets.length > 0) && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {leagues.slice(0, 3).map((l, i) => <Chip key={'l' + i}>{l}</Chip>)}
            {markets.slice(0, 3).map((m, i) => <Chip key={'m' + i}>{m}</Chip>)}
          </div>
        )}
      </div>
      <div style={{ padding: '10px 14px 12px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {canView ? (
          <>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>{finished ? 'Free to view' : 'Unlocked ✓'}</span>
            <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg3)', color: 'var(--offwhite)', border: '1px solid var(--line)', borderRadius: 20, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {open ? <>Hide <ChevronUp size={13} /></> : <>View slip <ChevronDown size={13} /></>}
            </button>
          </>
        ) : (
          <>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>One-time purchase</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--white)' }}>UGX {slip.slip_price.toLocaleString()}</div>
            </div>
            <button onClick={onBuy} style={{ background: 'var(--gold)', color: '#1a0a00', border: 'none', borderRadius: 11, padding: '10px 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Buy slip →</button>
          </>
        )}
      </div>
      {canView && open && <SlipReveal betslipId={slip.id} />}
    </div>
  )
}

export default function SlipsPage() {
  const [filter, setFilter]   = useState('All')
  const [query, setQuery]     = useState('')
  const [focused, setFocused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [allSlips, setAllSlips] = useState<Row[]>([])
  const [buying, setBuying]   = useState<Row | null>(null)
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/slips').then(r => r.json()).then(d => { setAllSlips(d.slips ?? []); setLoading(false) }).catch(() => setLoading(false))
    // Pre-load the logged-in buyer's purchases so an already-owned slip shows
    // as Unlocked on ANY device — not just the browser where it was bought.
    fetch('/api/subscribe').then(r => r.json()).then(d => {
      const owned: string[] = (d.subscriptions ?? []).filter((p: any) => p.status === 'active').map((p: any) => p.betslip_id)
      if (owned.length) setUnlocked(prev => { const next = new Set(prev); owned.forEach(id => next.add(id)); return next })
    }).catch(() => {})
  }, [])

  const oddsFilter = getOddsFilter(filter)
  const oddsQuery  = parseOddsQuery(query)
  const filtered = allSlips.filter(({ slip, tipsterName }) => {
    if (oddsQuery) return (slip.total_odds ?? 0) >= oddsQuery.min && (slip.total_odds ?? 0) <= oddsQuery.max + 0.99
    if (filter !== 'All' && ((slip.total_odds ?? 0) < oddsFilter.min || (slip.total_odds ?? 0) > oddsFilter.max)) return false
    if (query.trim() && !oddsQuery) { const q = query.toLowerCase(); return tipsterName.toLowerCase().includes(q) || (slip.total_odds ?? 0).toString().includes(q) }
    return true
  })

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <main className="flex-1 overflow-y-auto pb-6">
        <div style={{ background: 'var(--bg2)', padding: '12px 16px 14px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Marketplace</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--white)' }}>Verified slips</div>
        </div>

        <div style={{ padding: '12px 14px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: focused ? 'var(--bg2)' : 'var(--bg3)', borderRadius: 14, border: `1.5px solid ${focused ? 'var(--gold)' : 'rgba(255,255,255,0.15)'}`, padding: '10px 14px', marginBottom: 10 }}>
            <Search size={16} color={focused ? 'var(--gold)' : 'var(--muted)'} />
            <input type="text" placeholder="Search tipsters... try 'odd 4'" value={query} onChange={e => setQuery(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ border: 'none', background: 'none', fontSize: 13, color: 'var(--white)', flex: 1, outline: 'none' }} />
            {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}><X size={14} color="var(--muted)" /></button>}
          </div>

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
            {ODDS_FILTERS.map(f => (
              <button key={f.label} onClick={() => setFilter(f.label)} style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, padding: '6px 13px', borderRadius: 20, flexShrink: 0, cursor: 'pointer', border: 'none', background: filter === f.label ? 'var(--gold)' : 'var(--bg3)', color: filter === f.label ? '#1a0a00' : 'var(--offwhite)' }}>{f.label}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}><Loader2 size={28} color="var(--gold)" className="spin" /></div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
              <Ticket size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--offwhite)' }}>No slips found</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>{filtered.length} slip{filtered.length !== 1 ? 's' : ''}</div>
              {filtered.map(row => <SlipCard key={row.slip.id} row={row} unlocked={unlocked.has(row.slip.id)} onBuy={() => setBuying(row)} />)}
            </>
          )}
        </div>
      </main>
      <BottomNav />

      <PaymentSheet
        open={!!buying}
        amount={buying?.slip.slip_price ?? 0}
        betslipId={buying?.slip.id ?? ''}
        tipsterName={buying?.tipsterName}
        slipLabel={buying ? `${buying.slip.game_count ?? buying.slip.leg_count ?? ''} games · odds ${(buying.slip.total_odds ?? 0).toFixed(2)}` : undefined}
        onDone={(r) => { if (buying && r.status === 'success') setUnlocked(prev => new Set(prev).add(buying.slip.id)); setBuying(null) }}
        onClose={() => setBuying(null)}
      />
    </div>
  )
}
