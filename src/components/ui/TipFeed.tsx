'use client'
import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { ResultPill } from '@/components/ui'
import { AdCardBetween, AdCardInline } from '@/components/ui/AdCard'
import { getAdsForPlacement, pickAd } from '@/lib/mockAds'
import type { Tip } from '@/types'
import type { Ad } from '@/types/ads'
import { format, isToday, isYesterday, parseISO } from 'date-fns'

function Countdown({ matchTime }: { matchTime: string }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const target = new Date(matchTime).getTime()
    const update = () => setSecs(Math.max(0, Math.floor((target - Date.now()) / 1000)))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [matchTime])
  if (secs <= 0) return null
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '8px 12px', margin: '0 0 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>Kicks off in</div>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        {[{ val: h, unit: 'hrs' },{ val: m, unit: 'min' },{ val: s, unit: 'sec' }].map((b, i) => (
          <div key={b.unit} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {i > 0 && <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold)' }}>:</span>}
            <div style={{ background: 'var(--bg2)', borderRadius: 6, padding: '4px 7px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold)', lineHeight: 1 }}>{String(b.val).padStart(2,'0')}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{b.unit}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TipCard({ tip, inlineAd }: { tip: Tip; inlineAd: Ad | null }) {
  const now        = Date.now()
  const matchMs    = new Date(tip.match_time).getTime()
  const isUpcoming = matchMs > now && tip.result === 'pending'
  const isLive     = matchMs <= now && tip.result === 'pending' && (now - matchMs) < 2 * 60 * 60 * 1000
  const isHot      = isUpcoming || isLive

  return (
    <div style={{ background: 'var(--card)', borderRadius: 16, border: `1px solid ${isHot ? 'rgba(245,166,35,0.4)' : 'var(--line)'}`, borderLeft: isHot ? '3px solid var(--gold)' : undefined, marginBottom: 8, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            {isLive && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', animation: 'blink 1s ease-in-out infinite' }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--red)' }}>LIVE</span>
              </div>
            )}
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)', marginBottom: 3 }}>{tip.match}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{tip.pick}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)', lineHeight: 1 }}>{tip.odds}</div>
            <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>odds</div>
          </div>
        </div>
      </div>
      {isUpcoming && tip.match_time && (
        <div style={{ padding: '0 12px' }}><Countdown matchTime={tip.match_time} /></div>
      )}
      <div style={{ padding: '8px 14px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>
          <Clock size={12} color="var(--muted)" />
          {tip.match_time ? format(parseISO(tip.match_time), 'HH:mm') : '—'}
        </div>
        <ResultPill result={tip.result} />
      </div>
      {/* Inline ad strip — sits inside the card at the bottom */}
      {inlineAd && <AdCardInline ad={inlineAd} />}
    </div>
  )
}

function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr)
  if (isToday(d))     return `Today — ${format(d, 'EEEE d MMM')}`
  if (isYesterday(d)) return `Yesterday — ${format(d, 'EEEE d MMM')}`
  return format(d, 'EEEE d MMM')
}

export function TipFeed({ tips }: { tips: Tip[] }) {
  const betweenAds = getAdsForPlacement('between_cards')
  const insideAds  = getAdsForPlacement('inside_card')

  if (tips.length === 0) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>⚽</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>No tips posted yet</div>
    </div>
  )

  // Group by date
  const groups: Record<string, Tip[]> = {}
  tips.forEach(t => {
    const key = format(parseISO(t.created_at), 'yyyy-MM-dd')
    if (!groups[key]) groups[key] = []
    groups[key].push(t)
  })

  let tipCount = 0

  return (
    <>
      <style>{`@keyframes blink { 0%,100%{opacity:1;} 50%{opacity:0.2;} }`}</style>
      {Object.entries(groups).map(([date, dayTips]) => (
        <div key={date}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.2, margin: '14px 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            {dayLabel(`${date}T12:00:00Z`)}
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>
          {dayTips.map(t => {
            tipCount++
            // Every 3rd tip: insert a between-cards ad AFTER the tip
            const showBetweenAd = tipCount % 3 === 0 && betweenAds.length > 0
            // Inline ad on every 4th tip (offset from between-card ads)
            const inlineAd = tipCount % 4 === 0 ? pickAd(insideAds, tipCount) : null
            return (
              <div key={t.id}>
                <TipCard tip={t} inlineAd={inlineAd} />
                {showBetweenAd && <AdCardBetween ad={pickAd(betweenAds, tipCount)!} />}
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}
