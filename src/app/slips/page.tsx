'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Ticket, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { TopBar, BottomNav } from '@/components/layout/Navigation'
import { ODDS_FILTERS, getOddsFilter, parseOddsQuery, getRiskLabel } from '@/types/betslip'
import type { Betslip } from '@/types/betslip'
import { PaymentSheet } from '@/components/ui/PaymentSheet'
import { SlipReveal } from '@/components/ui/SlipReveal'
import { buyerHeader } from '@/lib/guestId'
import { useCountry } from '@/components/CountryProvider'

type Row = { slip: Betslip; tipsterName: string; tipsterUsername: string }

function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ background: 'var(--bg3)', color: 'var(--offwhite)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid var(--line)' }}>{children}</span>
}

function SlipCard({ row, unlocked, onBuy }: { row: Row; unlocked: boolean; onBuy: () => void }) {
  const { slip, tipsterName, tipsterUsername } = row
  const { fmtMoney } = useCountry()
  const router   = useRouter()
  const [open, setOpen] = useState(false)
  const finished = slip.result === 'win' || slip.result === 'loss'
  const canView  = finished || unlocked
  const risk     = getRiskLabel(slip.total_odds ?? 1)
  const games    = slip.game_count ?? slip.leg_count ?? 0
  const leagues  = slip.leagues ?? []
  const markets  = slip.markets ?? []
  const initials = tipsterName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  const isHot    = (slip.total_odds ?? 0) >= 10

  return (
    <div style={{ background: 'var(--card)', borderRadius: 16, border: `1px solid ${isHot ? 'rgba(245,166,35,0.35)' : 'var(--line)'}`, borderLeft: isHot ? '3px solid var(--gold)' : undefined, marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)' }}>Betslip</span>
              <span style={{ background: 'var(--bg3)', color: 'var(--muted)', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20 }}>{games} games</span>
              <span style={{ background: risk.bg, color: risk.color, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, border: `1px solid ${risk.color}40` }}>{risk.label}</span>
              {slip.result === 'win' && <span style={{ background: 'var(--green-lt)', color: 'var(--green)', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(46,204,122,0.45)' }}>WON ✓</span>}
              {finished
                ? <span style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted)', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20 }}>Free</span>
                : unlocked
                  ? <span style={{ background: 'var(--green-lt)', color: 'var(--green)', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, border: '1px solid rgba(46,204,122,0.3)' }}>Unlocked ✓</span>
                  : <span style={{ background: 'var(--green-lt)', color: 'var(--green)', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, border: '1px solid rgba(46,204,122,0.3)' }}>✓ Verified</span>}
            </div>
            <div onClick={() => router.push(`/channel/${tipsterUsername}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg3)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', border: '1px solid var(--line)' }}>
              <div style={{ width: 18, height: 18, borderRadius: 5, background: 'var(--bg2)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 800 }}>{initials}</div>
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
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--white)' }}>{fmtMoney(slip.slip_price)}</div>
            </div>
            <button onClick={onBuy} style={{ background: 'var(--gold)', color: '#1a0a00', border: 'none', borderRadius: 11, padding: '10px 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>Buy slip →</button>
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
  // Live = the pending marketplace (unchanged). Wins = winning slips settled
  // in the last 24h (rolling window, free to view). Wins are fetched lazily
  // on first toggle and kept in state — switching back and forth is instant.
  const [view, setView] = useState<'live' | 'wins'>('live')
  const [winsSlips, setWinsSlips] = useState<Row[] | null>(null)
  const [winsLoading, setWinsLoading] = useState(false)

  const showWins = () => {
    setView('wins')
    if (winsSlips === null && !winsLoading) {
      setWinsLoading(true)
      fetch('/api/slips/wins').then(r => r.json())
        .then(d => { setWinsSlips(d.slips ?? []); setWinsLoading(false) })
        .catch(() => { setWinsSlips([]); setWinsLoading(false) })
    }
  }

  useEffect(() => {
    fetch('/api/slips').then(r => r.json()).then(d => { setAllSlips(d.slips ?? []); setLoading(false) }).catch(() => setLoading(false))
    // Pre-load the logged-in buyer's purchases so an already-owned slip shows
    // as Unlocked on ANY device — not just the browser where it was bought.
    fetch('/api/subscribe', { headers: buyerHeader() }).then(r => r.json()).then(d => {
      const owned: string[] = (d.subscriptions ?? []).filter((p: any) => p.status === 'active').map((p: any) => p.betslip_id)
      if (owned.length) setUnlocked(prev => { const next = new Set(prev); owned.forEach(id => next.add(id)); return next })
    }).catch(() => {})
  }, [])

  const oddsFilter = getOddsFilter(filter)
  const oddsQuery  = parseOddsQuery(query)
  const source   = view === 'wins' ? (winsSlips ?? []) : allSlips
  const filtered = source.filter(({ slip, tipsterName }) => {
    if (oddsQuery) return (slip.total_odds ?? 0) >= oddsQuery.min && (slip.total_odds ?? 0) <= oddsQuery.max + 0.99
    if (filter !== 'All' && ((slip.total_odds ?? 0) < oddsFilter.min || (slip.total_odds ?? 0) > oddsFilter.max)) return false
    if (query.trim() && !oddsQuery) { const q = query.toLowerCase(); return tipsterName.toLowerCase().includes(q) || (slip.total_odds ?? 0).toString().includes(q) }
    return true
  })

  const liveCount = allSlips.filter(s => s.slip.result === 'pending').length

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <main className="flex-1 overflow-y-auto pb-6">
        <div style={{ background: 'var(--bg2)', padding: '12px 16px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Marketplace</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--white)' }}>Verified slips</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setView('live')} style={{ background: view === 'live' ? 'var(--gold-lt)' : 'var(--bg3)', border: view === 'live' ? '1px solid rgba(245,166,35,0.3)' : '1px solid var(--line)', borderRadius: 10, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: view === 'live' ? 'var(--gold)' : 'var(--muted)', cursor: 'pointer' }}>{liveCount} live</button>
            <button onClick={showWins} style={{ background: view === 'wins' ? 'var(--green-lt)' : 'var(--bg3)', border: view === 'wins' ? '1px solid rgba(46,204,122,0.3)' : '1px solid var(--line)', borderRadius: 10, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: view === 'wins' ? 'var(--green)' : 'var(--muted)', cursor: 'pointer' }}>Wins 24h</button>
          </div>
        </div>

        <div style={{ padding: '12px 14px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: focused ? 'var(--bg2)' : 'var(--bg3)', borderRadius: 14, border: `1.5px solid ${focused ? 'var(--gold)' : 'rgba(255,255,255,0.15)'}`, padding: '10px 14px', marginBottom: 10 }}>
            <Search size={16} color={focused ? 'var(--gold)' : 'var(--muted)'} style={{ flexShrink: 0 }} />
            <input type="text" placeholder="Search slips, tipsters... try 'odd 4'" value={query} onChange={e => setQuery(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ border: 'none', background: 'none', fontSize: 13, color: 'var(--white)', flex: 1, outline: 'none', fontWeight: 500 }} />
            {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}><X size={14} color="var(--muted)" /></button>}
          </div>

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
            {ODDS_FILTERS.map(f => (
              <button key={f.label} onClick={() => setFilter(f.label)} style={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, padding: '6px 13px', borderRadius: 20, flexShrink: 0, cursor: 'pointer', border: 'none', background: filter === f.label ? 'var(--gold)' : 'var(--bg3)', color: filter === f.label ? '#1a0a00' : 'var(--offwhite)', outline: filter === f.label ? 'none' : '1px solid rgba(255,255,255,0.12)' }}>{f.label}</button>
            ))}
          </div>

          {(view === 'live' ? loading : winsLoading) ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}><Loader2 size={28} color="var(--gold)" className="spin" /></div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>{filtered.length} slip{filtered.length !== 1 ? 's' : ''}{view === 'wins' ? ' · won in the last 24h' : ''}</div>
              {filtered.length === 0 ? (
                view === 'wins' && source.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
                    <Ticket size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4 }} />
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--offwhite)', marginBottom: 4 }}>No winning slips in the last 24 hours yet</div>
                    <div style={{ fontSize: 12 }}>Check back soon — wins land here as slips settle</div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
                    <Ticket size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4 }} />
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--offwhite)', marginBottom: 4 }}>No slips found</div>
                    <div style={{ fontSize: 12 }}>Try a different odds range</div>
                  </div>
                )
              ) : filtered.map(row => <SlipCard key={row.slip.id} row={row} unlocked={unlocked.has(row.slip.id)} onBuy={() => setBuying(row)} />)}
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
