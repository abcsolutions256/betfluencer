'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Clock, Ticket, Loader2, CheckCircle } from 'lucide-react'
import { TopBar, BottomNav } from '@/components/layout/Navigation'
import { ODDS_FILTERS, getOddsFilter, parseOddsQuery, getRiskLabel } from '@/types/betslip'
import type { Betslip, SlipLeg } from '@/types/betslip'
import { resolveImageUrl } from '@/lib/imageUpload'
import { PaymentSheet } from '@/components/ui/PaymentSheet'

// ── COUNTDOWN ────────────────────────────────────────────────────
function Countdown({ targetTime }: { targetTime: string }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const target = new Date(targetTime).getTime()
    const tick = () => setSecs(Math.max(0, Math.floor((target - Date.now()) / 1000)))
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [targetTime])
  if (secs <= 0) return <span style={{ fontSize: 11, color: 'var(--muted)' }}>Started</span>
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {[{ val: h, lbl: 'hrs' }, { val: m, lbl: 'min' }, { val: s, lbl: 'sec' }].map((b, i) => (
        <div key={b.lbl} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--offwhite)' }}>:</span>}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)', lineHeight: 1 }}>{pad(b.val)}</div>
            <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600, marginTop: 1 }}>{b.lbl}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── LEG ROW ──────────────────────────────────────────────────────
function LegRow({ leg }: { leg: SlipLeg }) {
  const dotColor = leg.result === 'win' ? 'var(--green)' : leg.result === 'loss' ? 'var(--red)' : 'var(--gold)'
  return (
    <div style={{ padding: '9px 14px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{leg.match}</div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{leg.pick} · {leg.league}</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)', flexShrink: 0 }}>{leg.odds.toFixed(2)}</div>
    </div>
  )
}

// ── SLIP CONTENT ─────────────────────────────────────────────────
function SlipContent({ slip, tipsterUsername, router }: { slip: Betslip; tipsterUsername: string; router: any }) {
  return (
    <div>
      {slip.posting_mode === 'screenshot' ? (
        <>
          <div style={{ padding: '12px 14px', borderTop: '1px solid var(--line)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Betslip screenshot</div>
            {slip.slip_image_url ? (
              <img src={resolveImageUrl(slip.slip_image_url)} alt="Betslip" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(245,166,35,0.3)', display: 'block' }} />
            ) : (
              <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, textAlign: 'center', border: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)' }}>Screenshot not uploaded yet</div>
            )}
          </div>
          {(slip.result === 'win' || slip.result === 'loss') && (
            <div style={{ padding: '12px 14px', borderTop: '1px solid var(--line)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Result proof</div>
              {slip.result_image_url ? (
                <img src={resolveImageUrl(slip.result_image_url)} alt="Result" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(46,204,122,0.35)', display: 'block' }} />
              ) : (
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 14px', fontSize: 11, color: 'var(--muted)', border: '1px solid var(--line)' }}>Result screenshot pending upload</div>
              )}
            </div>
          )}
        </>
      ) : slip.posting_mode === 'booking_code' ? (
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Booking code</div>
          <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{slip.betting_site}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)', letterSpacing: 2 }}>{slip.booking_code || '—'}</div>
            </div>
            <button onClick={() => navigator.clipboard.writeText(slip.booking_code ?? '')} style={{ fontSize: 11, fontWeight: 700, padding: '6px 12px', background: 'var(--gold)', color: '#1a0a00', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Copy code
            </button>
          </div>
        </div>
      ) : (
        slip.legs?.map(leg => <LegRow key={leg.id} leg={leg} />)
      )}
      <div style={{ padding: '10px 14px 12px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => router.push(`/channel/${tipsterUsername}`)} style={{ fontSize: 12, fontWeight: 700, padding: '6px 14px', background: 'var(--bg3)', color: 'var(--offwhite)', border: '1px solid var(--line)', borderRadius: 20, cursor: 'pointer' }}>
          View full channel →
        </button>
      </div>
    </div>
  )
}

// ── SLIP CARD ────────────────────────────────────────────────────
function SlipCard({ slip, tipsterName, tipsterUsername, onBuy }: {
  slip: Betslip; tipsterName: string; tipsterUsername: string; onBuy: () => void
}) {
  const router   = useRouter()
  const finished = slip.result === 'win' || slip.result === 'loss'
  // Server is the source of truth: locked === false means this buyer paid.
  const showContent = slip.locked === false
  const canView     = finished || showContent
  const risk     = getRiskLabel(slip.total_odds ?? 1)
  const legCount = slip.legs?.length ?? slip.leg_count ?? 0
  const firstMatchTime = slip.legs?.[0]?.match_time ?? new Date(Date.now() + 2 * 3600000).toISOString()
  const initials = tipsterName.split(' ').map((w:string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div style={{ background: 'var(--card)', borderRadius: 16, border: `1px solid ${(slip.total_odds ?? 0) >= 10 ? 'rgba(245,166,35,0.35)' : 'var(--line)'}`, borderLeft: (slip.total_odds ?? 0) >= 10 ? '3px solid var(--gold)' : undefined, marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)' }}>Betslip</span>
              <span style={{ background: 'var(--bg3)', color: 'var(--muted)', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20 }}>{legCount} legs</span>
              <span style={{ background: risk.bg, color: risk.color, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, border: `1px solid ${risk.color}40` }}>{risk.label}</span>
              {finished && <span style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted)', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20 }}>Free</span>}
              {showContent && !finished && <span style={{ background: 'var(--green-lt)', color: 'var(--green)', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, border: '1px solid rgba(46,204,122,0.3)' }}>Unlocked ✓</span>}
            </div>
            <div onClick={() => router.push(`/channel/${tipsterUsername}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg3)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', border: '1px solid var(--line)' }}>
              <div style={{ width: 18, height: 18, borderRadius: 5, background: 'var(--bg2)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 800 }}>{initials}</div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)' }}>{tipsterName}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>›</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--gold)', lineHeight: 1 }}>{(slip.total_odds ?? 0).toFixed(2)}</div>
            <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2, fontWeight: 600 }}>total odds</div>
          </div>
        </div>
        {!finished ? (
          <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Clock size={13} color="var(--muted)" />
              <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>First match in</span>
            </div>
            <Countdown targetTime={firstMatchTime} />
          </div>
        ) : (
          <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '8px 12px', fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: slip.result === 'win' ? 'var(--green)' : 'var(--red)', fontSize: 14 }}>{slip.result === 'win' ? '✓' : '✗'}</span>
            Finished · Free to view
          </div>
        )}
      </div>
      <div style={{ padding: '10px 14px 12px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {finished ? (
          <>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: slip.result === 'win' ? 'var(--green-lt)' : 'var(--red-lt)', color: slip.result === 'win' ? 'var(--green)' : 'var(--red)', border: `1px solid ${slip.result === 'win' ? 'rgba(46,204,122,0.3)' : 'rgba(255,107,107,0.3)'}` }}>
              {slip.result === 'win' ? 'Won ✓' : 'Lost'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Tap to view below ↓</span>
          </>
        ) : showContent ? (
          <>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'var(--green-lt)', color: 'var(--green)', border: '1px solid rgba(46,204,122,0.3)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <CheckCircle size={12} /> Slip unlocked
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Content below ↓</span>
          </>
        ) : (
          <>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>One-time purchase</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--white)' }}>UGX {slip.slip_price.toLocaleString()}</div>
            </div>
            <button onClick={onBuy} style={{ background: 'var(--gold)', color: '#1a0a00', border: 'none', borderRadius: 11, padding: '10px 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Buy slip →
            </button>
          </>
        )}
      </div>
      {canView && <SlipContent slip={slip} tipsterUsername={tipsterUsername} router={router} />}
    </div>
  )
}

// ── MAIN PAGE ────────────────────────────────────────────────────
export default function SlipsPage() {
  const [filter,      setFilter]      = useState('All')
  const [query,       setQuery]       = useState('')
  const [focused,     setFocused]     = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [allSlips,    setAllSlips]    = useState<{ slip: Betslip; tipsterName: string; tipsterUsername: string }[]>([])
  const [buying,      setBuying]      = useState<{ slip: Betslip; tipsterName: string; tipsterUsername: string } | null>(null)
  // Fetch slips with the buyer identity so already-paid slips come back unlocked.
  const loadSlips = useCallback(() => {
    const buyer = typeof window !== 'undefined' ? localStorage.getItem('bf_phone') ?? '' : ''
    fetch(`/api/slips?buyer=${encodeURIComponent(buyer)}`)
      .then(r => r.json())
      .then(data => { setAllSlips(data.slips ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { loadSlips() }, [loadSlips])

  const oddsFilter = getOddsFilter(filter)
  const oddsQuery  = parseOddsQuery(query)
  const filtered   = allSlips.filter(({ slip, tipsterName }) => {
    if (oddsQuery) return (slip.total_odds ?? 0) >= oddsQuery.min && (slip.total_odds ?? 0) <= oddsQuery.max + 0.99
    if (filter !== 'All') { if ((slip.total_odds ?? 0) < oddsFilter.min || (slip.total_odds ?? 0) > oddsFilter.max) return false }
    if (query.trim() && !oddsQuery) { const q = query.toLowerCase(); return tipsterName.toLowerCase().includes(q) || (slip.total_odds ?? 0).toString().includes(q) }
    return true
  })

  const liveCount = allSlips.filter(s => s.slip.result === 'pending').length

  function unlock() {
    setBuying(null)
    loadSlips()   // refetch — the paid slip now returns unlocked (locked:false) with its code
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <main className="flex-1 overflow-y-auto pb-6">
        <div style={{ background: 'var(--bg2)', padding: '12px 16px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Marketplace</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--white)' }}>All slips</div>
          </div>
          <div style={{ background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: 'var(--gold)' }}>{liveCount} live</div>
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

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Loader2 size={28} color="var(--gold)" style={{ margin: '0 auto', display: 'block', animation: 'slipspin 1s linear infinite' }} />
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                {filtered.length} slip{filtered.length !== 1 ? 's' : ''}
              </div>
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
                  <Ticket size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--offwhite)', marginBottom: 4 }}>No slips found</div>
                  <div style={{ fontSize: 12 }}>Try a different odds range</div>
                </div>
              ) : filtered.map(({ slip, tipsterName, tipsterUsername }) => (
                <SlipCard
                  key={slip.id}
                  slip={slip}
                  tipsterName={tipsterName}
                  tipsterUsername={tipsterUsername}
                  onBuy={() => setBuying({ slip, tipsterName, tipsterUsername })}
                />
              ))}
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
        slipLabel={buying ? `${buying.slip.legs?.length ?? buying.slip.leg_count} legs · odds ${(buying.slip.total_odds ?? 0).toFixed(2)}` : undefined}
        onDone={(r) => { if (buying && r.status === 'success') unlock(); else setBuying(null) }}
        onClose={() => setBuying(null)}
      />

      <style>{`@keyframes slipspin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
