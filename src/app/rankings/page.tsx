'use client'
import { useState } from 'react'
import { TopBar, BottomNav } from '@/components/layout/Navigation'
import { MOCK_TIPSTERS } from '@/lib/mockData'

function zoneColor(rank: number, total: number): string {
  if (rank <= 2)                          return '#a855f7'
  if (rank <= Math.floor(total * 0.3))    return '#3b82f6'
  if (rank >= total - 1)                  return '#ef4444'
  return '#6b7280'
}

function winPctColor(pct: number): string {
  if (pct >= 0.7) return '#15803d'
  if (pct >= 0.5) return '#a16207'
  return '#b91c1c'
}

function Dot({ result }: { result: 'W' | 'L' | 'P' }) {
  const cfg = {
    W: { bg: '#16a34a', color: '#fff' },
    L: { bg: '#dc2626', color: '#fff' },
    P: { bg: '#ca8a04', color: '#fff' },
  }[result]
  return (
    <span style={{ width: 22, height: 22, borderRadius: '50%', background: cfg.bg, color: cfg.color, fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {result}
    </span>
  )
}

function StreakBadge({ streak }: { streak: string }) {
  const isWin = streak.startsWith('W')
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: isWin ? '#dcfce7' : '#fee2e2', color: isWin ? '#15803d' : '#b91c1c', whiteSpace: 'nowrap' }}>
      {isWin ? 'Win' : 'Loss'} {streak.slice(1)}
    </span>
  )
}

// ── ROLLING 4-WEEK WINDOW ────────────────────────────────────────
// Only slips posted within the last 28 days count toward rankings.
// Anything older is excluded — the table always shows the current
// 4-week window only. As week 5 begins, week 1 drops off.

import { MOCK_BETSLIPS } from '@/lib/mockData'

const WINDOW_DAYS = 28
const WINDOW_MS   = WINDOW_DAYS * 24 * 60 * 60 * 1000

function getWindowSlips(tipsterId: string) {
  const cutoff = Date.now() - WINDOW_MS
  return (MOCK_BETSLIPS[tipsterId] ?? []).filter(
    s => new Date(s.posted_at).getTime() >= cutoff
  )
}

function calcStreak(slips: any[]): string {
  const settled = [...slips]
    .sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime())
    .filter(s => s.result !== 'pending')
  if (!settled.length) return 'P0'
  const first = settled[0].result === 'win' ? 'W' : 'L'
  let count = 0
  for (const s of settled) {
    const r = s.result === 'win' ? 'W' : 'L'
    if (r === first) count++; else break
  }
  return `${first}${count}`
}

function calcLast5(slips: any[]): ('W'|'L'|'P')[] {
  return [...slips]
    .sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime())
    .slice(0, 5)
    .filter(s => s.result !== 'pending')
    .map(s => s.result === 'win' ? 'W' : 'L')
    .reverse() as ('W'|'L'|'P')[]
}

const TIPSTER_STATS = MOCK_TIPSTERS.map((t, i) => {
  const windowSlips = getWindowSlips(t.id)
  const settled     = windowSlips.filter(s => s.result !== 'pending')
  const wins        = settled.filter(s => s.result === 'win')
  const losses      = settled.filter(s => s.result === 'loss')
  const tp          = windowSlips.length
  const w           = wins.length
  const l           = losses.length
  const avgOdds     = wins.length
    ? parseFloat((wins.reduce((sum, s) => sum + s.total_odds, 0) / wins.length).toFixed(2))
    : t.avg_odds
  const winPct      = settled.length ? w / settled.length : t.wins_last_10 / 10
  const score       = parseFloat((winPct * avgOdds).toFixed(2))

  return {
    id: t.id, name: t.name, username: t.username,
    sport: t.sport.split(' · ')[0],
    avatar: t.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
    color: ['#2ECC7A', '#F5A623', '#4A9EFF', '#FF6B6B'][i] ?? '#2ECC7A',
    tp: tp || t.wins_last_10 + 3,
    w:  tp ? w  : t.wins_last_10,
    l:  tp ? l  : 10 - t.wins_last_10,
    avgOdds, winPct, score,
    streak:  tp ? calcStreak(windowSlips)  : (t.wins_last_10 >= 6 ? `W${t.wins_last_10 - 5}` : `L2`),
    last5:   tp ? calcLast5(windowSlips)   : (['W','W','L','L','W'] as ('W'|'L'|'P')[]),
    verified: t.verified,
    windowNote: tp === 0 ? 'No slips this period' : null,
  }
}).sort((a, b) => b.score - a.score)

// light card style shared
const cell: React.CSSProperties = { padding: '10px 6px', textAlign: 'center', fontSize: 12, color: '#111827', borderBottom: '1px solid #e5e7eb' }
const cellL: React.CSSProperties = { ...cell, textAlign: 'left' }

export default function RankingsPage() {
  const [showExtra, setShowExtra] = useState(false)
  const filtered = TIPSTER_STATS

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <main className="flex-1 overflow-y-auto pb-6">

        {/* Header — light card on dark bg */}
        <div style={{ background: 'var(--bg2)', padding: '12px 14px 14px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: '#0d9e5c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 16 }}>🏆</span>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--white)' }}>Betfluencer rankings</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Tips placed · win rate · avg odds · streak</div>
              </div>
            </div>
            <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--bg3)', border: '1px solid var(--line)', borderRadius: 20, padding: '3px 10px' }}>2025–26</span>
            <span style={{ fontSize: 10, color: 'var(--gold)', background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
              Last 28 days
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--bg3)', border: '1px solid var(--line)', borderRadius: 8, padding: '5px 10px' }}>
            Score = <strong style={{ color: 'var(--offwhite)' }}>win rate × avg winning odds</strong> · <strong style={{ color: 'var(--gold)' }}>rolling 4 weeks only</strong> · no draws, W / L / Pending
          </div>
        </div>

        {/* Legend + toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[['#a855f7','Top 2'],['#3b82f6','Elite'],['#6b7280','Mid'],['#ef4444','Bottom']].map(([c,l]) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#6b7280' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />{l}
              </span>
            ))}
          </div>
          <button
            onClick={() => setShowExtra(v => !v)}
            style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20, border: '1px solid #d1d5db', background: showExtra ? '#0d9e5c' : '#fff', color: showExtra ? '#fff' : '#374151', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {showExtra ? 'Hide Streak/Score' : 'Show Streak/Score'}
          </button>
        </div>

        {/* TABLE — light background */}
        <div style={{ overflowX: 'auto', background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ ...cellL, width: 36, padding: '8px 4px 8px 8px', fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>#</th>
                <th style={{ ...cellL, minWidth: 120, fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>Tipster</th>
                <th style={{ ...cell, width: 28, fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>TP</th>
                <th style={{ ...cell, width: 24, fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>W</th>
                <th style={{ ...cell, width: 24, fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>L</th>
                <th style={{ ...cell, width: 46, fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>Odds</th>
                <th style={{ ...cell, width: 40, fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>Win%</th>
                <th style={{ ...cell, width: 96, fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>Last 5</th>
                {showExtra && <th style={{ ...cell, width: 64, fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>Streak</th>}
                {showExtra && <th style={{ ...cell, width: 42, fontSize: 10, color: '#9ca3af', fontWeight: 500 }}>Score</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => {
                const rank     = TIPSTER_STATS.indexOf(t) + 1
                const barColor = zoneColor(rank, TIPSTER_STATS.length)
                const rowBg    = i % 2 === 0 ? '#ffffff' : '#f9fafb'
                return (
                  <tr key={t.id} style={{ background: rowBg }}>

                    {/* Rank + bar */}
                    <td style={{ ...cellL, padding: '10px 4px 10px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: 3, height: 34, borderRadius: 2, background: barColor, marginRight: 6, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{rank}</span>
                      </div>
                    </td>

                    {/* Tipster */}
                    <td style={{ ...cellL }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: t.color + '22', color: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>{t.avatar}</div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 3 }}>
                            {t.name}
                            {t.verified && <span style={{ color: '#0d9e5c', fontSize: 10 }}>✓</span>}
                          </div>
                          <div style={{ fontSize: 10, color: '#9ca3af' }}>{t.sport}</div>
                        </div>
                      </div>
                    </td>

                    <td style={{ ...cell, color: '#374151', fontWeight: 500 }}>{t.tp}</td>
                    <td style={{ ...cell, color: '#15803d', fontWeight: 700 }}>{t.w}</td>
                    <td style={{ ...cell, color: '#b91c1c', fontWeight: 700 }}>{t.l}</td>
                    <td style={{ ...cell, color: '#d97706', fontWeight: 700 }}>{t.avgOdds.toFixed(2)}</td>
                    <td style={{ ...cell }}>
                      <span style={{ fontWeight: 700, color: winPctColor(t.winPct) }}>{Math.round(t.winPct * 100)}%</span>
                    </td>
                    <td style={{ ...cell }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        {t.last5.map((r, j) => <Dot key={j} result={r} />)}
                      </div>
                    </td>
                    {showExtra && <td style={{ ...cell }}><StreakBadge streak={t.streak} /></td>}
                    {showExtra && <td style={{ ...cell }}><span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{t.score.toFixed(2)}</span></td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', background: '#fff' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🏆</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>No tipsters in this category yet</div>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
