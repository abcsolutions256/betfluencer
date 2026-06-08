'use client'
import { useState, useEffect } from 'react'
import {
  Shield, Home, Megaphone, Users, BarChart2, ShieldCheck,
  Plus, Pause, Trash2, Play, Upload, Loader2,
  LogOut, Eye, MousePointer, TrendingUp, CheckCircle
} from 'lucide-react'
import { MOCK_ADS } from '@/lib/mockAds'
import { MOCK_TIPSTERS } from '@/lib/mockData'
import type { Ad, AdFormat, AdPlacement } from '@/types/ads'

const SESSION_KEY = 'bf_admin_session'

type AdminTab = 'overview' | 'ads' | 'tipsters' | 'revenue' | 'review'

// ── LOGIN ─────────────────────────────────────────────────────────
function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function login() {
    if (!password) return
    setLoading(true); setError('')
    const res  = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await res.json()
    if (data.token) {
      localStorage.setItem(SESSION_KEY, data.token)
      onLogin()
    } else {
      setError(data.error ?? 'Incorrect password')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--gold)', marginBottom: 4 }}>
            bet<span style={{ color: 'var(--offwhite)', fontWeight: 300 }}>fluencer</span>
          </div>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '14px auto 12px' }}>
            <Shield size={26} color="var(--gold)" />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--white)', marginBottom: 4 }}>Admin access</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>Betfluencer HQ — restricted</div>
        </div>
        <div className="card">
          <label className="lbl">Admin password</label>
          <input
            className="inp"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            style={{ marginBottom: 14 }}
          />
          {error && <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</div>}
          <button className="btn-gold" style={{ opacity: !password ? 0.4 : 1 }} onClick={login}>
            {loading ? <Loader2 size={16} className="spin" /> : <Shield size={16} />} Enter admin panel
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: 'var(--muted)' }}>
          Never share this password with anyone.
        </div>
      </div>
    </div>
  )
}

// ── STAT CARD ─────────────────────────────────────────────────────
function StatCard({ val, label, color = 'var(--white)', sub }: { val: string; label: string; color?: string; sub?: string }) {
  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── AD ROW ────────────────────────────────────────────────────────
function AdRow({ ad, onToggle, onRemove }: { ad: Ad; onToggle: (id: string) => void; onRemove: (id: string) => void }) {
  const isLive = ad.status === 'active'
  return (
    <div className="card" style={{ borderLeft: `3px solid ${isLive ? 'var(--green)' : 'var(--muted)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)', marginBottom: 2 }}>{ad.business_name}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {ad.format === 'banner' ? '🖼️ Image' : ad.format === 'text' ? '✍️ Text' : ad.format === 'gif' ? '🎞️ GIF' : '🎬 Video'} · {ad.placement === 'both' ? 'Both placements' : ad.placement === 'between_cards' ? 'Between cards' : 'Inside cards'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
            Ends {new Date(ad.ends_at).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
        <span className={isLive ? 'pill-green' : 'pill-muted'}>{isLive ? 'Live' : ad.status === 'paused' ? 'Paused' : 'Removed'}</span>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
        <div className="sbox">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            <MousePointer size={10} color="var(--muted)" />
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)' }}>{ad.clicks.toLocaleString()}</span>
          </div>
          <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>clicks</div>
        </div>
        <div className="sbox">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            <Eye size={10} color="var(--muted)" />
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)' }}>{(ad.impressions / 1000).toFixed(1)}k</span>
          </div>
          <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>views</div>
        </div>
        <div className="sbox">
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>{(ad.spent / 1000).toFixed(0)}k</div>
          <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>UGX</div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button
          onClick={() => onToggle(ad.id)}
          style={{ padding: '8px', background: isLive ? 'rgba(245,166,35,0.12)' : 'var(--green-lt)', color: isLive ? 'var(--gold)' : 'var(--green)', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
        >
          {isLive ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}
        </button>
        <button
          onClick={() => onRemove(ad.id)}
          style={{ padding: '8px', background: 'var(--red-lt)', color: 'var(--red)', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
        >
          <Trash2 size={13} /> Remove
        </button>
      </div>
    </div>
  )
}

// ── POST AD FORM ──────────────────────────────────────────────────
function PostAdForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    advertiser_name: '', format: 'image' as AdFormat | 'gif' | 'video',
    media_url: '', headline: '', description: '', cta: 'Learn more',
    link: '', placement: 'both' as AdPlacement,
    starts_at: '', ends_at: '', revenue: '',
  })
  const [loading,  setLoading]  = useState(false)
  const [success,  setSuccess]  = useState(false)
  const [uploadMode, setUploadMode] = useState<'url' | 'upload'>('url')

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function post() {
    if (!form.advertiser_name || !form.headline || !form.link) return
    setLoading(true)
    const token = localStorage.getItem(SESSION_KEY) ?? ''
    await fetch('/api/admin/ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify(form),
    })
    setLoading(false)
    setSuccess(true)
    setTimeout(() => { setSuccess(false); onDone() }, 1500)
  }

  if (success) return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <CheckCircle size={48} color="var(--green)" style={{ margin: '0 auto 16px', display: 'block' }} />
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>Ad is live!</div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={onDone} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, fontWeight: 700, padding: 0 }}>← Back</button>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--white)' }}>Post new ad</div>
      </div>

      <div className="card">
        <label className="lbl">Advertiser name *</label>
        <input className="inp" placeholder="e.g. Betway Uganda" value={form.advertiser_name} onChange={e => set('advertiser_name', e.target.value)} style={{ marginBottom: 12 }} />

        <label className="lbl">Ad format</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            { key: 'image', icon: '🖼️', label: 'Image' },
            { key: 'gif',   icon: '🎞️', label: 'GIF'   },
            { key: 'video', icon: '🎬', label: 'Video'  },
            { key: 'text',  icon: '✍️', label: 'Text'  },
          ].map(f => (
            <button key={f.key} onClick={() => set('format', f.key)} style={{ fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', background: form.format === f.key ? 'var(--gold)' : 'var(--bg3)', color: form.format === f.key ? '#1a0a00' : 'var(--offwhite)', outline: form.format === f.key ? 'none' : '1px solid rgba(255,255,255,0.12)' }}>
              {f.icon} {f.label}
            </button>
          ))}
        </div>

        {form.format !== 'text' && (
          <>
            <label className="lbl">Media</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {(['url', 'upload'] as const).map(m => (
                <button key={m} onClick={() => setUploadMode(m)} style={{ flex: 1, fontSize: 11, fontWeight: 700, padding: '7px', borderRadius: 10, border: 'none', cursor: 'pointer', background: uploadMode === m ? 'var(--gold)' : 'var(--bg3)', color: uploadMode === m ? '#1a0a00' : 'var(--offwhite)', outline: uploadMode === m ? 'none' : '1px solid rgba(255,255,255,0.12)' }}>
                  {m === 'url' ? '🔗 Paste URL' : '📤 Upload file'}
                </button>
              ))}
            </div>
            {uploadMode === 'url' ? (
              <input className="inp" placeholder="https://your-media-url.com/ad.jpg" value={form.media_url} onChange={e => set('media_url', e.target.value)} style={{ marginBottom: 12 }} />
            ) : (
              <div style={{ border: '2px dashed rgba(245,166,35,0.4)', borderRadius: 12, padding: '18px', textAlign: 'center', marginBottom: 12, cursor: 'pointer' }}>
                <Upload size={22} color="var(--gold)" style={{ margin: '0 auto 6px', display: 'block' }} />
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Tap to upload {form.format === 'video' ? 'MP4 (max 15s)' : form.format === 'gif' ? 'GIF' : 'JPG / PNG'}</div>
              </div>
            )}
          </>
        )}

        <label className="lbl">Headline *</label>
        <input className="inp" placeholder="e.g. Bet smarter with Betway" value={form.headline} onChange={e => set('headline', e.target.value)} style={{ marginBottom: 12 }} />

        {form.format === 'text' && (
          <>
            <label className="lbl">Description</label>
            <textarea className="inp" placeholder="Short description..." value={form.description} onChange={e => set('description', e.target.value)} style={{ minHeight: 60, resize: 'none', marginBottom: 12 }} />
          </>
        )}

        <label className="lbl">CTA button text</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {['Bet now', 'Learn more', 'Register free', 'Get offer', 'Visit us'].map(c => (
            <button key={c} onClick={() => set('cta', c)} style={{ fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 20, border: 'none', cursor: 'pointer', background: form.cta === c ? 'var(--gold)' : 'var(--bg3)', color: form.cta === c ? '#1a0a00' : 'var(--offwhite)', outline: form.cta === c ? 'none' : '1px solid rgba(255,255,255,0.12)' }}>{c}</button>
          ))}
        </div>

        <label className="lbl">Destination link *</label>
        <input className="inp" placeholder="https://yourbusiness.com" type="url" value={form.link} onChange={e => set('link', e.target.value)} style={{ marginBottom: 4 }} />
      </div>

      <div className="card">
        <label className="lbl">Placement</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            { key: 'both',           label: '🎯 Both' },
            { key: 'between_cards',  label: '📋 Between cards' },
            { key: 'inside_card',    label: '📌 Inside cards' },
          ].map(p => (
            <button key={p.key} onClick={() => set('placement', p.key)} style={{ fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', background: form.placement === p.key ? 'var(--gold)' : 'var(--bg3)', color: form.placement === p.key ? '#1a0a00' : 'var(--offwhite)', outline: form.placement === p.key ? 'none' : '1px solid rgba(255,255,255,0.12)' }}>{p.label}</button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label className="lbl">Start date</label>
            <input className="inp" type="date" value={form.starts_at} onChange={e => set('starts_at', e.target.value)} />
          </div>
          <div>
            <label className="lbl">End date</label>
            <input className="inp" type="date" value={form.ends_at} onChange={e => set('ends_at', e.target.value)} />
          </div>
        </div>

        <label className="lbl">Agreed revenue (UGX)</label>
        <input className="inp" type="number" placeholder="e.g. 150000" value={form.revenue} onChange={e => set('revenue', e.target.value)} style={{ marginBottom: 4 }} />
      </div>

      <button
        className="btn-green"
        style={{ opacity: (!form.advertiser_name || !form.headline || !form.link) ? 0.4 : 1 }}
        onClick={post}
      >
        {loading ? <Loader2 size={16} className="spin" /> : <Megaphone size={16} />} Go live now
      </button>
    </div>
  )
}

// ── MAIN ADMIN PANEL ──────────────────────────────────────────────
export default function AdminPage() {
  const [authed,   setAuthed]   = useState(false)
  const [tab,      setTab]      = useState<AdminTab>('overview')
  const [ads,      setAds]      = useState<Ad[]>(MOCK_ADS)
  const [posting,  setPosting]  = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(SESSION_KEY)
    if (token) setAuthed(true)
    setChecking(false)
  }, [])

  function logout() {
    localStorage.removeItem(SESSION_KEY)
    setAuthed(false)
  }

  function toggleAd(id: string) {
    setAds(prev => prev.map(a => a.id === id ? { ...a, status: a.status === 'active' ? 'paused' : 'active' } : a))
  }

  function removeAd(id: string) {
    setAds(prev => prev.map(a => a.id === id ? { ...a, status: 'removed' } : a))
  }

  if (checking) return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />
  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />

  const liveAds    = ads.filter(a => a.status === 'active')
  const totalRevenue = ads.reduce((s, a) => s + a.spent, 0)
  const adRevenue    = ads.reduce((s, a) => s + a.spent, 0)
  const subRevenue   = 162000

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg2)', padding: '12px 16px 14px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Admin panel</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--white)' }}>Betfluencer HQ</div>
        </div>
        <button onClick={logout} style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 10, padding: '7px 12px', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          <LogOut size={13} /> Sign out
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'var(--bg2)', borderBottom: '1px solid var(--line)' }}>
        {([
          { key: 'overview', icon: Home,      label: 'Overview' },
          { key: 'ads',      icon: Megaphone, label: 'Ads'      },
          { key: 'tipsters', icon: Users,     label: 'Tipsters' },
          { key: 'revenue',  icon: BarChart2, label: 'Revenue'  },
          { key: 'review',   icon: ShieldCheck, label: 'Review'   },
        ] as { key: AdminTab; icon: any; label: string }[]).map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => { setTab(key); setPosting(false) }} style={{ flex: 1, padding: '10px 4px 8px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, borderBottom: `2px solid ${tab === key ? 'var(--gold)' : 'transparent'}` }}>
            <Icon size={17} color={tab === key ? 'var(--gold)' : 'rgba(255,255,255,0.3)'} />
            <span style={{ fontSize: 9, color: tab === key ? 'var(--gold)' : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 32px' }}>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Platform today</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <StatCard val="2,840"    label="Active subscribers" />
              <StatCard val={MOCK_TIPSTERS.length.toString()} label="Live tipsters" color="var(--green)" />
              <StatCard val="UGX 162k" label="Commission today"   color="var(--gold)" />
              <StatCard val={liveAds.length.toString()} label="Live ads" />
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Live ads</div>
            {liveAds.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 13 }}>No live ads</div>
            ) : liveAds.map(ad => (
              <div key={ad.id} className="card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)' }}>{ad.business_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{ad.clicks} clicks · {ad.impressions.toLocaleString()} views</div>
                </div>
                <span className="pill-green">Live</span>
              </div>
            ))}

            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '14px 0 10px' }}>Recent activity</div>
            <div className="card" style={{ padding: '4px 14px' }}>
              {[
                { text: 'New sub — Enzo Kampala channel', time: '2 min ago' },
                { text: 'Ad click — Betway Uganda',       time: '5 min ago' },
                { text: 'New tipster signup',             time: '1 hr ago'  },
                { text: 'New sub — StatAttack channel',   time: '2 hrs ago' },
                { text: 'Ad click — MTN MoMo',            time: '3 hrs ago' },
              ].map((a, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid var(--line)' : 'none' }}>
                  <span style={{ fontSize: 12, color: 'var(--offwhite)' }}>{a.text}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0, marginLeft: 8 }}>{a.time}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── ADS ── */}
        {tab === 'ads' && (
          <>
            {posting ? (
              <PostAdForm onDone={() => setPosting(false)} />
            ) : (
              <>
                <button className="btn-gold" style={{ marginBottom: 14 }} onClick={() => setPosting(true)}>
                  <Plus size={16} /> Post new ad
                </button>

                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  All ads ({ads.filter(a => a.status !== 'removed').length})
                </div>

                {ads.filter(a => a.status !== 'removed').map(ad => (
                  <AdRow key={ad.id} ad={ad} onToggle={toggleAd} onRemove={removeAd} />
                ))}

                {ads.filter(a => a.status === 'removed').length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '14px 0 10px' }}>Removed ads</div>
                    {ads.filter(a => a.status === 'removed').map(ad => (
                      <div key={ad.id} className="card" style={{ opacity: 0.5, padding: '10px 14px' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)' }}>{ad.business_name}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>Removed</div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── TIPSTERS ── */}
        {tab === 'tipsters' && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>All tipsters ({MOCK_TIPSTERS.length})</div>
            {MOCK_TIPSTERS.map(t => (
              <div key={t.id} className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg3)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                    {t.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)', marginBottom: 1 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>@{t.username} · {t.sport}</div>
                  </div>
                  <span className={t.verified ? 'pill-green' : 'pill-muted'}>{t.verified ? '✓ Verified' : 'Unverified'}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  <div className="sbox"><div style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>{t.wins_last_10}/10</div><div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>wins</div></div>
                  <div className="sbox"><div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)' }}>{t.subscriber_count.toLocaleString()}</div><div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>subs</div></div>
                  <div className="sbox"><div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>#{MOCK_TIPSTERS.indexOf(t) + 1}</div><div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>rank</div></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <button style={{ padding: '7px', background: t.verified ? 'var(--red-lt)' : 'var(--green-lt)', color: t.verified ? 'var(--red)' : 'var(--green)', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {t.verified ? 'Remove tick' : 'Award tick'}
                  </button>
                  <button style={{ padding: '7px', background: 'var(--red-lt)', color: 'var(--red)', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    Suspend
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── REVIEW — unverifiable markets needing manual check ── */}
        {tab === 'review' && (
          <>
            <div style={{ background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 14, padding: '12px 14px', marginBottom: 14, display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
              <div style={{ fontSize: 12, color: 'var(--offwhite)', lineHeight: 1.6 }}>
                These slips have legs that couldn't be verified automatically — usually player-specific markets (player to score, assists, cards). Mark each one manually after checking the result.
              </div>
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Pending manual review
            </div>

            {/* Mock unverifiable slip */}
            {[
              { tipster: 'Enzo Kampala', match: 'Man City vs Arsenal', pick: 'Ronaldo to score anytime', odds: 2.10, time: 'Today · 20:45' },
              { tipster: 'StatAttack', match: 'PSG vs Lyon', pick: 'Mbappe to score first', odds: 3.50, time: 'Today · 21:00' },
              { tipster: 'Nairobi King', match: 'Liverpool vs Chelsea', pick: 'Salah to score & assist', odds: 4.20, time: 'Yesterday · 19:45' },
            ].map((item, i) => (
              <div key={i} className="card" style={{ borderLeft: '3px solid var(--gold)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)', marginBottom: 2 }}>{item.match}</div>
                    <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600, marginBottom: 2 }}>{item.pick}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{item.tipster} · odds {item.odds} · {item.time}</div>
                  </div>
                  <span style={{ background: 'var(--gold-lt)', color: 'var(--gold)', fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(245,166,35,0.3)', flexShrink: 0 }}>Needs review</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button style={{ padding: '9px', background: 'var(--green-lt)', color: 'var(--green)', border: '1px solid rgba(46,204,122,0.3)', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    ✓ Won
                  </button>
                  <button style={{ padding: '9px', background: 'var(--red-lt)', color: 'var(--red)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    ✗ Lost
                  </button>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 14, fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Auto-verified today
            </div>
            <div className="card" style={{ padding: '4px 14px' }}>
              {[
                { match: 'Man City vs Arsenal', pick: 'Over 2.5 goals', result: 'win', auto: true },
                { match: 'Bayern vs Dortmund', pick: 'BTTS', result: 'win', auto: true },
                { match: 'PSG vs Lyon', pick: 'PSG win', result: 'loss', auto: true },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < 2 ? '1px solid var(--line)' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--offwhite)' }}>{r.match}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{r.pick} · Auto-verified ✓</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: r.result === 'win' ? 'var(--green-lt)' : 'var(--red-lt)', color: r.result === 'win' ? 'var(--green)' : 'var(--red)', border: `1px solid ${r.result === 'win' ? 'rgba(46,204,122,0.3)' : 'rgba(255,107,107,0.3)'}` }}>
                    {r.result === 'win' ? 'Won' : 'Lost'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── REVENUE ── */}
        {tab === 'revenue' && (
          <>
            <div style={{ background: 'var(--green-lt)', border: '1px solid rgba(46,204,122,0.2)', borderRadius: 16, padding: '18px', marginBottom: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Total revenue this month</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--white)' }}>UGX {(totalRevenue + subRevenue).toLocaleString()}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <StatCard val={`UGX ${subRevenue.toLocaleString()}`} label="Slip purchase cuts (10%)" color="var(--gold)" />
              <StatCard val={`UGX ${adRevenue.toLocaleString()}`} label="Ad revenue" color="var(--gold)" />
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Ad revenue breakdown</div>
            <div className="card" style={{ padding: '4px 14px' }}>
              {ads.map((ad, i) => (
                <div key={ad.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < ads.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--offwhite)' }}>{ad.business_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{ad.clicks} clicks · {ad.impressions.toLocaleString()} views</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)' }}>UGX {ad.spent.toLocaleString()}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '14px 0 10px' }}>Slip purchase revenue by tipster</div>
            <div className="card" style={{ padding: '4px 14px' }}>
              {MOCK_TIPSTERS.map((t, i) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < MOCK_TIPSTERS.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--offwhite)' }}>{t.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{t.subscriber_count.toLocaleString()} slip buyers</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>
                    UGX {(t.subscriber_count * 200).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
