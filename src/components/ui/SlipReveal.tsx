'use client'
// Fetches a slip's unlocked content from the gated /reveal endpoint and
// renders it (booking code, screenshot, or manual legs). Used by the
// channel feed and the marketplace once a slip is purchased/finished.
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { resolveImageUrl } from '@/lib/imageUpload'
import { buyerHeader } from '@/lib/guestId'

export function SlipReveal({ betslipId }: { betslipId: string }) {
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    fetch(`/api/slips/${betslipId}/reveal`, { headers: buyerHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [betslipId])

  if (loading) return <div style={{ borderTop: '1px solid var(--line)', padding: 20, textAlign: 'center' }}><Loader2 size={20} color="var(--gold)" className="spin" /></div>
  if (!data)   return <div style={{ borderTop: '1px solid var(--line)', padding: 14, fontSize: 12, color: 'var(--muted)' }}>Could not load slip content.</div>

  const norm: any[] = Array.isArray(data.normalized) ? data.normalized : []
  const fmtKO = (iso?: string) => iso ? new Date(iso).toLocaleString('en-UG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

  // The verified match details — teams, market, pick (1/X/2 + team), kickoff, odds.
  const picks = norm.length > 0 ? (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, padding: '10px 14px 2px', borderTop: '1px solid var(--line)' }}>
        Match details · {norm.length} {norm.length === 1 ? 'game' : 'games'}{data.total_odds ? ` · odds ${data.total_odds}` : ''}
      </div>
      {norm.map((leg: any, i: number) => (
        <div key={i} style={{ padding: '8px 14px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)' }}>{leg.teams || `${leg.homeTeam ?? '?'} vs ${leg.awayTeam ?? '?'}`}</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 1, lineHeight: 1.45 }}>
              <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{leg.marketLabel || leg.market || '—'}</span>
              {' · pick '}<span style={{ color: 'var(--green)', fontWeight: 800 }}>{leg.pickSymbol ?? '—'}</span>
              {leg.pickTeam ? ` (${leg.pickTeam})` : ''}
              {leg.kickoff ? ` · ${fmtKO(leg.kickoff)}` : ''}
            </div>
          </div>
          {leg.odds && <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>{leg.odds}</div>}
        </div>
      ))}
    </div>
  ) : null

  // Manual / parsed legs (e.g. a screenshot slip whose picks were parsed) —
  // shown when there are no Gemini-normalised picks.
  const legs: any[] = Array.isArray(data.legs) ? data.legs : []
  const legsBlock = legs.length > 0 ? (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, padding: '10px 14px 2px', borderTop: '1px solid var(--line)' }}>
        Match details · {legs.length} {legs.length === 1 ? 'game' : 'games'}
      </div>
      {legs.map((l: any, i: number) => (
        <div key={i} style={{ padding: '8px 14px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)' }}>{l.match}</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 1 }}>{[l.pick, l.league].filter(Boolean).join(' · ')}</div>
          </div>
          {l.odds ? <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>{Number(l.odds).toFixed(2)}</div> : null}
        </div>
      ))}
    </div>
  ) : null

  // The match details to render alongside a code/screenshot: prefer the
  // normalised picks, else the parsed/manual legs.
  const details = picks ?? legsBlock

  // Booking-code slip → the code to load on the bookie + the match details.
  if (data.booking_code) return (
    <div>
      <div style={{ borderTop: '1px solid var(--line)', padding: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Booking code · {data.betting_site}</div>
        <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '14px 16px', border: '1.5px solid rgba(245,166,35,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)', letterSpacing: 3, fontFamily: 'monospace' }}>{data.booking_code}</span>
          <button onClick={() => { navigator.clipboard.writeText(data.booking_code); setCopied(true); setTimeout(() => setCopied(false), 2000) }} style={{ background: copied ? 'var(--green)' : 'var(--gold)', color: copied ? '#fff' : '#1a0a00', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{copied ? 'Copied ✓' : 'Copy'}</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginTop: 10 }}>Open <strong style={{ color: 'var(--offwhite)' }}>{data.betting_site}</strong> → booking/share codes → enter this code to load the full slip.</div>
      </div>
      {details}
    </div>
  )

  // Screenshot slip → the uploaded image + its parsed match details.
  if (data.slip_image_url) return (
    <div>
      <div style={{ borderTop: '1px solid var(--line)', padding: '12px 14px' }}>
        <img src={resolveImageUrl(data.slip_image_url)} alt="Betslip" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(245,166,35,0.3)', display: 'block' }} />
      </div>
      {details}
    </div>
  )

  // No code/image — just the structured match details (manual / parsed legs).
  if (details) return <div>{details}</div>

  return <div style={{ borderTop: '1px solid var(--line)', padding: 14, fontSize: 12, color: 'var(--muted)' }}>Slip unlocked — no detail available.</div>
}
