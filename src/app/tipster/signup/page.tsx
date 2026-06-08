'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function TipsterSignup() {
  const router = useRouter()
  const [form, setForm] = useState({ name:'', username:'', phone:'', password:'', confirmPassword:'', sport:'', description:'' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(k: string, v: string) { setForm(f => ({...f, [k]: v})) }

  async function signup() {
    if (!form.name || !form.username || !form.phone || !form.password) {
      setError('Please fill in all required fields'); return
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match'); return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters'); return
    }
    if (!/\d/.test(form.password)) {
      setError('Password must contain at least one number'); return
    }
    setLoading(true); setError('')
    const res  = await fetch('/api/tipster/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signup', ...form }),
    })
    const data = await res.json()
    if (data.id) {
      localStorage.setItem('bf_tipster_id', data.id)
      localStorage.setItem('bf_tipster_name', data.name)
      router.push('/tipster/dashboard')
    } else {
      setError(data.error ?? 'Signup failed. Please try again.')
    }
    setLoading(false)
  }

  const fields = [
    { lbl:'Your full name',           key:'name',            type:'text',     ph:'e.g. Enzo Kampala',        required:true  },
    { lbl:'Username (public channel)',key:'username',        type:'text',     ph:'e.g. EnzoKampala',         required:true  },
    { lbl:'Phone number',             key:'phone',           type:'tel',      ph:'e.g. 770 123 456',         required:true  },
    { lbl:'Password',                 key:'password',        type:'password', ph:'Min 8 chars, 1 number',    required:true  },
    { lbl:'Confirm password',         key:'confirmPassword', type:'password', ph:'Repeat your password',     required:true  },
    { lbl:'Sports / leagues',         key:'sport',           type:'text',     ph:'e.g. Premier League, UCL', required:false },
    { lbl:'About your channel',       key:'description',     type:'text',     ph:'Short description...',     required:false },
  ]

  return (
    <div className="flex flex-col min-h-screen p-6" style={{ background: 'var(--bg)' }}>
      <div style={{ marginBottom: 28, marginTop: 24 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--gold)', marginBottom: 4 }}>
          bet<span style={{ color: 'var(--offwhite)', fontWeight: 300 }}>fluencer</span>
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--white)' }}>Become a tipster</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4, fontWeight: 500 }}>Create your free channel. Start earning today.</div>
      </div>

      <div className="card">
        {fields.map(f => (
          <div key={f.key} style={{ marginBottom: 12 }}>
            <label className="lbl">{f.lbl} {f.required && <span style={{ color: 'var(--gold)' }}>*</span>}</label>
            {f.key === 'phone' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="inp" style={{ width: 'auto', padding: '14px 12px', flexShrink: 0, fontWeight: 800, color: 'var(--offwhite)' }}>+256</div>
                <input className="inp flex-1" type="tel" placeholder={f.ph} value={(form as any)[f.key]} onChange={e => set(f.key, e.target.value)} />
              </div>
            ) : (
              <input className="inp" autoComplete="off" type={f.type} placeholder={f.ph} value={(form as any)[f.key]} onChange={e => set(f.key, e.target.value)} />
            )}
          </div>
        ))}

        <div style={{ background: 'var(--green-lt)', border: '1px solid rgba(46,204,122,0.25)', borderRadius: 12, padding: '10px 12px', marginBottom: 16, fontSize: 13, color: 'var(--offwhite)', lineHeight: 1.5, fontWeight: 500 }}>
          Betfluencer takes 10% of each subscription. The rest goes straight to your Mobile Money instantly — we never hold your money.
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</div>}

        <button className="btn-gold" style={{ opacity: (!form.name || !form.username || !form.phone || !form.password) ? 0.4 : 1 }} onClick={signup}>
          {loading ? <Loader2 size={16} className="spin" /> : '🚀'} Create my channel
        </button>
      </div>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Already have an account? </span>
        <Link href="/tipster/login" style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
      </div>
    </div>
  )
}
