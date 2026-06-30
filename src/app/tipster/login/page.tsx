'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

export default function TipsterLoginPage() {
  const router = useRouter()
  const [phone, setPhone]       = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr]           = useState('')
  const [loading, setLoading]   = useState(false)
  // Only show the "Sign up" link when public signups are open.
  const [signupsOpen, setSignupsOpen] = useState(false)

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(d => setSignupsOpen(d.publicSignupsEnabled === true))
      .catch(() => setSignupsOpen(false))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setLoading(true)
    const res = await fetch('/api/tipster/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', phone: phone.trim(), password }),
    })
    const d = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setErr(d.error || 'Could not log in'); return }
    router.push('/tipster/dashboard'); router.refresh()
  }

  return (
    <div style={shell}>
      <form onSubmit={submit} style={card}>
        <div style={title}>Tipster log in</div>
        <div style={sub}>Manage your slips and earnings</div>
        {err && <div style={errorBox}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={prefix}>+256</div>
          <input style={{ ...input, flex: 1 }} type="tel" placeholder="Mobile Money number" value={phone} onChange={e => setPhone(e.target.value)} autoFocus />
        </div>
        <input style={input} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        <button style={btn} disabled={loading || !phone || !password}>
          {loading ? <Loader2 size={16} className="spin" /> : 'Log in'}
        </button>
        {signupsOpen && <div style={foot}>New tipster? <Link href="/tipster/signup" style={lnk}>Sign up</Link></div>}
      </form>
    </div>
  )
}

const shell: React.CSSProperties = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
const card: React.CSSProperties = { width: '100%', maxWidth: 380, background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: 18, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }
const title: React.CSSProperties = { fontSize: 22, fontWeight: 800, color: 'var(--white)' }
const sub: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', marginBottom: 6 }
const input: React.CSSProperties = { padding: '12px 14px', borderRadius: 12, background: 'var(--bg3)', border: '1px solid var(--line)', color: 'var(--white)', fontSize: 15, outline: 'none' }
const prefix: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '0 13px', background: 'var(--bg3)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 14, fontWeight: 700, color: 'var(--offwhite)' }
const btn: React.CSSProperties = { padding: 13, borderRadius: 12, border: 'none', background: 'var(--gold)', color: '#1A1205', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }
const foot: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 6 }
const lnk: React.CSSProperties = { color: 'var(--gold)', fontWeight: 700, textDecoration: 'none' }
const errorBox: React.CSSProperties = { background: 'var(--red-lt)', color: 'var(--red)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 10, padding: '9px 12px', fontSize: 13 }
