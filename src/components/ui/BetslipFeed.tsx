'use client'
import { useState } from 'react'
import { Lock, ChevronDown, ChevronUp, Smartphone, CheckCircle, Loader2 } from 'lucide-react'
import type { Betslip, SlipLeg } from '@/types/betslip'
import { getRiskLabel } from '@/types/betslip'
import { resolveImageUrl } from '@/lib/imageUpload'

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

// ── INLINE BUY FLOW (shown in gate instead of modal) ─────────────
function InlineBuyGate({ slip, onUnlock }: { slip: Betslip; onUnlock: () => void }) {
  const [step,  setStep]  = useState<'gate'|'phone'|'prompt'|'paying'>('gate')
  const [phone, setPhone] = useState('')

  async function pay() {
    setStep('paying')
    await new Promise(r => setTimeout(r, 1800))
    localStorage.setItem(`bf_slip_${slip.id}`, `+256${phone}`)
    onUnlock()   // instantly shows legs
  }

  if (step === 'paying') return (
    <div style={{ borderTop: '1px solid var(--line)', padding: '16px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.12)' }}>
      <Loader2 size={24} color="var(--gold)" style={{ animation: 'slipspin 1s linear infinite' }} />
      <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Processing payment...</div>
    </div>
  )

  if (step === 'prompt') return (
    <div style={{ borderTop: '1px solid var(--line)', padding: '14px', background: 'rgba(0,0,0,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Smartphone size={16} color="var(--gold)" />
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)' }}>Check your phone</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Enter your PIN to pay <span style={{ color: 'var(--gold)', fontWeight: 800 }}>UGX {slip.slip_price.toLocaleString()}</span></div>
      <button onClick={pay} style={{ width: '100%', padding: '11px', background: 'var(--gold)', color: '#1a0a00', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer', marginBottom: 6 }}>
        I've entered my PIN — unlock now
      </button>
      <button onClick={() => setStep('phone')} style={{ width: '100%', padding: '9px', background: 'none', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        Didn't receive it?
      </button>
    </div>
  )

  if (step === 'phone') return (
    <div style={{ borderTop: '1px solid var(--line)', padding: '14px', background: 'rgba(0,0,0,0.12)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)', marginBottom: 3 }}>Buy this slip</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>Unlocks immediately after payment</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ padding: '10px 10px', background: 'var(--bg3)', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 10, fontWeight: 800, color: 'var(--offwhite)', fontSize: 12, flexShrink: 0 }}>+256</div>
        <input
          style={{ flex: 1, padding: '10px 12px', background: 'var(--bg3)', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 10, fontSize: 14, color: 'var(--white)', outline: 'none' }}
          type="tel" placeholder="7XX XXX XXX" value={phone} onChange={e => setPhone(e.target.value)}
          autoFocus
        />
      </div>
      <button
        onClick={() => phone.length >= 7 && setStep('prompt')}
        style={{ width: '100%', padding: '11px', background: phone.length < 7 ? 'rgba(245,166,35,0.35)' : 'var(--gold)', color: '#1a0a00', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: phone.length < 7 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <Smartphone size={14} /> Pay UGX {slip.slip_price.toLocaleString()}
      </button>
    </div>
  )

  // Default gate
  return (
    <div style={{ borderTop: '1px solid var(--line)', padding: '12px 14px 14px', background: 'rgba(0,0,0,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Lock size={15} color="var(--muted)" />
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Unlock to see full slip</div>
      </div>
      <button
        onClick={() => setStep('phone')}
        style={{ width: '100%', padding: '12px', background: 'var(--gold)', color: '#1a0a00', border: 'none', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 800 }}
      >
        Buy slip · UGX {slip.slip_price.toLocaleString()}
      </button>
      <div style={{ textAlign: 'center', marginTop: 6, fontSize: 10, color: 'var(--muted)' }}>One-time · Unlocks immediately</div>
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
function BetslipCard({ slip, defaultOpen = false }: { slip: Betslip; defaultOpen?: boolean }) {
  const [open,    setOpen]    = useState(defaultOpen)
  const [unlocked, setUnlocked] = useState(() => {
    if (typeof window === 'undefined') return false
    return !!localStorage.getItem(`bf_slip_${slip.id}`)
  })

  // RULE: pending = locked until paid. win/loss = free for everyone.
  const finished  = slip.result === 'win' || slip.result === 'loss'
  const canView   = finished || unlocked
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
          : <InlineBuyGate slip={slip} onUnlock={() => setUnlocked(true)} />
      )}
    </div>
  )
}

// ── MAIN FEED ─────────────────────────────────────────────────────
export function BetslipFeed({ slips }: { slips: Betslip[] }) {
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
        <BetslipCard key={slip.id} slip={slip} defaultOpen={i === 0 && slip.result !== 'pending'} />
      ))}
    </>
  )
}
