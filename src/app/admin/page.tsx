'use client'
import { useState, useEffect } from 'react'
import {
  Shield, Home, Users, BarChart2, ShieldCheck,
  Loader2, LogOut, CheckCircle
} from 'lucide-react'

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

// ── REVIEW / SETTLEMENT TAB ──────────────────────────────────────
// Shows all pending slips. Admin settles each: Won / Lost / Void.
function ReviewTab({ token }: { token: string }) {
  const [slips, setSlips]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId]   = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  function load() {
    setLoading(true)
    fetch(`/api/admin/pending-slips?t=${Date.now()}`, { headers: { 'x-admin-token': token } })
      .then(r => r.json())
      .then(d => { setSlips(d.slips ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [token])

  async function settle(slipId: string, result: 'win' | 'loss' | 'void') {
    setBusyId(slipId)
    await fetch('/api/admin/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slip_id: slipId, result, admin_key: token }),
    })
    setSlips(prev => prev.filter(s => s.id !== slipId))
    setBusyId(null)
  }

  async function autoVerify() {
    setVerifying(true)
    await fetch('/api/verify', { method: 'POST' })
    setVerifying(false)
    load()
  }

  return (
    <>
      <div style={{ background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 12, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--offwhite)', lineHeight: 1.6 }}>
        Pending slips awaiting settlement. Auto-verify tries the football API first; settle the rest manually.
      </div>

      <button onClick={autoVerify} disabled={verifying} style={{ width: '100%', padding: '10px', background: 'var(--bg3)', color: 'var(--gold)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {verifying ? <><Loader2 size={14} className="spin" /> Verifying...</> : '↻ Run auto-verification'}
      </button>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Loader2 size={24} color="var(--gold)" className="spin" style={{ margin: '0 auto', display: 'block' }} />
        </div>
      ) : slips.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Nothing pending</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>All slips are settled</div>
        </div>
      ) : slips.map(slip => (
        <div key={slip.id} className="card" style={{ borderLeft: '3px solid var(--gold)', marginBottom: 10 }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)', marginBottom: 2 }}>
              {slip.betting_site || 'Betslip'} · {slip.leg_count || slip.legs?.length || 0} legs · ×{(slip.total_odds || 0).toFixed(2)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6 }}>
              {slip.tipster_name ?? 'Unknown'} · {slip.booking_code ? `Code ${slip.booking_code}` : slip.posting_mode} · UGX {(slip.slip_price || 0).toLocaleString()}
            </div>
            {slip.legs?.map((leg: any, i: number) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--offwhite)', padding: '3px 0', borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
                {leg.match} · <span style={{ color: 'var(--gold)' }}>{leg.pick}</span>
                {leg.result && leg.result !== 'pending' && (
                  <span style={{ color: leg.result === 'win' ? 'var(--green)' : 'var(--red)', marginLeft: 6, fontWeight: 700 }}>
                    {leg.result === 'win' ? '✓' : '✗'}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <button disabled={busyId === slip.id} onClick={() => settle(slip.id, 'win')} style={{ padding: '9px', background: 'var(--green-lt)', color: 'var(--green)', border: '1px solid rgba(46,204,122,0.3)', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: busyId === slip.id ? 0.5 : 1 }}>✓ Won</button>
            <button disabled={busyId === slip.id} onClick={() => settle(slip.id, 'loss')} style={{ padding: '9px', background: 'var(--red-lt)', color: 'var(--red)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: busyId === slip.id ? 0.5 : 1 }}>✗ Lost</button>
            <button disabled={busyId === slip.id} onClick={() => settle(slip.id, 'void')} style={{ padding: '9px', background: 'var(--bg3)', color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: busyId === slip.id ? 0.5 : 1 }}>Void</button>
          </div>
        </div>
      ))}
    </>
  )
}

// ── REVENUE TAB ───────────────────────────────────────────────────
function RevenueTab({ token }: { token: string }) {
  const [data, setData] = useState<any>({ total: 0, commission: 0, purchases: [], tipsters: [] })

  useEffect(() => {
    fetch('/api/admin/revenue', { headers: { 'x-admin-token': token } })
      .then(r => r.json()).then(d => setData(d))
      .catch(() => {})
  }, [token])

  return (
    <>
      <div style={{ background: 'var(--green-lt)', border: '1px solid rgba(46,204,122,0.2)', borderRadius: 16, padding: '18px', marginBottom: 14, textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Total commission earned</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--white)' }}>UGX {(data.commission ?? 0).toLocaleString()}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <StatCard val={(data.purchases ?? 0).toString()} label="Total slip purchases" />
        <StatCard val={`UGX ${(data.total ?? 0).toLocaleString()}`} label="Gross revenue" color="var(--gold)" />
      </div>
      {data.tipsters?.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Revenue by tipster</div>
          <div className="card" style={{ padding: '4px 14px' }}>
            {data.tipsters.map((t: any, i: number) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < data.tipsters.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--offwhite)' }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{t.purchases} purchases</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>UGX {t.revenue.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {!data.tipsters?.length && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: 13 }}>No revenue yet — first purchases will appear here</div>
      )}
    </>
  )
}

// ── TIPSTERS TAB ──────────────────────────────────────────────────
function TipstersTab({ token }: { token: string }) {
  const [tipsters,     setTipsters]     = useState<any[]>([])
  const [signupsOpen,  setSignupsOpen]  = useState(false)
  const [showCreate,   setShowCreate]   = useState(false)
  const [newTipster,   setNewTipster]   = useState<any>(null)
  const [loading,      setLoading]      = useState(false)
  const [toggling,     setToggling]     = useState(false)
  const [copied,       setCopied]       = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', password: '', sport: '', description: '' })

  useEffect(() => {
    fetch('/api/admin/settings').then(r => r.json()).then(d => setSignupsOpen(d.publicSignupsEnabled ?? false))
    fetch('/api/admin/tipsters', { headers: { 'x-admin-token': token } }).then(r => r.json()).then(d => setTipsters(d.tipsters ?? []))
  }, [token])

  async function toggleSignups() {
    setToggling(true)
    const res = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': token }, body: JSON.stringify({ publicSignupsEnabled: !signupsOpen }) })
    const d = await res.json()
    setSignupsOpen(d.settings?.publicSignupsEnabled ?? !signupsOpen)
    setToggling(false)
  }

  const [createError, setCreateError] = useState('')

  async function createTipster() {
    if (!form.name || !form.phone || !form.password) return
    setLoading(true)
    setCreateError('')
    const res  = await fetch('/api/admin/tipsters', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': token }, body: JSON.stringify(form) })
    const data = await res.json()
    setLoading(false)
    if (data.success) {
      setNewTipster(data.tipster)
      setTipsters(prev => [data.tipster, ...prev])
      setForm({ name: '', phone: '', password: '', sport: '', description: '' })
      setShowCreate(false)
    } else {
      setCreateError(data.error ?? 'Failed to create account')
    }
  }

  async function toggleVerified(id: string, verified: boolean) {
    await fetch('/api/admin/tipsters', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-admin-token': token }, body: JSON.stringify({ id, verified: !verified }) })
    setTipsters(prev => prev.map(t => t.id === id ? { ...t, verified: !verified } : t))
  }

  async function deleteTipster(id: string) {
    if (!confirm('Remove this tipster?')) return
    await fetch('/api/admin/tipsters', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-admin-token': token }, body: JSON.stringify({ id }) })
    setTipsters(prev => prev.filter(t => t.id !== id))
  }

  function copyCredentials(t: any) {
    const text = `Betfluencer tipster login\nPhone: ${t.phone}\nPassword: ${t.password}\nLogin at: https://betfluencer.org/tipster/login`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {/* Public signups toggle */}
      <div className="card" style={{ borderLeft: `3px solid ${signupsOpen ? 'var(--green)' : 'var(--gold)'}`, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)', marginBottom: 2 }}>Public signups</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{signupsOpen ? 'Anyone can sign up as a tipster' : 'Only admin can create tipster accounts'}</div>
          </div>
          <button onClick={toggleSignups} disabled={toggling} style={{ fontSize: 11, fontWeight: 800, padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', background: signupsOpen ? 'var(--red-lt)' : 'var(--green-lt)', color: signupsOpen ? 'var(--red)' : 'var(--green)' }}>
            {toggling ? '...' : signupsOpen ? 'Close signups' : 'Open signups'}
          </button>
        </div>
      </div>

      {/* New tipster credentials */}
      {newTipster && (
        <div className="card" style={{ borderLeft: '3px solid var(--green)', marginBottom: 14, background: 'rgba(46,204,122,0.05)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>✓ Tipster created — share these credentials</div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--offwhite)', lineHeight: 2, background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
            <div><span style={{ color: 'var(--muted)' }}>Name:</span> {newTipster.name}</div>
            <div><span style={{ color: 'var(--muted)' }}>Phone:</span> {newTipster.phone}</div>
            <div><span style={{ color: 'var(--muted)' }}>Password:</span> {newTipster.password}</div>
            <div><span style={{ color: 'var(--muted)' }}>URL:</span> betfluencer.org/tipster/login</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={() => copyCredentials(newTipster)} style={{ padding: '8px', background: copied ? 'var(--green)' : 'var(--bg3)', color: copied ? '#fff' : 'var(--offwhite)', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {copied ? 'Copied ✓' : 'Copy credentials'}
            </button>
            <button onClick={() => setNewTipster(null)} style={{ padding: '8px', background: 'var(--bg3)', color: 'var(--muted)', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create tipster button */}
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)} style={{ width: '100%', padding: '11px', background: 'var(--green-lt)', color: 'var(--green)', border: '1px dashed rgba(46,204,122,0.4)', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 14 }}>
          + Create tipster account
        </button>
      ) : (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)' }}>New tipster</div>
            <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>✕</button>
          </div>
          <label className="lbl">Full name *</label>
          <input className="inp" placeholder="e.g. John Mugisha" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ marginBottom: 8 }} />
          <label className="lbl">Phone number *</label>
          <input className="inp" placeholder="e.g. 0771234567" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={{ marginBottom: 8 }} />
          <label className="lbl">Password *</label>
          <input className="inp" placeholder="They can change this later" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={{ marginBottom: 8 }} />
          <label className="lbl">Sport / leagues</label>
          <input className="inp" placeholder="e.g. Premier League, UPL" value={form.sport} onChange={e => setForm(f => ({ ...f, sport: e.target.value }))} style={{ marginBottom: 8 }} />
          <label className="lbl">Bio (optional)</label>
          <input className="inp" placeholder="Short description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ marginBottom: 12 }} />
          {createError && <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600, marginBottom: 10, background: 'var(--red-lt)', padding: '8px 10px', borderRadius: 8 }}>{createError}</div>}
          <button onClick={createTipster} disabled={loading || !form.name || !form.phone || !form.password} style={{ width: '100%', padding: '10px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: (!form.name || !form.phone || !form.password) ? 0.4 : 1 }}>
            {loading ? 'Creating...' : 'Create account'}
          </button>
        </div>
      )}

      {/* Tipster list */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
        All tipsters ({tipsters.length})
      </div>
      {tipsters.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: 13 }}>No tipsters yet — create the first one above</div>
      )}
      {tipsters.map(t => (
        <div key={t.id} className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg3)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
              {t.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>@{t.username} · {t.phone}</div>
              {t.sport && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{t.sport}</div>}
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: t.verified ? 'var(--green-lt)' : 'var(--bg3)', color: t.verified ? 'var(--green)' : 'var(--muted)', border: `1px solid ${t.verified ? 'rgba(46,204,122,0.3)' : 'var(--line)'}`, flexShrink: 0 }}>
              {t.verified ? '✓ Verified' : 'Unverified'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <button onClick={() => toggleVerified(t.id, t.verified)} style={{ padding: '7px', background: t.verified ? 'var(--red-lt)' : 'var(--green-lt)', color: t.verified ? 'var(--red)' : 'var(--green)', border: 'none', borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
              {t.verified ? 'Remove tick' : 'Award tick'}
            </button>
            <button onClick={() => copyCredentials(t)} style={{ padding: '7px', background: 'var(--bg3)', color: 'var(--offwhite)', border: 'none', borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
              Copy login
            </button>
            <button onClick={() => deleteTipster(t.id)} style={{ padding: '7px', background: 'var(--red-lt)', color: 'var(--red)', border: 'none', borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
              Remove
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

// ── MAIN ADMIN PANEL ──────────────────────────────────────────────
export default function AdminPage() {
  const [authed,   setAuthed]   = useState(false)
  const [tab,      setTab]      = useState<AdminTab>('overview')
  const [checking, setChecking] = useState(true)
  const [stats,    setStats]    = useState({ subscribers: 0, tipsters: 0, commission: 0, liveAds: 0 })
  const [activity, setActivity] = useState<{ text: string; time: string }[]>([])

  useEffect(() => {
    const token = localStorage.getItem(SESSION_KEY)
    if (token) {
      setAuthed(true)
      // Fetch real stats
      fetch('/api/admin/stats', { headers: { 'x-admin-token': token } })
        .then(r => r.json())
        .then(d => { if (d.stats) setStats(d.stats); if (d.activity) setActivity(d.activity) })
        .catch(() => {})
    }
    setChecking(false)
  }, [])

  function logout() {
    localStorage.removeItem(SESSION_KEY)
    setAuthed(false)
  }

  if (checking) return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />
  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />

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
          { key: 'overview', icon: Home,        label: 'Overview' },
          { key: 'tipsters', icon: Users,        label: 'Tipsters' },
          { key: 'revenue',  icon: BarChart2,    label: 'Revenue'  },
          { key: 'review',   icon: ShieldCheck,  label: 'Review'   },
        ] as { key: AdminTab; icon: any; label: string }[]).map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: '10px 4px 8px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, borderBottom: `2px solid ${tab === key ? 'var(--gold)' : 'transparent'}` }}>
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
              <StatCard val={stats.subscribers.toLocaleString()} label="Total purchases" />
              <StatCard val={stats.tipsters.toString()} label="Live tipsters" color="var(--green)" />
              <StatCard val={`UGX ${(stats.commission/1000).toFixed(0)}k`} label="Total commission" color="var(--gold)" />
              <StatCard val={stats.liveAds.toString()} label="Live ads" />
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '14px 0 10px' }}>Recent activity</div>
            <div className="card" style={{ padding: '4px 14px' }}>
              {activity.length === 0 ? (
                <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No activity yet</div>
              ) : activity.map((a, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < activity.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <span style={{ fontSize: 12, color: 'var(--offwhite)' }}>{a.text}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0, marginLeft: 8 }}>{a.time}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── ADS ── */}
        {tab === 'ads' && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📢</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--offwhite)', marginBottom: 6 }}>Ad management</div>
            <div style={{ fontSize: 12 }}>Contact advertisers directly at betfluencer11@gmail.com</div>
          </div>
        )}

        {/* ── TIPSTERS ── */}
        {tab === 'tipsters' && (
          <TipstersTab token={localStorage.getItem(SESSION_KEY) ?? ''} />
        )}

        {/* ── REVIEW ── */}
        {tab === 'review' && (
          <ReviewTab token={localStorage.getItem(SESSION_KEY) ?? ''} />
        )}

        {/* ── REVENUE ── */}
        {tab === 'revenue' && (
          <RevenueTab token={localStorage.getItem(SESSION_KEY) ?? ''} />
        )}
      </div>
    </div>
  )
}
