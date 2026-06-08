'use client'
import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { searchTipsters } from '@/lib/search'
import type { TipsterPublic } from '@/types'

interface Props {
  tipsters:  TipsterPublic[]
  onResults: (results: TipsterPublic[]) => void
}

export function SearchBar({ tipsters, onResults }: Props) {
  const [query,   setQuery]   = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    onResults(searchTipsters(tipsters, query))
  }, [query, tipsters])

  function clear() { setQuery(''); inputRef.current?.focus() }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: focused ? 'var(--bg2)' : 'var(--bg3)',
        borderRadius: 14,
        border: `1.5px solid ${focused ? 'var(--gold)' : 'rgba(255,255,255,0.15)'}`,
        padding: '11px 14px',
        transition: 'border-color 0.15s, background 0.15s',
      }}>
        <Search size={17} color={focused ? 'var(--gold)' : 'var(--muted)'} style={{ flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search tipsters, leagues, sports..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            border: 'none', background: 'none',
            fontSize: 14, color: 'var(--white)',
            flex: 1, outline: 'none', fontWeight: 500,
          }}
        />
        {query && (
          <button onClick={clear} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
            <X size={16} color="var(--muted)" />
          </button>
        )}
      </div>
    </div>
  )
}

export function SearchEmpty({ query }: { query?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--muted)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--offwhite)', marginBottom: 6 }}>No tipsters found</div>
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>
        {query ? `No results for "${query}". Try a different name or sport.` : 'No tipsters yet.'}
      </div>
    </div>
  )
}
