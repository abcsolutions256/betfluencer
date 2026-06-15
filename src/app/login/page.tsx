'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr]           = useState('')
  const [loading, setLoading]   = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setLoading(true)
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) { setErr(error.message); return }
    router.push('/'); router.refresh()
  }

  return (
    <div style={shell}>
      <form onSubmit={submit} style={card}>
        <div style={title}>Log in</div>
        <div style={sub}>Welcome back to Betfluencer</div>
        {err && <div style={errorBox}>{err}</div>}
        <input style={input} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        <input style={input} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
        <button style={btn} disabled={loading || !email || !password}>
          {loading ? <Loader2 size={16} className="spin" /> : 'Log in'}
        </button>
        <div style={foot}>
          No account? <Link href="/signup" style={lnk}>Sign up</Link> · <Link href="/tipster/signup" style={lnk}>Become a tipster</Link>
        </div>
      </form>
    </div>
  )
}

const shell: React.CSSProperties = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
const card: React.CSSProperties = { width: '100%', maxWidth: 380, background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: 18, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }
const title: React.CSSProperties = { fontSize: 22, fontWeight: 800, color: 'var(--white)' }
const sub: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', marginBottom: 6 }
const input: React.CSSProperties = { padding: '12px 14px', borderRadius: 12, background: 'var(--bg3)', border: '1px solid var(--line)', color: 'var(--white)', fontSize: 15, outline: 'none' }
const btn: React.CSSProperties = { padding: 13, borderRadius: 12, border: 'none', background: 'var(--gold)', color: '#1A1205', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }
const foot: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 6 }
const lnk: React.CSSProperties = { color: 'var(--gold)', fontWeight: 700, textDecoration: 'none' }
const errorBox: React.CSSProperties = { background: 'var(--red-lt)', color: 'var(--red)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 10, padding: '9px 12px', fontSize: 13 }
