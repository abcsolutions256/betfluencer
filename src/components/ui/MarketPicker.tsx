'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp, Zap, Clock } from 'lucide-react'
import { MARKETS, AUTO_MARKETS, MANUAL_MARKETS, getMarket } from '@/lib/markets'

interface Props {
  value:    string
  onChange: (marketId: string) => void
}

export function MarketPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const selected = getMarket(value)

  return (
    <div style={{ position: 'relative', marginBottom: 10 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--off)', letterSpacing: 0.5, marginBottom: 6, display: 'block' }}>
        Market type
      </label>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ width: '100%', padding: '11px 14px', background: 'var(--bg3)', border: `1.5px solid ${open ? 'var(--gold)' : 'rgba(255,255,255,0.2)'}`, borderRadius: 12, fontSize: 13, color: value ? 'var(--white)' : 'var(--muted)', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {selected && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 20, flexShrink: 0, background: selected.category === 'auto' ? 'var(--green-lt)' : 'var(--gold-lt)', color: selected.category === 'auto' ? 'var(--green)' : 'var(--gold)', border: `1px solid ${selected.category === 'auto' ? 'rgba(46,204,122,0.3)' : 'rgba(245,166,35,0.3)'}` }}>
              {selected.category === 'auto' ? '⚡ Auto' : '👤 Manual'}
            </span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected?.label ?? 'Select market...'}
          </span>
        </div>
        {open ? <ChevronUp size={15} color="var(--muted)" /> : <ChevronDown size={15} color="var(--muted)" />}
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: 14, zIndex: 200, maxHeight: 340, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>

          {/* Auto-verifiable */}
          <div style={{ padding: '8px 12px 4px', display: 'flex', alignItems: 'center', gap: 6, position: 'sticky', top: 0, background: 'var(--bg2)', borderBottom: '1px solid var(--line)' }}>
            <Zap size={12} color="var(--green)" />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Auto-verified by API</span>
          </div>
          {AUTO_MARKETS.map(m => (
            <div key={m.id} onClick={() => { onChange(m.id); setOpen(false) }} style={{ padding: '9px 14px', cursor: 'pointer', background: value === m.id ? 'rgba(46,204,122,0.1)' : 'transparent', borderLeft: value === m.id ? '2px solid var(--green)' : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              onMouseEnter={e => { if (value !== m.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (value !== m.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: value === m.id ? 700 : 500, color: value === m.id ? 'var(--green)' : 'var(--offwhite)' }}>{m.label}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{m.example}</div>
              </div>
              {value === m.id && <span style={{ color: 'var(--green)', fontSize: 13 }}>✓</span>}
            </div>
          ))}

          {/* Manual review */}
          <div style={{ padding: '8px 12px 4px', display: 'flex', alignItems: 'center', gap: 6, position: 'sticky', top: 0, background: 'var(--bg2)', borderBottom: '1px solid var(--line)', borderTop: '1px solid var(--line)' }}>
            <Clock size={12} color="var(--gold)" />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Admin reviews manually</span>
          </div>
          {MANUAL_MARKETS.map(m => (
            <div key={m.id} onClick={() => { onChange(m.id); setOpen(false) }} style={{ padding: '9px 14px', cursor: 'pointer', background: value === m.id ? 'rgba(245,166,35,0.1)' : 'transparent', borderLeft: value === m.id ? '2px solid var(--gold)' : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              onMouseEnter={e => { if (value !== m.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (value !== m.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: value === m.id ? 700 : 500, color: value === m.id ? 'var(--gold)' : 'var(--offwhite)' }}>{m.label}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{m.example}</div>
              </div>
              {value === m.id && <span style={{ color: 'var(--gold)', fontSize: 13 }}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
