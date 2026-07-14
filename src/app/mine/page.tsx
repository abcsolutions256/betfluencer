'use client'
import { useState, useEffect } from 'react'
import { TopBar, BottomNav } from '@/components/layout/Navigation'
import { Avatar, VerifiedTick } from '@/components/ui'
import { FollowButton } from '@/components/ui/FollowButton'
import { Loader2, Users, Bookmark } from 'lucide-react'
import { getFollows } from '@/lib/follows'
import { getBuyerPhone, setBuyerPhone } from '@/lib/guestId'
import Link from 'next/link'
import { useCountry } from '@/components/CountryProvider'

type MineTab = 'following' | 'purchases'

export default function MinePage() {
  const { fmtMoney } = useCountry()
  const [tab,      setTab]      = useState<MineTab>('following')
  const [follows,  setFollows]  = useState<string[]>([])
  const [tipsters, setTipsters] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [subs,     setSubs]     = useState<any[]>([])
  const [lookup,   setLookup]   = useState('')

  // Load follows (stored locally, no login needed)
  useEffect(() => {
    setFollows(getFollows())
    const handler = () => setFollows(getFollows())
    window.addEventListener('bf-follow-change', handler)
    return () => window.removeEventListener('bf-follow-change', handler)
  }, [])

  // Load real tipsters from API (reads the live tipster stats view)
  useEffect(() => {
    fetch('/api/tipster', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setTipsters(d.tipsters ?? []))
      .catch(() => setTipsters([]))
  }, [])

  // Buyers don't log in — purchases are keyed on the phone they paid with.
  // Use the stored phone on load; a returning buyer can re-enter their phone
  // to recover purchases (incl. on another device).
  function loadPurchases(phone: string) {
    setLoading(true)
    fetch('/api/subscribe', { headers: phone ? { 'x-buyer-phone': phone } : {} })
      .then(x => x.json()).catch(() => ({ subscriptions: [] }))
      .then(r => { setSubs(r.subscriptions ?? []); setLoading(false) })
  }
  useEffect(() => {
    const p = getBuyerPhone()
    setLookup(p)
    if (p) loadPurchases(p); else setLoading(false)
  }, [])

  function submitLookup() {
    const p = lookup.trim()
    if (!p) return
    setBuyerPhone(p)
    loadPurchases(p)
  }

  const followedTipsters = tipsters.filter(t => follows.includes(t.id))

  const tabs = [
    { key: 'following', label: 'Following', icon: Users,    badge: 0 },
    { key: 'purchases', label: 'Purchases', icon: Bookmark, badge: 0 },
  ]

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <main className="flex-1 overflow-y-auto pb-6">

        {/* Header */}
        <div style={{ background: 'var(--bg2)', padding: '12px 16px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>My Betfluencer</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--white)' }}>Mine</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'var(--bg2)', borderBottom: '1px solid var(--line)' }}>
          {tabs.map(({ key, label, icon: Icon, badge }) => (
            <button key={key} onClick={() => setTab(key as MineTab)} style={{ flex: 1, padding: '11px 0', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, fontWeight: tab === key ? 700 : 500, color: tab === key ? 'var(--gold)' : 'var(--muted)', borderBottom: `2px solid ${tab === key ? 'var(--gold)' : 'transparent'}` }}>
              <Icon size={15} />
              {label}
              {badge > 0 && <span style={{ background: 'var(--gold)', color: '#1a0a00', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 20 }}>{badge}</span>}
            </button>
          ))}
        </div>

        <div style={{ padding: '14px 14px 0' }}>

          {/* ── FOLLOWING TAB ── */}
          {tab === 'following' && (
            <>
              {follows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <Users size={36} color="var(--muted)" style={{ margin: '0 auto 14px', display: 'block', opacity: 0.4 }} />
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--offwhite)', marginBottom: 6 }}>Not following anyone yet</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>Follow tipsters to see them here.</div>
                  <Link href="/channels" style={{ textDecoration: 'none' }}>
                    <button style={{ padding: '11px 24px', background: 'var(--gold)', color: '#1a0a00', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>Browse channels</button>
                  </Link>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
                    {followedTipsters.length} tipster{followedTipsters.length !== 1 ? 's' : ''} followed
                  </div>
                  {followedTipsters.map(t => (
                    <div key={t.id} style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', marginBottom: 10, overflow: 'hidden' }}>
                      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Avatar name={t.name} size={44} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)' }}>{t.name}</span>
                            <VerifiedTick tickType={t.tick_type} />
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>@{t.username}</div>
                        </div>
                        <FollowButton tipsterId={t.id} size="sm" />
                      </div>
                      <div style={{ borderTop: '1px solid var(--line)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t.wins_last_10 ?? 0} wins · {Number(t.avg_odds ?? 0).toFixed(1)}x odds</span>
                        <Link href={`/channel/${t.username}`} style={{ textDecoration: 'none' }}>
                          <button style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', background: 'var(--gold)', color: '#1a0a00', border: 'none', borderRadius: 20, cursor: 'pointer' }}>View →</button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* ── PURCHASES TAB ── */}
          {tab === 'purchases' && (
            <>
              {/* Phone lookup — recover purchases by the number you paid with */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input
                  value={lookup}
                  onChange={e => setLookup(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitLookup() }}
                  placeholder="Phone you paid with (+256…)"
                  type="tel"
                  style={{ flex: 1, padding: '11px 13px', borderRadius: 12, background: 'var(--bg3)', border: '1px solid var(--line)', color: 'var(--white)', fontSize: 14, outline: 'none' }}
                />
                <button onClick={submitLookup} disabled={!lookup.trim()} style={{ padding: '0 16px', background: 'var(--gold)', color: '#1a0a00', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: lookup.trim() ? 1 : 0.5 }}>Look up</button>
              </div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '44px 0' }}><Loader2 size={26} color="var(--gold)" className="spin" /></div>
              ) : subs.length === 0 ? (
                <Empty icon="🎫" title="No purchases yet">
                  <Link href="/slips"><button className="btn-gold" style={{ maxWidth: 200 }}>Browse slips</button></Link>
                </Empty>
              ) : subs.map((s: any) => (
                <div key={s.id} className="card" style={{ marginBottom: 10, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Avatar name={s.tipster?.name ?? '?'} size={42} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)' }}>{s.tipster?.name ?? 'Tipster'}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          {(s.betslip?.game_count ?? '—')} games · odds {Number(s.betslip?.total_odds ?? 0).toFixed(2)} · {fmtMoney(s.amount_paid ?? 0)}
                        </div>
                      </div>
                    </div>
                    <span className={s.status === 'active' ? 'pill-green' : 'pill-muted'}>{s.status}</span>
                  </div>
                  {s.tipster?.username && (
                    <Link href={`/channel/${s.tipster.username}`} style={{ textDecoration: 'none' }}>
                      <button className="btn-gold" style={{ padding: '10px', fontSize: 13 }}>View channel →</button>
                    </Link>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
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
