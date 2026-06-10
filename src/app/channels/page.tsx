'use client'
import { useState, useEffect } from 'react'
import { TopBar, BottomNav } from '@/components/layout/Navigation'
import { TipsterCard } from '@/components/ui'
import { SearchBar, SearchEmpty } from '@/components/ui/SearchBar'
import type { TipsterPublic } from '@/types'

export default function ChannelsPage() {
  const [tipsters, setTipsters] = useState<TipsterPublic[]>([])
  const [results,  setResults]  = useState<TipsterPublic[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    fetch('/api/tipsters')
      .then(r => r.json())
      .then(data => {
        const list = data.tipsters ?? []
        setTipsters(list)
        setResults(list)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <main className="flex-1 overflow-y-auto pb-6">
        <div style={{ padding: '14px 14px 0' }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>TRENDING THIS WEEK</div>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>Loading tipsters...</div>
          ) : (
            <>
              <SearchBar tipsters={tipsters} onResults={setResults} />
              {results.length === 0
                ? <SearchEmpty />
                : results.map((t, i) => <TipsterCard key={t.id} tipster={t} rank={i + 1} />)
              }
            </>
          )}
        </div>
      </main>
      <BottomNav />
    </div>
  )
}