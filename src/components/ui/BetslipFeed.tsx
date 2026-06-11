'use client'
import { useState } from 'react'
import { Lock, ChevronDown, ChevronUp } from 'lucide-react'
import type { Betslip, SlipLeg } from '@/types/betslip'
import { getRiskLabel } from '@/types/betslip'
import { resolveImageUrl } from '@/lib/imageUpload'
import { usePayment } from '@/hooks/usePayment'

// ── HELPERS ───────────────────────────────────────────────────────
function Dot({ result }: { result: SlipLeg['result'] }) {
  const color = result === 'win' ? 'var(--green)' : result === 'loss' ? 'var(--red)' : 'var(--gold)'
  return <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, animation: result === 'pending' ? 'slipblink 1.5s ease-in-out infinite' : 'none' }} />
}

function ResultPill({ result }: { result: SlipLeg['result'] }) {
  if (result === 'win')  return <span className="pill-green">Won</span>
  if (result === 'loss') return <span className="pill-red">Lost</span>
  return <span className="pill-gold">Pending</span>
}

function LegRow({ leg }: { leg: SlipLeg }) {
  return (
    <div style={{ padding: '9px 14px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <Dot result={leg.result} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{leg.match}</div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{leg.pick} · {leg.league}</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)', flexShrink: 0 }}>{leg.odds.toFixed(2)}</div>
    </div>
  )
}

// ── BUY GATE (opens the real ioTec PaymentSheet) ─────────────────
function InlineBuyGate({ slip, tipsterName, onUnlock }: { slip: Betslip; tipsterName?: string; onUnlock: () => void }) {
  const { pay, sheet } = usePayment()

  async function buy() {
    const r = await pay({
      betslipId: slip.id,
      amount:    slip.slip_price,
      tipsterName,
      slipLabel: `${slip.legs?.length ?? slip.leg_count} legs · odds ${(slip.total_odds ?? 0).toFixed(2)}`,
    })
    // Refetch from the server — the paid slip now returns unlocked (with its code).
    if (r.status === 'success') onUnlock()
  }

  return (
    <div style={{ borderTop: '1px solid var(--line)', padding: '12px 14px 14px', background: 'rgba(0,0,0,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Lock size={15} color="var(--muted)" />
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Unlock to see full slip</div>
      </div>
      <button
        onClick={buy}
        style={{ width: '100%', padding: '12px', background: 'var(--gold)', color: '#1a0a00', border: 'none', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 800 }}
      >
        Buy slip · UGX {slip.slip_price.toLocaleString()}
      </button>
      <div style={{ textAlign: 'center', marginTop: 6, fontSize: 10, color: 'var(--muted)' }}>One-time · Mobile Money or Card</div>
      {sheet}
    </div>
  )
}

// ── SLIP CONTENT (legs, screenshot, or booking code) ─────────────
function SlipContent({ slip }: { slip: Betslip }) {
  const [copied, setCopied] = useState(false)

  function copyCode() {
    navigator.clipboard.writeText(slip.booking_code ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Booking code mode
  if (slip.booking_code) return (
    <div style={{ borderTop: '1px solid var(--line)', padding: '14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
        Booking code · {slip.betting_site}
      </div>
      <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '14px 16px', border: '1.5px solid rgba(245,166,35,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)', letterSpacing: 3, fontFamily: 'monospace' }}>
          {slip.booking_code}
        </span>
        <button onClick={copyCode} style={{ background: copied ? 'var(--green)' : 'var(--gold)', color: copied ? '#fff' : '#1a0a00', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
        Open <strong style={{ color: 'var(--offwhite)' }}>{slip.betting_site}</strong> → go to booking/share codes → enter this code to load the full slip.
      </div>
    </div>
  )

  if (slip.posting_mode === 'screenshot') {
    // Show parsed legs if available, otherwise just show the slip image
    if (slip.legs?.length > 0) {
      return <>{slip.legs.map(leg => <LegRow key={leg.id} leg={leg} />)}</>
    }
    // Fallback — show image only if legs weren't extracted
    if (slip.slip_image_url) return (
      <div style={{ borderTop: '1px solid var(--line)', padding: '12px 14px' }}>
        <img src={resolveImageUrl(slip.slip_image_url)} alt="Betslip" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(245,166,35,0.3)', display: 'block' }} />
      </div>
    )
    return <>{slip.legs?.map(leg => <LegRow key={leg.id} leg={leg} />)}</>
  }
  return <>{slip.legs.map(leg => <LegRow key={leg.id} leg={leg} />)}</>
}

// ── BETSLIP CARD ─────────────────────────────────────────────────
function BetslipCard({ slip, tipsterName, defaultOpen = false, onPurchased }: { slip: Betslip; tipsterName?: string; defaultOpen?: boolean; onPurchased?: () => void }) {
  const [open, setOpen] = useState(defaultOpen)

  // The server is the source of truth: `locked === false` means this buyer
  // paid (so the picks are present). win/loss slips are always free to view.
  // We do NOT trust localStorage here — a stale flag would show an empty
  // "unlocked" card whose code was stripped server-side.
  const finished = slip.result === 'win' || slip.result === 'loss'
  const canView  = finished || slip.locked === false
  const wonLegs   = slip.legs?.filter(l => l.result === 'win').length ?? 0
  const lostLegs  = slip.legs?.filter(l => l.result === 'loss').length ?? 0
  const pendLegs  = slip.legs?.filter(l => l.result === 'pending').length ?? 0
  const risk      = getRiskLabel(slip.total_odds)

  return (
    <div style={{ background: 'var(--card)', borderRadius: 16, border: `1px solid ${slip.total_odds >= 10 ? 'rgba(245,166,35,0.35)' : 'var(--line)'}`, borderLeft: slip.total_odds >= 10 ? '3px solid var(--gold)' : undefined, marginBottom: 8, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '12px 14px 10px', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)' }}>Betslip</span>
              <span style={{ background: 'var(--bg3)', color: 'var(--muted)', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>{slip.legs?.length ?? slip.leg_count} legs</span>
              <span style={{ background: risk.bg, color: risk.color, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, border: `1px solid ${risk.color}40` }}>{risk.label}</span>
              {/* Free to view badge for finished slips */}
              {finished && (
                <span style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted)', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>Free to view</span>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
              {new Date(slip.posted_at).toLocaleDateString('en-UG', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)' }}>{slip.total_odds.toFixed(2)}</div>
            <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>total odds</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {wonLegs  > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--green)', fontWeight: 600 }}><Dot result="win" />{wonLegs} won</div>}
            {lostLegs > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--red)', fontWeight: 600 }}><Dot result="loss" />{lostLegs} lost</div>}
            {pendLegs > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--gold)', fontWeight: 600 }}><Dot result="pending" />{pendLegs} pending</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ResultPill result={slip.result} />
            {open ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
          </div>
        </div>
      </div>

      {/* Body */}
      {open && (
        canView
          ? <SlipContent slip={slip} />
          : <InlineBuyGate slip={slip} tipsterName={tipsterName} onUnlock={() => onPurchased?.()} />
      )}
    </div>
  )
}

// ── MAIN FEED ─────────────────────────────────────────────────────
export function BetslipFeed({ slips, tipsterName, onPurchased }: { slips: Betslip[]; tipsterName?: string; onPurchased?: () => void }) {
  const sorted = [...slips].sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime())
  return (
    <>
      <style>{`
        @keyframes slipblink { 0%,100%{opacity:1;} 50%{opacity:0.25;} }
        @keyframes slipspin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .pill-green{background:var(--green-lt);color:var(--green);font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;border:1px solid rgba(46,204,122,0.3);}
        .pill-gold{background:var(--gold-lt);color:var(--gold);font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;border:1px solid rgba(245,166,35,0.3);}
        .pill-red{background:var(--red-lt);color:var(--red);font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;border:1px solid rgba(255,107,107,0.3);}
      `}</style>
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⚽</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--offwhite)' }}>No tips posted yet</div>
        </div>
      ) : sorted.map((slip, i) => (
        <BetslipCard key={slip.id} slip={slip} tipsterName={tipsterName} defaultOpen={i === 0 && slip.result !== 'pending'} onPurchased={onPurchased} />
      ))}
    </>
  )
}
