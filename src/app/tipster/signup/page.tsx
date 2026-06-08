'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TopBar, BottomNav } from '@/components/layout/Navigation'
import { Loader2 } from 'lucide-react'

export default function TipsterSignupPage() {
  const router = useRouter()
  const [signupsOpen, setSignupsOpen] = useState<boolean | null>(null)
  const [form,    setForm]    = useState({ name: '', username: '', phone: '', password: '', sport: '', description: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(d => setSignupsOpen(d.publicSignupsEnabled ?? false))
      .catch(() => setSignupsOpen(false))
  }, [])

  async function signup() {
    if (!form.name || !form.phone || !form.password) { setError('Please fill in all required fields'); return }
    setLoading(true); setError('')
    const res  = await fetch('/api/tipster/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signup', ...form }),
    })
    const data = await res.json()
    if (res.ok) {
      localStorage.setItem('bf_tipster', JSON.stringify(data))
      router.push('/tipster/dashboard')
    } else {
      setError(data.error ?? 'Signup failed. Please try again.')
    }
    setLoading(false)
  }

  if (signupsOpen === null) return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />

  if (!signupsOpen) return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--white)', marginBottom: 8 }}>Coming soon</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 300, marginBottom: 24 }}>
          Tipster applications are not yet open to the public. We are onboarding our first verified tipsters.
        </div>
        <div style={{ fontSize: 13, color: 'var(--offwhite)', background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 18px' }}>
          Already have an account?{' '}
          <span onClick={() => router.push('/tipster/login')} style={{ color: 'var(--gold)', fontWeight: 700, cursor: 'pointer' }}>Log in →</span>
        </div>
      </main>
      <BottomNav />
    </div>
  )

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <main style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 40px' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--white)', marginBottom: 4 }}>Become a tipster</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Create your channel and start earning from your picks</div>
        </div>
        {error && <div style={{ background: 'var(--red-lt)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>{error}</div>}
        <div className="card">
          <label className="lbl">Full name *</label>
          <input className="inp" placeholder="e.g. John Mugisha" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ marginBottom: 10 }} />
          <label className="lbl">Username *</label>
          <input className="inp" placeholder="e.g. JohnTips" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} style={{ marginBottom: 10 }} />
          <label className="lbl">Phone number *</label>
          <input className="inp" placeholder="e.g. 0771234567" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={{ marginBottom: 10 }} />
          <label className="lbl">Password *</label>
          <input className="inp" type="password" placeholder="Min 8 characters" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={{ marginBottom: 10 }} />
          <label className="lbl">Sport / leagues</label>
          <input className="inp" placeholder="e.g. Premier League, UPL" value={form.sport} onChange={e => setForm(f => ({ ...f, sport: e.target.value }))} style={{ marginBottom: 10 }} />
          <label className="lbl">Bio (optional)</label>
          <input className="inp" placeholder="Short description for your channel" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ marginBottom: 16 }} />
          <button className="btn-gold" onClick={signup} style={{ width: '100%' }}>
            {loading ? <Loader2 size={16} className="spin" /> : 'Create account →'}
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>
          Already have an account?{' '}
          <span onClick={() => router.push('/tipster/login')} style={{ color: 'var(--gold)', fontWeight: 700, cursor: 'pointer' }}>Log in</span>
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
