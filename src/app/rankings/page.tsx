'use client'
import { useState, useEffect } from 'react'
import { TopBar, BottomNav } from '@/components/layout/Navigation'

type TipsterRow = {
  id: string
  name: string
  username: string
  sport: string
  wins_last_10: number
  losses: number
  slips_posted: number
  avg_odds: number
  roi: number
  last5: string
  subscriber_count: number
  tick_type: string | null
  verified: boolean
  slug: string
}

function zoneColor(rank: number, total: number): string {
  if (rank <= 2)                        return '#a855f7'
  if (rank <= Math.floor(total * 0.3)) return '#3b82f6'
  if (rank >= total - 1)               return '#ef4444'
  return '#6b7280'
}

function winPctColor(pct: number): string {
  if (pct >= 0.7) return '#15803d'
  if (pct >= 0.5) return '#a16207'
  return '#b91c1c'
}

function ResultDots({ last5 }: { last5: string }) {
  const results = last5 ? last5.split(',').filter(Boolean) : []
  if (results.length === 0) {
    return <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
  }
  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
      {results.map((r, i) => {
        const bg = r === 'W' ? '#16c60c' : r === 'L' ? '#ff2d2d' : '#f5a623'
        return (
          <span
            key={i}
            title={r === 'W' ? 'Won' : r === 'L' ? 'Lost' : 'Pending'}
            style={{
              width: 16, height: 16, borderRadius: '50%',
              background: bg,
              boxShadow: `0 0 6px ${bg}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 800, color: '#fff', flexShrink: 0,
            }}
          >
            {r}
          </span>
        )
      })}
    </div>
  )
}

function streakLabel(last5: string): { text: string; color: string } {
  const results = last5 ? last5.split(',').filter(Boolean) : []
  if (results.length === 0) return { text: '—', color: '#9ca3af' }
  const first = results[0]
  let n = 0
  for (const r of results) { if (r === first) n++; else break }
  if (first === 'W') return { text: `W${n}`, color: '#16a34a' }
  if (first === 'L') return { text: `L${n}`, color: '#dc2626' }
  return { text: `P${n}`, color: '#d97706' }
}

const cell: React.CSSProperties = { padding: '10px 6px', textAlign: 'center', fontSize: 12, color: '#111827', borderBottom: '1px solid #e5e7eb' }
const cellL: React.CSSProperties = { ...cell, textAlign: 'left' }
const th: React.CSSProperties = { fontSize: 10, color: '#9ca3af', fontWeight: 500 }

const COLORS = ['#2ECC7A', '#F5A623', '#4A9EFF', '#FF6B6B', '#a855f7', '#3b82f6']

export default function RankingsPage() {
  const [tipsters, setTipsters] = useState<TipsterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showExtra, setShowExtra] = useState(false)

  useEffect(() => {
    fetch('/api/tipster', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const sorted = (d.tipsters ?? []).sort((a: TipsterRow, b: TipsterRow) => {
          const scoreA = (a.wins_last_10 / 10) * (a.avg_odds || 1)
          const scoreB = (b.wins_last_10 / 10) * (b.avg_odds || 1)
          return scoreB - scoreA
        })
        setTipsters(sorted)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col min-h-screen">
      <style>{`
        /* Hide lower-priority columns on mobile, keep on desktop */
        @media (max-width: 640px) {
          .rk-optional { display: none !important; }
        }
      `}</style>
      <TopBar />
      <main className="flex-1 overflow-y-auto pb-6">

        <div style={{ background: 'var(--bg2)', padding: '12px 14px 14px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: '#0d9e5c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 16 }}>🏆</span>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--white)' }}>Betfluencer rankings</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Win rate · avg odds · score</div>
              </div>
            </div>
            <span style={{ fontSize: 10, color: 'var(--gold)', background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
              Last 28 days
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--bg3)', border: '1px solid var(--line)', borderRadius: 8, padding: '5px 10px' }}>
            Score = <strong style={{ color: 'var(--offwhite)' }}>win rate × avg winning odds</strong> · <strong style={{ color: 'var(--gold)' }}>rolling 4 weeks only</strong>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[['#a855f7','Top 2'],['#3b82f6','Elite'],['#6b7280','Mid'],['#ef4444','Bottom']].map(([c,l]) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#6b7280' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />{l}
              </span>
            ))}
          </div>
          <button onClick={() => setShowExtra(v => !v)} style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20, border: '1px solid #d1d5db', background: showExtra ? '#0d9e5c' : '#fff', color: showExtra ? '#fff' : '#374151', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {showExtra ? 'Hide Score' : 'Show Score'}
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>Loading rankings...</div>
        ) : (
          <div style={{ overflowX: 'auto', background: '#fff', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ ...cellL, ...th, width: 36, padding: '8px 4px 8px 8px' }}>#</th>
                  <th style={{ ...cellL, ...th, minWidth: 120 }}>Tipster</th>
                  <th style={{ ...cell, ...th, width: 38 }}>Slips</th>
                  <th style={{ ...cell, ...th, width: 28 }}>W</th>
                  <th className="rk-optional" style={{ ...cell, ...th, width: 28 }}>L</th>
                  <th style={{ ...cell, ...th, width: 44 }}>Win%</th>
                  <th style={{ ...cell, ...th, width: 46 }}>Odds</th>
                  <th style={{ ...cell, ...th, width: 56 }}>ROI</th>
                  <th className="rk-optional" style={{ ...cell, ...th, width: 56 }}>Streak</th>
                  <th className="rk-optional" style={{ ...cell, ...th, width: 110 }}>Last 5</th>
                  {showExtra && <th style={{ ...cell, ...th, width: 50 }}>Score</th>}
                </tr>
              </thead>
              <tbody>
                {tipsters.map((t, i) => {
                  const rank = i + 1
                  const barColor = zoneColor(rank, tipsters.length)
                  const settled = (t.wins_last_10 ?? 0) + (t.losses ?? 0)
                  const winPct = settled > 0 ? t.wins_last_10 / settled : 0
                  const score = (t.wins_last_10 / 10) * (t.avg_odds || 1)
                  const avatar = t.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                  const color = COLORS[i % COLORS.length]
                  const rowBg = i % 2 === 0 ? '#ffffff' : '#f9fafb'
                  const streak = streakLabel(t.last5 ?? '')
                  const roi = t.roi ?? 0
                  return (
                    <tr key={t.id} style={{ background: rowBg }}>
                      <td style={{ ...cellL, padding: '10px 4px 10px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <div style={{ width: 3, height: 34, borderRadius: 2, background: barColor, marginRight: 6, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{rank}</span>
                        </div>
                      </td>
                      <td style={{ ...cellL }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 7, background: color + '22', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>{avatar}</div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 3 }}>
                              {t.name}
                              {t.verified && <span style={{ color: '#0d9e5c', fontSize: 10 }}>✓</span>}
                            </div>
                            <div style={{ fontSize: 10, color: '#9ca3af' }}>{t.sport || 'Football'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ ...cell, color: '#374151', fontWeight: 600 }}>{t.slips_posted ?? 0}</td>
                      <td style={{ ...cell, color: '#15803d', fontWeight: 700 }}>{t.wins_last_10}</td>
                      <td className="rk-optional" style={{ ...cell, color: '#b91c1c', fontWeight: 700 }}>{t.losses ?? 0}</td>
                      <td style={{ ...cell }}>
                        <span style={{ fontWeight: 700, color: winPctColor(winPct) }}>{Math.round(winPct * 100)}%</span>
                      </td>
                      <td style={{ ...cell, color: '#d97706', fontWeight: 700 }}>{(t.avg_odds || 0).toFixed(2)}</td>
                      <td style={{ ...cell, fontWeight: 700, color: roi >= 0 ? '#15803d' : '#b91c1c' }}>
                        {roi >= 0 ? '+' : ''}{roi}%
                      </td>
                      <td className="rk-optional" style={{ ...cell }}>
                        <span style={{ fontWeight: 800, color: streak.color }}>{streak.text}</span>
                      </td>
                      <td className="rk-optional" style={{ ...cell }}><ResultDots last5={t.last5 ?? ''} /></td>
                      {showExtra && <td style={{ ...cell }}><span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{score.toFixed(2)}</span></td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && tipsters.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', background: '#fff' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🏆</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>No rankings yet</div>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
