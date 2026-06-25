'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import type { Betslip } from '@/types/betslip'

function Dot({ result }: { result: string }) {
  const color = result === 'win' ? 'var(--green)' : result === 'loss' ? 'var(--red)' : 'var(--gold)'
  return <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
}

export function WinRateBadge({
  wins, total = 10, slips
}: {
  wins: number
  total?: number
  slips: Betslip[]
}) {
  const [open, setOpen] = useState(false)
  const pct = total > 0 ? (wins / total) * 100 : 0

  const last15days = slips.filter(s => {
    const d = new Date(s.posted_at)
    return (Date.now() - d.getTime()) < 15 * 24 * 60 * 60 * 1000
  })

  const wonCount     = last15days.filter(s => s.result === 'win').length
  const lostCount    = last15days.filter(s => s.result === 'loss').length
  const pendingCount = last15days.filter(s => s.result === 'pending').length

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--green-lt)', border: '1px solid rgba(46,204,122,0.3)', borderRadius: 10, padding: '5px 10px', cursor: 'pointer' }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)' }}>{wins}/{total}</div>
        <div style={{ fontSize: 10, color: 'var(--muted)' }}>wins</div>
        <div style={{ height: 4, width: 36, background: 'rgba(255,255,255,0.12)', borderRadius: 2, marginLeft: 2 }}>
          <div style={{ height: 4, width: `${pct}%`, background: 'var(--green)', borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>▸</span>
      </div>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{ background: 'var(--bg2)', borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', padding: 16 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--white)' }}>Win history</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Last 15 days</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} color="var(--muted)" />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              {[
                { val: wonCount,     label: 'Won',     color: 'var(--green)' },
                { val: lostCount,    label: 'Lost',    color: 'var(--red)'   },
                { val: pendingCount, label: 'Pending', color: 'var(--gold)'  },
              ].map(m => (
                <div key={m.label} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: m.color }}>{m.val}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{m.label}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Betslip history</div>

            {last15days.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 13 }}>No slips in the last 15 days</div>
            ) : (
              last15days.map((slip, i) => {
                const wonL = slip.legs.filter(l => l.result === 'win').length
                const lostL = slip.legs.filter(l => l.result === 'loss').length
                const pendL = slip.legs.filter(l => l.result === 'pending').length
                return (
                  <div key={slip.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < last15days.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)' }}>Betslip · {slip.legs.length} legs</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                          background: slip.result === 'win' ? 'var(--green-lt)' : slip.result === 'loss' ? 'var(--red-lt)' : 'var(--gold-lt)',
                          color: slip.result === 'win' ? 'var(--green)' : slip.result === 'loss' ? 'var(--red)' : 'var(--gold)',
                          border: `1px solid ${slip.result === 'win' ? 'rgba(46,204,122,0.3)' : slip.result === 'loss' ? 'rgba(255,107,107,0.3)' : 'rgba(245,166,35,0.3)'}`,
                        }}>
                          {slip.result === 'win' ? 'Won' : slip.result === 'loss' ? 'Lost' : 'Pending'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                          {new Date(slip.posted_at).toLocaleDateString('en-UG', { day: 'numeric', month: 'short' })}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)' }}>Odds {slip.total_odds.toFixed(2)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                      {wonL  > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--green)', fontWeight: 600 }}><Dot result="win" />{wonL}</div>}
                      {lostL > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--red)', fontWeight: 600 }}><Dot result="loss" />{lostL}</div>}
                      {pendL > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--gold)', fontWeight: 600 }}><Dot result="pending" />{pendL}</div>}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </>
  )
}
