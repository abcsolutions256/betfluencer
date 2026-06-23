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

  if (data.booking_code) return (
    <div style={{ borderTop: '1px solid var(--line)', padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Booking code · {data.betting_site}</div>
      <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '14px 16px', border: '1.5px solid rgba(245,166,35,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold)', letterSpacing: 3, fontFamily: 'monospace' }}>{data.booking_code}</span>
        <button onClick={() => { navigator.clipboard.writeText(data.booking_code); setCopied(true); setTimeout(() => setCopied(false), 2000) }} style={{ background: copied ? 'var(--green)' : 'var(--gold)', color: copied ? '#fff' : '#1a0a00', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{copied ? 'Copied ✓' : 'Copy'}</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>Open <strong style={{ color: 'var(--offwhite)' }}>{data.betting_site}</strong> → booking/share codes → enter this code to load the full slip.</div>
    </div>
  )

  if (data.slip_image_url) return (
    <div style={{ borderTop: '1px solid var(--line)', padding: '12px 14px' }}>
      <img src={resolveImageUrl(data.slip_image_url)} alt="Betslip" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(245,166,35,0.3)', display: 'block' }} />
    </div>
  )

  if (data.legs?.length) return (
    <>{data.legs.map((l: any, i: number) => (
      <div key={i} style={{ padding: '9px 14px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)' }}>{l.match}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{l.pick} · {l.league}</div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--gold)' }}>{Number(l.odds || 0).toFixed(2)}</div>
      </div>
    ))}</>
  )

  return <div style={{ borderTop: '1px solid var(--line)', padding: 14, fontSize: 12, color: 'var(--muted)' }}>Slip unlocked — no detail available.</div>
}
