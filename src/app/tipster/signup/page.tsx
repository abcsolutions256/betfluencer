'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

export default function TipsterSignupPage() {
  const router = useRouter()
  const [f, setF] = useState({ name: '', password: '', username: '', phone: '', sport: '', description: '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(s => ({ ...s, [k]: e.target.value }))
  const [err, setErr]         = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setLoading(true)
    const res = await fetch('/api/tipster/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signup', ...f }),
    })
    const d = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setErr(d.error || 'Could not create tipster account'); return }
    router.push('/tipster/dashboard'); router.refresh()
  }

  return (
    <div style={shell}>
      <form onSubmit={submit} style={card}>
        <div style={title}>Become a tipster</div>
        <div style={sub}>Post slips, get paid per sale</div>
        {err && <div style={errorBox}>{err}</div>}
        <input style={input} placeholder="Display name" value={f.name} onChange={set('name')} autoFocus />
        <input style={input} placeholder="Username (public, e.g. enzo)" value={f.username} onChange={set('username')} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={prefix}>+256</div>
          <input style={{ ...input, flex: 1 }} type="tel" placeholder="Mobile Money number (your login + payout)" value={f.phone} onChange={set('phone')} />
        </div>
        <input style={input} type="password" placeholder="Password (min 8, incl. a number)" value={f.password} onChange={set('password')} />
        <input style={input} placeholder="Sport / leagues you cover" value={f.sport} onChange={set('sport')} />
        <textarea style={{ ...input, minHeight: 64, resize: 'vertical' }} placeholder="Short bio (optional)" value={f.description} onChange={set('description')} />
        <button style={btn} disabled={loading || f.password.length < 8 || !f.name || !f.username || f.phone.length < 7}>
          {loading ? <Loader2 size={16} className="spin" /> : 'Create tipster account'}
        </button>
        <div style={foot}>Already a tipster? <Link href="/tipster/login" style={lnk}>Log in</Link></div>
      </form>
    </div>
  )
}

const shell: React.CSSProperties = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
const card: React.CSSProperties = { width: '100%', maxWidth: 400, background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: 18, padding: 24, display: 'flex', flexDirection: 'column', gap: 11 }
const title: React.CSSProperties = { fontSize: 22, fontWeight: 800, color: 'var(--white)' }
const sub: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', marginBottom: 6 }
const input: React.CSSProperties = { padding: '12px 14px', borderRadius: 12, background: 'var(--bg3)', border: '1px solid var(--line)', color: 'var(--white)', fontSize: 15, outline: 'none', fontFamily: 'inherit' }
const prefix: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '0 13px', background: 'var(--bg3)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 14, fontWeight: 700, color: 'var(--offwhite)' }
const btn: React.CSSProperties = { padding: 13, borderRadius: 12, border: 'none', background: 'var(--gold)', color: '#1A1205', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }
const foot: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 6 }
const lnk: React.CSSProperties = { color: 'var(--gold)', fontWeight: 700, textDecoration: 'none' }
const errorBox: React.CSSProperties = { background: 'var(--red-lt)', color: 'var(--red)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 10, padding: '9px 12px', fontSize: 13 }
