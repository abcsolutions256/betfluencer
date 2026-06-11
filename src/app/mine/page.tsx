'use client'
import { useState, useEffect } from 'react'
import { TopBar, BottomNav } from '@/components/layout/Navigation'
import { Avatar, VerifiedTick } from '@/components/ui'
import { FollowButton } from '@/components/ui/FollowButton'
import { Smartphone, Loader2, Bell, Users, Bookmark } from 'lucide-react'
import { getFollows } from '@/lib/follows'
import Link from 'next/link'

type MineTab = 'following' | 'purchases'

export default function MinePage() {
  const [tab,      setTab]     = useState<MineTab>('following')
  const [follows,  setFollows] = useState<string[]>([])
  const [tipsters, setTipsters] = useState<any[]>([])
  const [phone,    setPhone]   = useState('')
  const [name,     setName]    = useState('')
  const [nameStep, setNameStep] = useState(false)
  const [loading,  setLoading] = useState(false)
  const [subs,     setSubs]    = useState<any[]>([])

  useEffect(() => {
    setFollows(getFollows())
    const handler = () => setFollows(getFollows())
    window.addEventListener('bf-follow-change', handler)
    return () => window.removeEventListener('bf-follow-change', handler)
  }, [])

  // Load real tipsters from API
  useEffect(() => {
    fetch('/api/tipster', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setTipsters(d.tipsters ?? []))
  }, [])

  const followedTipsters = tipsters.filter(t => follows.includes(t.id))

  async function lookupPhone() {
    if (phone.length < 7) return
    setLoading(true)
    const res  = await fetch(`/api/subscribe?phone=%2B256${phone}`)
    const data = await res.json()
    setLoading(false)
    const savedName = localStorage.getItem(`bf_name_${phone}`)
    if (savedName) { setName(savedName); setSubs(data.subscriptions ?? []); setTab('purchases') }
    else { setSubs(data.subscriptions ?? []); setNameStep(true) }
  }

  function saveName() {
    if (!name.trim()) return
    localStorage.setItem(`bf_name_${phone}`, name.trim())
    setTab('purchases')
  }

  const tabs = [
    { key: 'following', label: 'Following', icon: Users,    badge: 0 },
    { key: 'purchases', label: 'Purchases', icon: Bookmark, badge: 0 },
  ]

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <main className="flex-1 overflow-y-auto pb-6">

        <div style={{ background: 'var(--bg2)', padding: '12px 16px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>My Betfluencer</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--white)' }}>Mine</div>
          </div>
        </div>

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

          {/* FOLLOWING TAB */}
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
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t.wins_last_10 ?? 0} wins · {(t.avg_odds ?? 0).toFixed(1)}x odds</span>
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

          {/* PURCHASES TAB */}
          {tab === 'purchases' && (
            <>
              {!name && !nameStep && (
                <>
                  <div style={{ textAlign: 'center', padding: '20px 0 16px' }}>
                    <div style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                      <Smartphone size={26} color="var(--gold)" />
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--white)', marginBottom: 6 }}>See your purchases</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>Enter the number you paid with</div>
                  </div>
                  <div className="card">
                    <label className="lbl">Mobile Money number</label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                      <div className="inp" style={{ width: 'auto', padding: '14px 12px', flexShrink: 0, fontWeight: 800, color: 'var(--offwhite)' }}>+256</div>
                      <input className="inp flex-1" type="tel" placeholder="7XX XXX XXX" value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && lookupPhone()} />
                    </div>
                    <button className="btn-gold" style={{ opacity: phone.length < 7 ? 0.4 : 1 }} onClick={lookupPhone}>
                      {loading ? <Loader2 size={16} className="spin" /> : '🔍'} Find my purchases
                    </button>
                  </div>
                </>
              )}

              {nameStep && !name && (
                <div className="card">
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--white)', marginBottom: 4 }}>What is your name?</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>So tipsters know who their buyers are</div>
                  <input className="inp" placeholder="e.g. James Okello" value={name} onChange={e => setName(e.target.value)} style={{ marginBottom: 14 }} onKeyDown={e => e.key === 'Enter' && saveName()} />
                  <button className="btn-gold" style={{ opacity: !name.trim() ? 0.4 : 1 }} onClick={saveName}>Continue →</button>
                </div>
              )}

              {name && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--white)' }}>Hi, {name} 👋</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>+256 {phone}</div>
                    </div>
                    <button onClick={() => { setName(''); setNameStep(false); setPhone('') }} style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 10, padding: '6px 14px', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Change</button>
                  </div>
                  {subs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)' }}>
                      <div style={{ fontSize: 28, marginBottom: 10 }}>🎫</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--offwhite)', marginBottom: 8 }}>No purchases found</div>
                      <Link href="/slips"><button className="btn-gold" style={{ maxWidth: 220 }}>Browse slips</button></Link>
                    </div>
                  ) : subs.map((s: any) => (
                    <div key={s.id} className="card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                        <Avatar name={s.tipster?.name ?? '?'} size={42} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)' }}>{s.tipster?.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Purchased {new Date(s.purchased_at).toLocaleDateString()}</div>
                        </div>
                        <span className={s.status === 'active' ? 'pill-green' : 'pill-muted'}>{s.status}</span>
                      </div>
                      <Link href={`/channel/${s.tipster?.username}`} style={{ textDecoration: 'none' }}>
                        <button className="btn-gold" style={{ padding: '10px', fontSize: 13 }}>View channel →</button>
                      </Link>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </main>
      <BottomNav />
    </div>
  )
}