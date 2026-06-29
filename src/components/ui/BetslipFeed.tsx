'use client'
import { useState, useEffect } from 'react'
import { Lock, ChevronDown, ChevronUp } from 'lucide-react'
import type { Betslip } from '@/types/betslip'
import { getRiskLabel } from '@/types/betslip'
import { usePayment } from '@/hooks/usePayment'
import { SlipReveal } from '@/components/ui/SlipReveal'
import { buyerHeader } from '@/lib/guestId'

function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ background: 'var(--bg3)', color: 'var(--offwhite)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid var(--line)' }}>{children}</span>
}

// ── INLINE BUY FLOW (ioTec via usePayment — buyer identity by x-buyer-phone) ──
function InlineBuyGate({ slip, tipsterName, onUnlock }: { slip: Betslip; tipsterName?: string; onUnlock: () => void }) {
  const { pay, sheet } = usePayment()
  async function buy() {
    const r = await pay({ betslipId: slip.id, amount: slip.slip_price, tipsterName, slipLabel: `${slip.game_count ?? slip.leg_count ?? ''} games · odds ${(slip.total_odds ?? 0).toFixed(2)}` })
    if (r.status === 'success') onUnlock()
  }
  return (
    <div style={{ borderTop: '1px solid var(--line)', padding: '12px 14px 14px', background: 'rgba(0,0,0,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Lock size={15} color="var(--muted)" />
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Unlock to see the code &amp; picks</div>
      </div>
      <button onClick={buy} style={{ width: '100%', padding: 12, background: 'var(--gold)', color: '#1a0a00', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
        Buy slip · UGX {(slip.slip_price ?? 0).toLocaleString()}
      </button>
      <div style={{ textAlign: 'center', marginTop: 6, fontSize: 10, color: 'var(--muted)' }}>One-time · Mobile Money or Card</div>
      {sheet}
    </div>
  )
}

// ── BETSLIP CARD ─────────────────────────────────────────────────
// Proof-only: this card NEVER renders booking_code / slip_image_url / legs from
// the slip object. Revealed content is fetched server-side by <SlipReveal> only
// when the buyer is entitled (finished / unlocked / owned).
function BetslipCard({ slip, tipsterName, defaultOpen = false, owned = false, onPurchased }: { slip: Betslip; tipsterName?: string; defaultOpen?: boolean; owned?: boolean; onPurchased?: () => void }) {
  const [open, setOpen]         = useState(defaultOpen)
  const [unlocked, setUnlocked] = useState(false)
  const finished = slip.result === 'win' || slip.result === 'loss' || slip.result === 'void'
  const canView  = finished || unlocked || owned   // `owned` = already purchased (pre-loaded) → works cross-device
  const totalOdds = slip.total_odds ?? 0
  const risk     = getRiskLabel(totalOdds || 1)
  const games    = slip.game_count ?? slip.leg_count ?? 0
  const leagues  = slip.leagues ?? []
  const markets  = slip.markets ?? []

  return (
    <div style={{ background: 'var(--card)', borderRadius: 16, border: `1px solid ${totalOdds >= 10 ? 'rgba(245,166,35,0.35)' : 'var(--line)'}`, borderLeft: totalOdds >= 10 ? '3px solid var(--gold)' : undefined, marginBottom: 8, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px 10px', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)' }}>Betslip</span>
              <span style={{ background: 'var(--bg3)', color: 'var(--muted)', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>{games} games</span>
              <span style={{ background: risk.bg, color: risk.color, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, border: `1px solid ${risk.color}40` }}>{risk.label}</span>
              {finished
                ? <span style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted)', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>Free</span>
                : <span style={{ background: 'var(--green-lt)', color: 'var(--green)', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, border: '1px solid rgba(46,204,122,0.3)' }}>✓ Verified</span>}
              {(unlocked || owned) && !finished && (
                <span style={{ background: 'rgba(46,204,122,0.1)', color: 'var(--green)', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>Unlocked ✓</span>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
              {slip.posted_at ? new Date(slip.posted_at).toLocaleDateString('en-UG', { weekday: 'short', day: 'numeric', month: 'short' }) : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)' }}>{totalOdds.toFixed(2)}</div>
            <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>total odds</div>
          </div>
        </div>
        {(leagues.length > 0 || markets.length > 0) && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
            {leagues.slice(0, 3).map((l, i) => <Chip key={'l' + i}>{l}</Chip>)}
            {markets.slice(0, 3).map((m, i) => <Chip key={'m' + i}>{String(m).replace(/_/g, ' ')}</Chip>)}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          {open ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
        </div>
      </div>
      {open && (canView
        ? <SlipReveal betslipId={slip.id} />
        : <InlineBuyGate slip={slip} tipsterName={tipsterName} onUnlock={() => { setUnlocked(true); onPurchased?.() }} />)}
    </div>
  )
}

export function BetslipFeed({ slips, tipsterName, onPurchased }: { slips: Betslip[]; tipsterName?: string; onPurchased?: () => void }) {
  // Pre-load the buyer's purchases so already-owned slips show unlocked on ANY device.
  const [owned, setOwned] = useState<Set<string>>(new Set())
  useEffect(() => {
    fetch('/api/subscribe', { headers: buyerHeader() }).then(r => r.json()).then(d => {
      const ids = (d.subscriptions ?? []).filter((p: any) => p.status === 'active').map((p: any) => p.betslip_id)
      if (ids.length) setOwned(new Set(ids))
    }).catch(() => {})
  }, [])
  const sorted = [...slips].sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime())
  return (
    <>
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⚽</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--offwhite)' }}>No verified slips yet</div>
        </div>
      ) : sorted.map((slip, i) => (
        <BetslipCard key={slip.id} slip={slip} tipsterName={tipsterName} owned={owned.has(slip.id)} defaultOpen={i === 0 && slip.result !== 'pending'} onPurchased={onPurchased} />
      ))}
    </>
  )
}
