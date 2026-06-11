'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { isTerminal } from '@/types/payments'
import type { TxnStatus } from '@/types/payments'

// Card payments redirect the customer here after the PegPay form.
// We poll our own status endpoint until the transaction settles.
function PayReturnInner() {
  const sp  = useSearchParams()
  const ext = sp.get('ext') ?? ''
  const [status, setStatus] = useState<TxnStatus>('processing')
  const tries = useRef(0)

  useEffect(() => {
    if (!ext) { setStatus('failed'); return }
    let active = true
    const poll = async () => {
      try {
        const r = await fetch(`/api/payments/status?ext=${encodeURIComponent(ext)}`)
        const d = await r.json()
        if (!active) return
        const s = (d.status ?? 'processing') as TxnStatus
        setStatus(s)
        if (isTerminal(s)) return
      } catch { /* keep polling */ }
      if (active && tries.current++ < 40) setTimeout(poll, 3000)
      else if (active) setStatus('failed')
    }
    poll()
    return () => { active = false }
  }, [ext])

  const view = {
    success: { icon: <CheckCircle size={48} color="var(--green)" />, title: 'Payment confirmed', sub: 'Your slip is unlocked. Open it from the channel.' },
    failed:  { icon: <AlertCircle size={48} color="var(--red)" />,  title: 'Payment not completed', sub: 'If you were charged, it will unlock shortly — or try again.' },
    cancelled: { icon: <AlertCircle size={48} color="var(--red)" />, title: 'Payment cancelled', sub: 'No charge was made.' },
    pending: { icon: <Loader2 size={48} color="var(--gold)" className="spin" />, title: 'Confirming payment…', sub: 'Hold on while we confirm with your bank.' },
    processing: { icon: <Loader2 size={48} color="var(--gold)" className="spin" />, title: 'Confirming payment…', sub: 'Hold on while we confirm with your bank.' },
  }[status]

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ marginBottom: 16 }}>{view.icon}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--white)', marginBottom: 8 }}>{view.title}</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>{view.sub}</div>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <button style={{ padding: '12px 28px', background: 'var(--gold)', color: '#1a0a00', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            Back to Betfluencer
          </button>
        </Link>
      </div>
    </div>
  )
}

export default function PayReturnPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={32} color="var(--gold)" className="spin" /></div>}>
      <PayReturnInner />
    </Suspense>
  )
}
