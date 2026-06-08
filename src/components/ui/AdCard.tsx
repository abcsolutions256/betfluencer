'use client'
import { useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import type { Ad } from '@/types/ads'

// ── BETWEEN-CARDS AD ─────────────────────────────────────────────
export function AdCardBetween({ ad }: { ad: Ad }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  function handleClick() {
    // In production: fire click tracking API call
    fetch('/api/ads/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad_id: ad.id }),
    }).catch(() => {})
    window.open(ad.link, '_blank', 'noopener,noreferrer')
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1A3520 0%, #1E4028 100%)',
      borderRadius: 16,
      border: '1px solid rgba(245,166,35,0.25)',
      marginBottom: 10,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Sponsored label */}
      <div style={{
        position: 'absolute', top: 8, left: 12,
        fontSize: 9, fontWeight: 700,
        color: 'rgba(255,255,255,0.35)',
        textTransform: 'uppercase', letterSpacing: 1,
      }}>Sponsored</div>

      {/* Dismiss button */}
      <button
        onClick={() => setDismissed(true)}
        style={{
          position: 'absolute', top: 6, right: 8,
          background: 'rgba(255,255,255,0.1)', border: 'none',
          borderRadius: '50%', width: 20, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', padding: 0,
        }}
        aria-label="Dismiss ad"
      >
        <X size={11} color="rgba(255,255,255,0.5)" />
      </button>

      {ad.format === 'banner' ? (
        // Banner ad
        <div onClick={handleClick} style={{ cursor: 'pointer' }}>
          <div style={{
            height: 90,
            background: 'linear-gradient(135deg, #0F3320 0%, #1E4C30 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginTop: 24,
          }}>
            {ad.image_url ? (
              <img src={ad.image_url} alt={ad.headline} style={{ maxHeight: 80, maxWidth: '90%', objectFit: 'contain' }} />
            ) : (
              // Placeholder for when no image uploaded yet
              <div style={{ textAlign: 'center', padding: '12px 20px' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--gold)', marginBottom: 4 }}>{ad.headline}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{ad.business_name}</div>
              </div>
            )}
          </div>
          <div style={{ padding: '10px 14px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--offwhite)', fontWeight: 600 }}>{ad.business_name}</span>
            <div style={{
              background: 'var(--gold)', color: '#1a0a00',
              fontSize: 11, fontWeight: 800,
              padding: '5px 12px', borderRadius: 20,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {ad.cta} <ExternalLink size={10} />
            </div>
          </div>
        </div>
      ) : (
        // Text ad
        <div onClick={handleClick} style={{ padding: '28px 14px 12px', cursor: 'pointer' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)', marginBottom: 5 }}>{ad.headline}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, lineHeight: 1.5, marginBottom: 10 }}>{ad.description}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>{ad.business_name}</span>
            <div style={{
              background: 'var(--gold)', color: '#1a0a00',
              fontSize: 11, fontWeight: 800,
              padding: '5px 12px', borderRadius: 20,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {ad.cta} <ExternalLink size={10} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── INSIDE-CARD AD (small strip below tip pick) ───────────────────
export function AdCardInline({ ad }: { ad: Ad }) {
  function handleClick() {
    fetch('/api/ads/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad_id: ad.id }),
    }).catch(() => {})
    window.open(ad.link, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      onClick={handleClick}
      style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        cursor: 'pointer',
        background: 'rgba(245,166,35,0.04)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>Ad</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--offwhite)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ad.headline}</div>
      </div>
      <div style={{
        background: 'var(--gold)', color: '#1a0a00',
        fontSize: 10, fontWeight: 800,
        padding: '4px 10px', borderRadius: 20,
        flexShrink: 0, whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', gap: 3,
      }}>
        {ad.cta} <ExternalLink size={9} />
      </div>
    </div>
  )
}
