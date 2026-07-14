'use client'
import { useState, useEffect } from 'react'
import {
  Shield, Home, Users, BarChart2, ShieldCheck,
  Loader2, LogOut, Receipt, Eye, EyeOff, CheckCircle, Globe
} from 'lucide-react'
import type { TransactionRow, TxnStatus } from '@/types/payments'
import type { Country } from '@/lib/country'

type AdminTab = 'overview' | 'ads' | 'tipsters' | 'slips' | 'transactions' | 'revenue' | 'verify' | 'review' | 'markets'

// 'UG' → 🇺🇬 (regional-indicator pair; renders as letters on Windows).
const flag = (code: string) =>
  String.fromCodePoint(...code.toUpperCase().split('').map(c => 0x1f1e6 + c.charCodeAt(0) - 65))

// Money label for a market code ('' = all markets → UGX, today's display).
const symFor = (markets: Country[], market: string) =>
  markets.find(c => c.code === market)?.currency_symbol ?? 'UGX'

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

// ── VERIFY TAB (leg-level review) ─────────────────────────────────
// Legs the football API couldn't auto-verify (player-specific markets).
// Admin marks each leg win/loss manually via /api/admin/review.
function VerifyTab() {
  const [legs, setLegs] = useState<any[]>([])

  useEffect(() => {
    fetch('/api/admin/review')
      .then(r => r.json()).then(d => setLegs(d.legs ?? []))
      .catch(() => {})
  }, [])

  async function mark(legId: string, result: 'win' | 'loss') {
    await fetch('/api/admin/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ legId, result }) })
    setLegs(prev => prev.filter(l => l.id !== legId))
  }

  return (
    <>
      <div style={{ background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 12, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--offwhite)', lineHeight: 1.6 }}>
        ⚠️ These legs couldn&apos;t be auto-verified — player-specific markets. Mark each manually after checking.
      </div>
      {legs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Nothing to review</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>All legs are verified</div>
        </div>
      ) : legs.map(leg => (
        <div key={leg.id} className="card" style={{ borderLeft: '3px solid var(--gold)', marginBottom: 10 }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)', marginBottom: 2 }}>{leg.match}</div>
            <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600, marginBottom: 2 }}>{leg.pick}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{leg.tipster_name} · odds {leg.odds}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={() => mark(leg.id, 'win')} style={{ padding: '9px', background: 'var(--green-lt)', color: 'var(--green)', border: '1px solid rgba(46,204,122,0.3)', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>✓ Won</button>
            <button onClick={() => mark(leg.id, 'loss')} style={{ padding: '9px', background: 'var(--red-lt)', color: 'var(--red)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>✗ Lost</button>
          </div>
        </div>
      ))}
    </>
  )
}

// ── REVIEW / SETTLEMENT TAB ──────────────────────────────────────
// Shows all pending slips. Admin settles each: Won / Lost / Void.
// Auto-verify tries the football API first (POST /api/verify), then the
// remainder are settled manually via POST /api/admin/settle.
function ReviewTab({ market, sym }: { market: string; sym: string }) {
  const [slips, setSlips]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId]   = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  function load() {
    setLoading(true)
    fetch(`/api/admin/pending-slips?market=${market}&t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { setSlips(d.slips ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [market])

  async function settle(slipId: string, result: 'win' | 'loss' | 'void') {
    setBusyId(slipId)
    await fetch('/api/admin/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slip_id: slipId, result }),
    })
    setSlips(prev => prev.filter(s => s.id !== slipId))
    setBusyId(null)
  }

  // Settle a single leg. The API re-derives the slip result from its legs, so a
  // slip that becomes decided (any leg lost, or all legs won) drops off the list.
  async function markLeg(slipId: string, legId: string, result: 'win' | 'loss') {
    const res = await fetch('/api/admin/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legId, result }),
    })
    const d = await res.json().catch(() => ({}))
    setSlips(prev => prev.flatMap(s => {
      if (s.id !== slipId) return [s]
      if (d.slipResult && d.slipResult !== 'pending') return []   // slip now settled
      return [{ ...s, legs: (s.legs ?? []).map((l: any) => l.id === legId ? { ...l, result } : l) }]
    }))
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
        Pending slips awaiting settlement. Auto-verify tries the football API first; settle the rest manually — tick whole slips (Won/Lost/Void) or individual legs (W/L), and the slip result follows the legs.
      </div>

      <button onClick={autoVerify} disabled={verifying} style={{ width: '100%', padding: '10px', background: 'var(--bg3)', color: 'var(--gold)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {verifying ? <><Loader2 size={14} className="spin" /> Verifying...</> : <><CheckCircle size={14} /> Run auto-verification</>}
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
              {slip.tipster_name ?? 'Unknown'} · {slip.booking_code ? `Code ${slip.booking_code}` : slip.posting_mode} · {sym} {(slip.slip_price || 0).toLocaleString()}
            </div>
            {slip.legs?.map((leg: any, i: number) => (
              <div key={leg.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--offwhite)' }}>
                  {leg.match} · <span style={{ color: 'var(--gold)' }}>{leg.pick}</span>
                </div>
                {leg.id && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => markLeg(slip.id, leg.id, 'win')} title="This leg won"
                      style={{ padding: '3px 9px', borderRadius: 8, fontSize: 10, fontWeight: 800, cursor: 'pointer', border: `1px solid ${leg.result === 'win' ? 'var(--green)' : 'var(--line)'}`, background: leg.result === 'win' ? 'var(--green-lt)' : 'var(--bg3)', color: leg.result === 'win' ? 'var(--green)' : 'var(--muted)' }}>W</button>
                    <button onClick={() => markLeg(slip.id, leg.id, 'loss')} title="This leg lost"
                      style={{ padding: '3px 9px', borderRadius: 8, fontSize: 10, fontWeight: 800, cursor: 'pointer', border: `1px solid ${leg.result === 'loss' ? 'var(--red)' : 'var(--line)'}`, background: leg.result === 'loss' ? 'var(--red-lt)' : 'var(--bg3)', color: leg.result === 'loss' ? 'var(--red)' : 'var(--muted)' }}>L</button>
                  </div>
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
function RevenueTab({ market, sym }: { market: string; sym: string }) {
  const [data, setData] = useState<any>({ total: 0, commission: 0, purchases: [], tipsters: [] })

  useEffect(() => {
    fetch(`/api/admin/revenue?market=${market}`)
      .then(r => r.json()).then(d => setData(d))
      .catch(() => {})
  }, [market])

  return (
    <>
      <div style={{ background: 'var(--green-lt)', border: '1px solid rgba(46,204,122,0.2)', borderRadius: 16, padding: '18px', marginBottom: 14, textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Total commission earned</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--white)' }}>{sym} {(data.commission ?? 0).toLocaleString()}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <StatCard val={(data.purchases ?? 0).toString()} label="Total slip purchases" />
        <StatCard val={`${sym} ${(data.total ?? 0).toLocaleString()}`} label="Gross revenue" color="var(--gold)" />
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
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>{sym} {t.revenue.toLocaleString()}</div>
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
function TipstersTab({ market, markets }: { market: string; markets: Country[] }) {
  const [tipsters,     setTipsters]     = useState<any[]>([])
  const [signupsOpen,  setSignupsOpen]  = useState(false)
  const [showCreate,   setShowCreate]   = useState(false)
  const [newTipster,   setNewTipster]   = useState<any>(null)
  const [loading,      setLoading]      = useState(false)
  const [toggling,     setToggling]     = useState(false)
  const [copied,       setCopied]       = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', password: '', sport: '', description: '' })
  const [commission, setCommission] = useState(0.10)
  const [savingC, setSavingC]       = useState(false)

  useEffect(() => {
    fetch('/api/admin/settings').then(r => r.json()).then(d => { setSignupsOpen(d.publicSignupsEnabled ?? false); setCommission(d.platform_commission ?? 0.10) })
    fetch('/api/admin/tipsters').then(r => r.json()).then(d => setTipsters(d.tipsters ?? []))
  }, [])

  async function toggleSignups() {
    setToggling(true)
    const res = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicSignupsEnabled: !signupsOpen }) })
    const d = await res.json()
    setSignupsOpen(d.settings?.publicSignupsEnabled ?? !signupsOpen)
    setToggling(false)
  }

  async function saveCommission() {
    setSavingC(true)
    const res = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform_commission: commission }) })
    const d = await res.json()
    if (d.settings) setCommission(d.settings.platform_commission)
    setSavingC(false)
  }

  const [createError, setCreateError] = useState('')

  async function createTipster() {
    if (!form.name || !form.phone || !form.password) return
    setLoading(true)
    setCreateError('')
    // New tipsters join the market being viewed ('All markets' → Uganda).
    const res  = await fetch('/api/admin/tipsters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, country: market || 'UG' }) })
    const data = await res.json()
    setLoading(false)
    if (data.success) {
      setNewTipster(data.tipster)
      setTipsters(prev => [{ ...data.tipster, countries: [market || 'UG'] }, ...prev])
      setForm({ name: '', phone: '', password: '', sport: '', description: '' })
      setShowCreate(false)
    } else {
      setCreateError(data.error ?? 'Failed to create account')
    }
  }

  async function toggleVerified(id: string, verified: boolean) {
    await fetch('/api/admin/tipsters', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, verified: !verified }) })
    setTipsters(prev => prev.map(t => t.id === id ? { ...t, verified: !verified } : t))
  }

  // Add/remove a tipster from a market. The server enforces ≥1 market;
  // we also guard here so the last chip can't even be tapped off.
  async function toggleCountry(t: any, code: string) {
    const has  = (t.countries ?? []).includes(code)
    if (has && (t.countries ?? []).length <= 1) return
    const next = has ? t.countries.filter((c: string) => c !== code) : [...(t.countries ?? []), code]
    const res  = await fetch('/api/admin/tipsters', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, countries: next }) })
    if (res.ok) setTipsters(prev => prev.map(x => x.id === t.id ? { ...x, countries: next } : x))
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not update markets')
  }

  async function deleteTipster(id: string) {
    if (!confirm('Remove this tipster? This also removes their slips, purchases and earnings.')) return
    const res = await fetch('/api/admin/tipsters', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(`Could not remove tipster: ${d.error ?? 'unknown error'}`)
      return
    }
    // Only drop from the list once the server confirms the delete succeeded.
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

      {/* Platform commission */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)', marginBottom: 2 }}>Platform commission</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>Global cut on each sale — the tipster keeps the rest. Set a per-tipster override in their row.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="inp" type="number" min={0} max={100} step={1} value={Math.round(commission * 100)} onChange={e => setCommission(Math.max(0, Math.min(100, Number(e.target.value))) / 100)} style={{ width: 90 }} />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>% to platform</span>
          <button onClick={saveCommission} disabled={savingC} style={{ marginLeft: 'auto', padding: '8px 16px', background: 'var(--gold)', color: '#1a0a00', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{savingC ? '...' : 'Save'}</button>
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

      {/* Tipster list — filtered to the selected market ('' = all) */}
      {(() => { const shown = tipsters.filter(t => !market || (t.countries ?? []).includes(market)); return (<>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
        {market ? `${market} tipsters (${shown.length})` : `All tipsters (${shown.length})`}
      </div>
      {shown.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: 13 }}>
          {market ? 'No tipsters in this market yet — tap a market chip on a tipster to add them' : 'No tipsters yet — create the first one above'}
        </div>
      )}
      {shown.map(t => (
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
          {/* Market membership — tap to add/remove (last market is locked) */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
            {markets.map(c => {
              const on   = (t.countries ?? []).includes(c.code)
              const last = on && (t.countries ?? []).length <= 1
              return (
                <button key={c.code} onClick={() => toggleCountry(t, c.code)} disabled={last}
                  title={last ? 'A tipster must stay in at least one market' : on ? `Remove from ${c.name}` : `Add to ${c.name}`}
                  style={{ padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: last ? 'default' : 'pointer', background: on ? 'var(--gold-lt)' : 'var(--bg3)', color: on ? 'var(--gold)' : 'var(--muted)', border: `1px solid ${on ? 'rgba(245,166,35,0.3)' : 'var(--line)'}` }}>
                  {flag(c.code)} {c.code}
                </button>
              )
            })}
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
      </>) })()}
    </>
  )
}

// ── TRANSACTIONS TAB ──────────────────────────────────────────────
const TXN_FILTERS: { key: '' | TxnStatus; label: string }[] = [
  { key: '',           label: 'All'        },
  { key: 'pending',    label: 'Pending'    },
  { key: 'processing', label: 'Processing' },
  { key: 'success',    label: 'Success'    },
  { key: 'failed',     label: 'Failed'     },
]

const PAGE_SIZE = 50

// API joins the tipster (`select('*, tipster:tipsters(name, username)')`),
// which isn't part of the base TransactionRow type — extend it locally.
type AdminTxnRow = TransactionRow & { tipster?: { name: string; username: string } | null }

function txnStatusStyle(status: TxnStatus): { bg: string; color: string; border: string } {
  switch (status) {
    case 'success':
      return { bg: 'var(--green-lt)', color: 'var(--green)', border: 'rgba(46,204,122,0.3)' }
    case 'failed':
    case 'cancelled':
      return { bg: 'var(--red-lt)', color: 'var(--red)', border: 'rgba(255,107,107,0.3)' }
    default: // pending · processing
      return { bg: 'var(--gold-lt)', color: 'var(--gold)', border: 'rgba(245,166,35,0.3)' }
  }
}

function TransactionsTab({ market }: { market: string }) {
  const [status,  setStatus]  = useState<'' | TxnStatus>('')
  const [rows,    setRows]    = useState<AdminTxnRow[]>([])
  const [count,   setCount]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [more,    setMore]    = useState(false)

  // Initial load + refetch from offset 0 whenever a filter changes.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/admin/transactions?status=${status}&market=${market}&limit=${PAGE_SIZE}&offset=0`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setRows(d.transactions ?? [])
        setCount(d.count ?? 0)
      })
      .catch(() => { if (!cancelled) { setRows([]); setCount(0) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [status, market])

  async function loadMore() {
    setMore(true)
    try {
      const res = await fetch(`/api/admin/transactions?status=${status}&market=${market}&limit=${PAGE_SIZE}&offset=${rows.length}`)
      const d   = await res.json()
      setRows(prev => [...prev, ...(d.transactions ?? [])])
      if (typeof d.count === 'number') setCount(d.count)
    } catch {
      /* ignore — button stays for retry */
    }
    setMore(false)
  }

  return (
    <>
      {/* Status filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {TXN_FILTERS.map(f => {
          const active = status === f.key
          return (
            <button
              key={f.key || 'all'}
              onClick={() => setStatus(f.key)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                background: active ? 'var(--gold-lt)' : 'var(--bg3)',
                color: active ? 'var(--gold)' : 'var(--muted)',
                border: `1px solid ${active ? 'rgba(245,166,35,0.3)' : 'var(--line)'}`,
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Loader2 size={22} className="spin" color="var(--gold)" />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
          <Receipt size={28} color="var(--muted)" style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--offwhite)' }}>No transactions yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Payments will appear here as they come in</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Transactions ({count.toLocaleString()})
          </div>
          {rows.map(t => {
            const pill   = txnStatusStyle(t.status)
            const payer  = t.payer || t.user_phone || t.user_email || '—'
            const method = t.method === 'momo' ? 'MoMo' : t.method === 'card' ? 'Card' : '—'
            return (
              <div key={t.id} className="card">
                {/* Top row: amount + status pill */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--white)' }}>
                      {/* Each row carries its own currency (stub unlocks record the market's). */}
                      {t.currency ?? 'UGX'} {t.amount.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                      {new Date(t.created_at).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: pill.bg, color: pill.color, border: `1px solid ${pill.border}`, textTransform: 'capitalize', flexShrink: 0, marginLeft: 8 }}>
                    {t.status}
                  </span>
                </div>

                {/* Detail grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                  <TxnField label="Payer" value={payer} />
                  <TxnField label="Method" value={method} />
                  <TxnField label="Tipster" value={t.tipster?.name ?? '—'} />
                  <TxnField label="Type" value={t.type} capitalize />
                  <TxnField label="Ref" value={t.external_id || '—'} mono span2 />
                </div>
              </div>
            )
          })}

          {rows.length < count && (
            <button
              onClick={loadMore}
              disabled={more}
              style={{ width: '100%', padding: '11px', background: 'var(--bg3)', color: 'var(--offwhite)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}
            >
              {more ? <Loader2 size={15} className="spin" /> : null}
              {more ? 'Loading…' : `Load more (${(count - rows.length).toLocaleString()})`}
            </button>
          )}
        </>
      )}
    </>
  )
}

// A single labelled cell inside a transaction card.
function TxnField({ label, value, mono, capitalize, span2 }: { label: string; value: string; mono?: boolean; capitalize?: boolean; span2?: boolean }) {
  return (
    <div style={{ minWidth: 0, gridColumn: span2 ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 1 }}>{label}</div>
      <div
        style={{
          fontSize: 12, fontWeight: 600, color: 'var(--offwhite)',
          fontFamily: mono ? 'monospace' : undefined,
          textTransform: capitalize ? 'capitalize' : undefined,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
        title={value}
      >
        {value}
      </div>
    </div>
  )
}

// ── SLIPS (moderation) ────────────────────────────────────────────
// All slips are shown on the marketplace by default; hide a stale/expired one
// here to pull it (kickoff times aren't reliable across bookies, so removal is
// manual). Hidden slips stay on the tipster's own dashboard, tagged "Hidden".
function SlipsTab({ market }: { market: string }) {
  const [slips, setSlips]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/slips?market=${market}`)
      .then(r => r.json()).then(d => setSlips(d.slips ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [market])

  async function toggle(id: string, hidden: boolean) {
    setBusy(id)
    const r = await fetch('/api/admin/slips', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ betslip_id: id, hidden }),
    })
    if (r.ok) setSlips(s => s.map(x => x.id === id ? { ...x, hidden } : x))
    setBusy(null)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}><Loader2 size={18} className="spin" /></div>
  if (!slips.length) return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 13 }}>No slips yet</div>

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
        Hide a slip to remove it from the customer marketplace (e.g. its games have already kicked off). It stays on the tipster&apos;s dashboard.
      </div>
      {slips.map(s => {
        const ko = s.earliest_kickoff ? new Date(s.earliest_kickoff).toLocaleString('en-UG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
        return (
          <div key={s.id} className="card" style={{ padding: '12px 14px', marginBottom: 8, opacity: s.hidden ? 0.55 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--white)' }}>{s.tipsters?.name ?? 'Unknown'} · ×{s.total_odds ?? '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{s.game_count ?? '?'} games · {(s.markets ?? []).join(', ') || '—'} · {s.verification_status}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>KO {ko} · result {s.result}</div>
              </div>
              <button onClick={() => toggle(s.id, !s.hidden)} disabled={busy === s.id}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 9, border: '1px solid var(--line)', background: s.hidden ? 'var(--gold-lt)' : 'none', color: s.hidden ? 'var(--gold)' : 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                {busy === s.id ? <Loader2 size={13} className="spin" /> : (s.hidden ? <><Eye size={13} /> Show</> : <><EyeOff size={13} /> Hide</>)}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── MARKETS TAB (country controls) ────────────────────────────────
// Flip a market live (active), enable its payments, or tag it coming
// soon — no SQL needed. Uganda is locked here AND server-side (403):
// the live market can't be toggled from the panel; SQL is the
// deliberate escape hatch.
function MarketsTab({ markets, onChange }: { markets: Country[]; onChange: (c: Country) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err,  setErr]  = useState('')

  async function toggle(c: Country, field: 'active' | 'payments_enabled' | 'coming_soon') {
    setBusy(c.code); setErr('')
    const res = await fetch('/api/admin/countries', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: c.code, [field]: !c[field] }),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.country) onChange(d.country)
    else setErr(d.error ?? 'Could not update the market')
    setBusy(null)
  }

  function Toggle({ c, field, label, onColor }: { c: Country; field: 'active' | 'payments_enabled' | 'coming_soon'; label: string; onColor: string }) {
    const locked = c.code === 'UG'
    const on = !!c[field]
    return (
      <button onClick={() => toggle(c, field)} disabled={locked || busy === c.code}
        title={locked ? 'Uganda is the live market — locked' : undefined}
        style={{ padding: '7px 4px', borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: locked ? 'default' : 'pointer', opacity: locked ? 0.55 : 1, background: on ? `${onColor === 'var(--green)' ? 'var(--green-lt)' : 'var(--gold-lt)'}` : 'var(--bg3)', color: on ? onColor : 'var(--muted)', border: `1px solid ${on ? 'transparent' : 'var(--line)'}` }}>
        {label}: {on ? 'ON' : 'OFF'}
      </button>
    )
  }

  return (
    <>
      <div style={{ background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 12, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--offwhite)', lineHeight: 1.6 }}>
        <b>Active</b> makes a market public (geo-redirect + clickable on the picker). <b>Payments</b> switches it from free unlocks to real charges (needs a processor — only Uganda/ioTec today). <b>Coming soon</b> is the tag on the picker. Uganda is locked.
      </div>
      {err && <div style={{ background: 'var(--red-lt)', color: 'var(--red)', borderRadius: 10, padding: '9px 12px', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>{err}</div>}
      {markets.map(c => (
        <div key={c.code} className="card" style={{ borderLeft: `3px solid ${c.active ? 'var(--green)' : 'var(--line)'}`, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 22 }}>{flag(c.code)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)' }}>
                {c.name} {c.code === 'UG' && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 20, padding: '2px 7px', marginLeft: 4, verticalAlign: 'middle' }}>LIVE · LOCKED</span>}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{c.subdomain}.betfluencer.org · {c.currency_code} ({c.currency_symbol})</div>
            </div>
            {busy === c.code && <Loader2 size={14} className="spin" color="var(--gold)" />}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <Toggle c={c} field="active"           label="Active"      onColor="var(--green)" />
            <Toggle c={c} field="payments_enabled" label="Payments"    onColor="var(--green)" />
            <Toggle c={c} field="coming_soon"      label="Coming soon" onColor="var(--gold)"  />
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
  const [byCountry, setByCountry] = useState<any[]>([])
  const [pw,       setPw]       = useState('')
  const [loginErr, setLoginErr] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  // ── Market switcher ('' = all markets) — survives tab reloads ────
  const [market,  setMarket]  = useState('')
  const [markets, setMarkets] = useState<Country[]>([])
  const sym = symFor(markets, market)
  function changeMarket(m: string) {
    setMarket(m)
    try { sessionStorage.setItem('bf_admin_market', m) } catch { /* private mode */ }
  }

  useEffect(() => {
    try { setMarket(sessionStorage.getItem('bf_admin_market') ?? '') } catch { /* private mode */ }
  }, [])

  // Stats follow the selected market; markets list loads once on auth.
  useEffect(() => {
    if (!authed) return
    fetch(`/api/admin/stats?market=${market}`)
      .then(r => r.json())
      .then(d => {
        if (d.stats) setStats(d.stats)
        if (d.activity) setActivity(d.activity)
        setByCountry(d.byCountry ?? [])
      })
      .catch(() => {})
  }, [authed, market])

  useEffect(() => {
    if (!authed) return
    fetch('/api/admin/countries')
      .then(r => r.json()).then(d => setMarkets(d.countries ?? []))
      .catch(() => {})
  }, [authed])

  useEffect(() => {
    // Admin = a valid admin session cookie (master password).
    fetch('/api/admin/me')
      .then(r => { if (!r.ok) return; setAuthed(true) })
      .finally(() => setChecking(false))
  }, [])

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoginErr(''); setLoggingIn(true)
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
    const d = await res.json().catch(() => ({}))
    setLoggingIn(false)
    if (!res.ok) { setLoginErr(d.error || 'Login failed'); return }
    setAuthed(true)
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setAuthed(false)
    window.location.href = '/admin'
  }

  if (checking) return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />
  if (!authed) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={login} style={{ width: '100%', maxWidth: 320, background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: 18, padding: 24 }}>
        <Shield size={28} color="var(--gold)" style={{ margin: '0 auto 12px', display: 'block' }} />
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--white)', marginBottom: 6, textAlign: 'center' }}>Admin access</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, textAlign: 'center' }}>Enter the admin password.</div>
        {loginErr && <div style={{ background: 'var(--red-lt)', color: 'var(--red)', borderRadius: 10, padding: '9px 12px', fontSize: 13, marginBottom: 10 }}>{loginErr}</div>}
        <input className="inp" type="password" placeholder="Admin password" value={pw} onChange={e => setPw(e.target.value)} style={{ marginBottom: 12 }} autoFocus />
        <button className="btn-gold" disabled={loggingIn || !pw} style={{ width: '100%', opacity: (loggingIn || !pw) ? 0.5 : 1 }}>
          {loggingIn ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  )

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

      {/* Market switcher — scopes every tab to one market ('' = all) */}
      <div style={{ background: 'var(--bg2)', padding: '8px 16px 10px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Globe size={14} color="var(--gold)" style={{ flexShrink: 0 }} />
        <select
          value={market}
          onChange={e => changeMarket(e.target.value)}
          style={{ flex: 1, background: 'var(--bg3)', color: 'var(--white)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          <option value="">🌍 All markets (overview)</option>
          {markets.map(c => (
            <option key={c.code} value={c.code}>
              {flag(c.code)} {c.name}{c.active ? '' : ' — not live'}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'var(--bg2)', borderBottom: '1px solid var(--line)' }}>
        {([
          { key: 'overview',     icon: Home,        label: 'Overview' },
          { key: 'markets',      icon: Globe,        label: 'Markets'  },
          { key: 'tipsters',     icon: Users,        label: 'Tipsters' },
          { key: 'slips',        icon: EyeOff,       label: 'Slips'    },
          { key: 'transactions', icon: Receipt,      label: 'Txns'     },
          { key: 'revenue',      icon: BarChart2,    label: 'Revenue'  },
          { key: 'verify',       icon: ShieldCheck,  label: 'Verify'   },
          { key: 'review',       icon: CheckCircle,  label: 'Settle'   },
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
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              {market ? `${markets.find(c => c.code === market)?.name ?? market} today` : 'Platform today'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <StatCard val={stats.subscribers.toLocaleString()} label="Total purchases" />
              <StatCard val={stats.tipsters.toString()} label="Live tipsters" color="var(--green)" />
              <StatCard val={`${sym} ${(stats.commission/1000).toFixed(0)}k`} label="Total commission" color="var(--gold)" />
              <StatCard val={stats.liveAds.toString()} label="Live ads" />
            </div>

            {/* All-markets view: how each market is doing side by side */}
            {!market && byCountry.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '14px 0 10px' }}>By market</div>
                <div className="card" style={{ padding: '4px 14px', marginBottom: 4 }}>
                  {byCountry.map((c: any, i: number) => (
                    <div key={c.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < byCountry.length - 1 ? '1px solid var(--line)' : 'none' }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{flag(c.code)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--white)' }}>
                          {c.name}
                          <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 6, padding: '1px 7px', borderRadius: 20, background: c.active ? 'var(--green-lt)' : 'var(--bg3)', color: c.active ? 'var(--green)' : 'var(--muted)' }}>
                            {c.active ? 'LIVE' : 'DARK'}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{c.tipsters} tipsters · {c.purchases} purchases</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--gold)' }}>{c.currency_code} {(c.commission ?? 0).toLocaleString()}</div>
                        <div style={{ fontSize: 9, color: 'var(--muted)' }}>commission</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

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

        {/* ── MARKETS (country controls) ── */}
        {tab === 'markets' && <MarketsTab markets={markets} onChange={c => setMarkets(prev => prev.map(x => x.code === c.code ? c : x))} />}

        {/* ── TIPSTERS ── */}
        {tab === 'tipsters' && <TipstersTab market={market} markets={markets} />}

        {/* ── SLIPS ── */}
        {tab === 'slips' && <SlipsTab market={market} />}

        {/* ── TRANSACTIONS ── */}
        {tab === 'transactions' && <TransactionsTab market={market} />}

        {/* ── REVENUE ── */}
        {tab === 'revenue' && <RevenueTab market={market} sym={sym} />}

        {/* ── VERIFY (leg-level review) ── */}
        {tab === 'verify' && <VerifyTab />}

        {/* ── SETTLE (slip settlement) ── */}
        {tab === 'review' && <ReviewTab market={market} sym={sym} />}
      </div>
    </div>
  )
}
