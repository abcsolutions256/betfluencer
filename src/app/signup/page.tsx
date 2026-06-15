'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr]           = useState('')
  const [msg, setMsg]           = useState('')
  const [loading, setLoading]   = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setMsg(''); setLoading(true)
    const { data, error } = await supabaseBrowser().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
    })
    setLoading(false)
    if (error) { setErr(error.message); return }
    if (!data.session) { setMsg('Check your email to confirm your account, then log in.'); return }
    router.push('/'); router.refresh()
  }

  return (
    <div style={shell}>
      <form onSubmit={submit} style={card}>
        <div style={title}>Create account</div>
        <div style={sub}>Buy and unlock tipster slips</div>
        {err && <div style={errorBox}>{err}</div>}
        {msg && <div style={okBox}>{msg}</div>}
        <input style={input} placeholder="Name" value={name} onChange={e => setName(e.target.value)} autoFocus />
        <input style={input} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input style={input} type="password" placeholder="Password (min 6)" value={password} onChange={e => setPassword(e.target.value)} />
        <button style={btn} disabled={loading || !email || password.length < 6}>
          {loading ? <Loader2 size={16} className="spin" /> : 'Sign up'}
        </button>
        <div style={foot}>
          Have an account? <Link href="/login" style={lnk}>Log in</Link> · <Link href="/tipster/signup" style={lnk}>Become a tipster</Link>
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
const okBox: React.CSSProperties = { background: 'var(--green-lt)', color: 'var(--green)', border: '1px solid rgba(46,204,122,0.3)', borderRadius: 10, padding: '9px 12px', fontSize: 13 }
