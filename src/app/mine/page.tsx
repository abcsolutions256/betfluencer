'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TopBar, BottomNav } from '@/components/layout/Navigation'
import { Loader2 } from 'lucide-react'
import { buyerHeader } from '@/lib/guestId'

export default function MinePage() {
  const [loading, setLoading] = useState(true)
  const [subs, setSubs]       = useState<any[]>([])

  useEffect(() => {
    // Anonymous buyer — purchases are keyed on the localStorage guest id.
    fetch('/api/subscribe', { headers: buyerHeader() })
      .then(x => x.json()).catch(() => ({ subscriptions: [] }))
      .then(r => { setSubs(r.subscriptions ?? []); setLoading(false) })
  }, [])

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <main className="flex-1 overflow-y-auto pb-6" style={{ padding: '14px 14px 0' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--white)', marginBottom: 14 }}>My purchases</div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '44px 0' }}><Loader2 size={26} color="var(--gold)" className="spin" /></div>
        ) : subs.length === 0 ? (
          <Empty icon="🎫" title="No purchases yet">
            <Link href="/slips"><button className="btn-gold" style={{ maxWidth: 200 }}>Browse slips</button></Link>
          </Empty>
        ) : subs.map(s => (
          <div key={s.id} className="card" style={{ marginBottom: 10, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)' }}>{s.tipster?.name ?? 'Tipster'}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {(s.betslip?.game_count ?? '—')} games · odds {Number(s.betslip?.total_odds ?? 0).toFixed(2)} · UGX {(s.amount_paid ?? 0).toLocaleString()}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: s.status === 'active' ? 'var(--green-lt)' : 'var(--bg3)', color: s.status === 'active' ? 'var(--green)' : 'var(--muted)' }}>{s.status}</span>
            </div>
            {s.tipster?.username && (
              <Link href={`/channel/${s.tipster.username}`} style={{ textDecoration: 'none' }}>
                <button className="btn-gold" style={{ padding: '9px', fontSize: 13 }}>Open slip →</button>
              </Link>
            )}
          </div>
        ))}
      </main>
      <BottomNav />
    </div>
  )
}

function Empty({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 0', color: 'var(--muted)' }}>
      <div style={{ fontSize: 30, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--offwhite)', marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  )
}
