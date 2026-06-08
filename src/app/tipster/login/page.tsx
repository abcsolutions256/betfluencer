'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function TipsterLogin() {
  const router = useRouter()
  const [phone, setPhone]     = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function login() {
    if (!phone || !password) return
    setLoading(true); setError('')
    const res  = await fetch('/api/tipster/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', phone: `+256${phone}`, password }),
    })
    const data = await res.json()
    if (data.id) {
      localStorage.setItem('bf_tipster_id', data.id)
      localStorage.setItem('bf_tipster_name', data.name)
      router.push('/tipster/dashboard')
    } else {
      setError(data.error ?? 'Wrong number or password. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col min-h-screen p-6" style={{ background: 'var(--bg)' }}>
      <div style={{ marginBottom: 32, marginTop: 24 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--gold)', marginBottom: 4 }}>
          bet<span style={{ color: 'var(--offwhite)', fontWeight: 300 }}>fluencer</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--white)' }}>Tipster login</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4, fontWeight: 500 }}>Sign in to manage your channel</div>
      </div>

      <div className="card">
        <label className="lbl">Phone number <span style={{ color: 'var(--gold)' }}>*</span></label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div className="inp" style={{ width: 'auto', padding: '14px 12px', flexShrink: 0, fontWeight: 800, color: 'var(--offwhite)' }}>+256</div>
          <input className="inp flex-1" type="tel" placeholder="7XX XXX XXX" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <label className="lbl">Password <span style={{ color: 'var(--gold)' }}>*</span></label>
        <input className="inp" style={{ marginBottom: 18 }} type="password" placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} />
        {error && <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</div>}
        <button className="btn-gold" style={{ opacity: (!phone || !password) ? 0.4 : 1 }} onClick={login}>
          {loading ? <Loader2 size={16} className="spin" /> : '→'} Sign in
        </button>
      </div>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>No account? </span>
        <Link href="/tipster/signup" style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 700, textDecoration: 'none' }}>Create one free</Link>
      </div>
    </div>
  )
}
