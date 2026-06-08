'use client'
import { useState } from 'react'
import { Search, ChevronDown, ChevronUp } from 'lucide-react'
import { LEAGUES, TIER_LABELS, getLeaguesByTier } from '@/lib/leagues'
import type { League } from '@/lib/leagues'

interface Props {
  value:    string
  onChange: (league: string) => void
}

export function LeaguePicker({ value, onChange }: Props) {
  const [open,   setOpen]   = useState(false)
  const [search, setSearch] = useState('')

  const grouped = getLeaguesByTier()
  const selected = LEAGUES.find(l => l.name === value)

  // Filter leagues by search
  const filtered = search.trim()
    ? LEAGUES.filter(l =>
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l.region.toLowerCase().includes(search.toLowerCase())
      )
    : null

  function pick(league: League) {
    onChange(league.name)
    setOpen(false)
    setSearch('')
  }

  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      <label style={{ fontSize:11, fontWeight:700, color:'var(--off)', letterSpacing:0.5, marginBottom:6, display:'block' }}>
        League / Competition
      </label>

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ width:'100%', padding:'13px 14px', background:'var(--bg3)', border:`1.5px solid ${open ? 'var(--gold)' : 'rgba(255,255,255,0.2)'}`, borderRadius:12, fontSize:14, color: value ? 'var(--white)' : 'var(--muted)', fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, textAlign:'left' }}
      >
        <span>{value ? `${selected?.flag ?? '⚽'} ${value}` : 'Select a league...'}</span>
        {open ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'var(--bg2)', border:'1px solid var(--line)', borderRadius:14, zIndex:200, maxHeight:320, overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}>
          {/* Search inside picker */}
          <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', gap:8 }}>
            <Search size={15} color="var(--muted)" />
            <input
              autoFocus
              placeholder="Search leagues..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ border:'none', background:'none', fontSize:13, color:'var(--white)', flex:1, outline:'none' }}
            />
          </div>

          <div style={{ overflowY:'auto', flex:1 }}>
            {filtered ? (
              // Search results
              filtered.length === 0 ? (
                <div style={{ padding:'20px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>No leagues found</div>
              ) : (
                filtered.map(l => (
                  <LeagueRow key={l.id} league={l} selected={value === l.name} onPick={pick} />
                ))
              )
            ) : (
              // Grouped by tier
              Object.entries(TIER_LABELS).map(([tier, label]) => (
                grouped[tier]?.length ? (
                  <div key={tier}>
                    <div style={{ padding:'8px 14px 4px', fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, position:'sticky', top:0, background:'var(--bg2)' }}>{label}</div>
                    {grouped[tier].map(l => (
                      <LeagueRow key={l.id} league={l} selected={value === l.name} onPick={pick} />
                    ))}
                  </div>
                ) : null
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function LeagueRow({ league, selected, onPick }: { league: League; selected: boolean; onPick: (l: League) => void }) {
  return (
    <div
      onClick={() => onPick(league)}
      style={{ padding:'9px 14px', display:'flex', alignItems:'center', gap:10, cursor:'pointer', background: selected ? 'rgba(245,166,35,0.12)' : 'transparent', borderLeft: selected ? '2px solid var(--gold)' : '2px solid transparent' }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <span style={{ fontSize:16, flexShrink:0 }}>{league.flag}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight: selected ? 700 : 500, color: selected ? 'var(--gold)' : 'var(--offwhite)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{league.name}</div>
        <div style={{ fontSize:10, color:'var(--muted)' }}>{league.region}</div>
      </div>
      {selected && <span style={{ fontSize:13, color:'var(--gold)' }}>✓</span>}
    </div>
  )
}
