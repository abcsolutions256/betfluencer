'use client'
import { useEffect, useRef, useState } from 'react'
import {
  Smartphone, CreditCard, Loader2, Check, AlertCircle, X,
} from 'lucide-react'
import type { PaymentMethod, PaymentResult, TxnStatus } from '@/types/payments'
import { isTerminal } from '@/types/payments'
import { buyerHeader, setBuyerPhone } from '@/lib/guestId'
import { useCountry } from '@/components/CountryProvider'

interface Props {
  open:         boolean
  amount:       number
  betslipId:    string
  tipsterName?: string
  slipLabel?:   string
  onDone:  (r: PaymentResult) => void
  onClose: () => void
}

type SheetState = 'form' | 'submitting' | 'pending' | 'success' | 'failed'

const POLL_MS    = 3000
const MAX_POLLS  = 40 // ~2 min
const SUCCESS_MS = 1300

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
const phoneDigits = (v: string) => v.replace(/\D/g, '')

export function PaymentSheet({
  open, amount, betslipId, tipsterName, slipLabel, onDone, onClose,
}: Props) {
  const { fmtMoney } = useCountry()
  const [mounted, setMounted] = useState(false)        // drives slide-up transition
  const [state,   setState]   = useState<SheetState>('form')
  const [method,  setMethod]  = useState<PaymentMethod>('momo')
  const [phone,   setPhone]   = useState('')
  const [email,   setEmail]   = useState('')
  const [message, setMessage] = useState('')
  const [extId,   setExtId]   = useState('')

  // Hold the in-flight transaction so we can resolve onDone with real ids.
  const txnRef  = useRef<{ transaction_id: string; external_id: string }>({
    transaction_id: '', external_id: '',
  })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const triesRef = useRef(0)

  const clearPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    triesRef.current = 0
  }

  // Reset everything when the sheet (re)opens; trigger slide-up next frame.
  useEffect(() => {
    if (open) {
      setState('form'); setMethod('momo'); setPhone(''); setEmail('')
      setMessage(''); setExtId('')
      txnRef.current = { transaction_id: '', external_id: '' }
      const id = requestAnimationFrame(() => setMounted(true))
      return () => cancelAnimationFrame(id)
    }
    setMounted(false)
    clearPoll()
  }, [open])

  // Cleanup any running poll on unmount.
  useEffect(() => () => clearPoll(), [])

  // A terminal state is locked: submitting/pending cannot be dismissed.
  const locked = state === 'submitting' || state === 'pending'

  const payer = method === 'momo' ? phoneDigits(phone) : email.trim()
  const valid = method === 'momo' ? payer.length >= 7 : isEmail(email)

  function handleClose() {
    if (locked) return
    clearPoll()
    onClose()
  }

  function startPolling(externalId: string) {
    clearPoll()
    triesRef.current = 0
    pollRef.current = setInterval(async () => {
      triesRef.current += 1
      if (triesRef.current > MAX_POLLS) {
        clearPoll()
        setMessage('Timed out — if you paid, it will unlock shortly.')
        setState('failed')
        return
      }
      try {
        const res = await fetch(`/api/payments/status?ext=${encodeURIComponent(externalId)}`)
        const data: PaymentResult = await res.json()
        const status = data.status as TxnStatus
        if (data.transaction_id) txnRef.current.transaction_id = data.transaction_id
        if (data.external_id)    txnRef.current.external_id    = data.external_id
        if (status && isTerminal(status)) {
          clearPoll()
          if (status === 'success') {
            setState('success')
          } else {
            setMessage(data.message || 'Payment was not completed.')
            setState('failed')
          }
        }
      } catch {
        /* transient network error — keep polling until MAX_POLLS */
      }
    }, POLL_MS)
  }

  async function handlePay() {
    if (!valid || state === 'submitting') return
    setState('submitting')
    setMessage('')
    try {
      const res = await fetch('/api/payments/initiate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...buyerHeader() },
        body: JSON.stringify({ betslip_id: betslipId, method, payer }),
      })
      const data: PaymentResult = await res.json()

      // initiate returns non-2xx on rejection (e.g. slip not verified yet).
      if (!res.ok) {
        setMessage((data as any)?.error || 'Could not start the payment.')
        setState('failed')
        return
      }

      txnRef.current = {
        transaction_id: data.transaction_id || '',
        external_id:    data.external_id || '',
      }

      if (data.status === 'failed') {
        setMessage(data.message || 'Could not start the payment. Try again.')
        setState('failed')
        return
      }

      // Instant success — the free-unlock flow on markets without live
      // payments resolves synchronously; no phone prompt, nothing to poll.
      if (data.status === 'success') {
        setMessage(data.message || '')
        setState('success')
        return
      }

      setExtId(data.external_id)
      if (data.card_redirect_url) {
        window.open(data.card_redirect_url, '_blank')
        setMessage('Complete the card payment in the new tab, then come back here.')
      } else {
        setMessage('Check your phone 📲 and enter your Mobile Money PIN to approve.')
      }
      setState('pending')
      startPolling(data.external_id)
    } catch {
      setMessage('Network error — please try again.')
      setState('failed')
    }
  }

  // Auto-resolve on success after a short celebratory beat.
  useEffect(() => {
    if (state !== 'success') return
    // Remember the phone/email the buyer paid with, so reveal / "my slips"
    // prove entitlement (the server gates paid content on the buyer identity).
    setBuyerPhone(payer)
    const t = setTimeout(() => {
      onDone({
        transaction_id: txnRef.current.transaction_id,
        external_id:    txnRef.current.external_id,
        status:         'success',
      })
    }, SUCCESS_MS)
    return () => clearTimeout(t)
  }, [state, onDone])

  if (!open) return null

  const fmt = fmtMoney(amount)

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        opacity: mounted ? 1 : 0, transition: 'opacity 0.22s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: 'var(--bg2)',
          borderRadius: '20px 20px 0 0',
          padding: '18px 16px calc(18px + env(safe-area-inset-bottom))',
          borderTop: '1px solid var(--line)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.45)',
          transform: mounted ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.28s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Header: grabber + title + close */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ width: 38, height: 4, borderRadius: 4, background: 'var(--line)', margin: '0 0 12px' }} />
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--white)' }}>
              {state === 'success' ? 'Slip unlocked!'
                : state === 'failed' ? 'Payment failed'
                : 'Unlock slip'}
            </div>
            {(tipsterName || slipLabel) && state !== 'success' && state !== 'failed' && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                {[tipsterName, slipLabel].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
          <button
            onClick={handleClose}
            disabled={locked}
            aria-label="Close"
            style={{
              border: 'none', background: 'var(--bg3)', borderRadius: 999,
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: locked ? 'not-allowed' : 'pointer',
              color: 'var(--muted)', opacity: locked ? 0.4 : 1,
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── FORM ──────────────────────────────────────────────── */}
        {state === 'form' && (
          <>
            {/* Amount */}
            <div style={{
              background: 'var(--gold-lt)', border: '1px solid rgba(245,166,35,0.25)',
              borderRadius: 14, padding: '12px 14px', marginBottom: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 12, color: 'var(--offwhite)', fontWeight: 600 }}>Amount</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)' }}>{fmt}</span>
            </div>

            {/* Method toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {([
                { key: 'momo' as const, label: 'Mobile Money', Icon: Smartphone },
                { key: 'card' as const, label: 'Card',         Icon: CreditCard },
              ]).map(({ key, label, Icon }) => {
                const active = method === key
                return (
                  <button
                    key={key}
                    onClick={() => setMethod(key)}
                    style={{
                      flex: 1, padding: '11px 8px', borderRadius: 12, cursor: 'pointer',
                      background: active ? 'var(--gold-lt)' : 'var(--bg3)',
                      border: active ? '1px solid var(--gold)' : '1px solid var(--line)',
                      color: active ? 'var(--gold)' : 'var(--muted)',
                      fontSize: 13, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                    }}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Input */}
            {method === 'momo' ? (
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 7 }}>
                  Mobile Money number
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', padding: '0 13px',
                    background: 'var(--bg3)', border: '1px solid var(--line)', borderRadius: 12,
                    fontSize: 14, fontWeight: 700, color: 'var(--offwhite)', flexShrink: 0,
                  }}>
                    +256
                  </div>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="771 234 567"
                    autoFocus
                    style={inputStyle}
                  />
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 7 }}>
                  Email for receipt
                </label>
                <input
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  style={inputStyle}
                />
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--muted)', margin: '10px 2px 16px', lineHeight: 1.5 }}>
              {method === 'momo'
                ? 'You will get a prompt on your phone to approve the payment.'
                : 'You will be redirected to a secure card form in a new tab.'}
            </div>

            <button
              onClick={handlePay}
              disabled={!valid}
              style={{
                ...primaryBtn,
                opacity: valid ? 1 : 0.45,
                cursor: valid ? 'pointer' : 'not-allowed',
              }}
            >
              Pay {fmt}
            </button>
          </>
        )}

        {/* ── SUBMITTING / PENDING ──────────────────────────────── */}
        {(state === 'submitting' || state === 'pending') && (
          <div style={{ textAlign: 'center', padding: '14px 6px 22px' }}>
            <Loader2 size={40} color="var(--gold)" className="spin" style={{ margin: '0 auto 16px', display: 'block' }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--white)', marginBottom: 8 }}>
              {state === 'submitting' ? 'Starting payment…' : 'Waiting for confirmation'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, maxWidth: 320, margin: '0 auto' }}>
              {state === 'submitting'
                ? 'Hang tight a moment.'
                : message}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 16, opacity: 0.7 }}>
              Please keep this open — it unlocks automatically.
            </div>
          </div>
        )}

        {/* ── SUCCESS ───────────────────────────────────────────── */}
        {state === 'success' && (
          <div style={{ textAlign: 'center', padding: '14px 6px 24px' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 999, background: 'var(--green-lt)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', outline: '1px solid rgba(46,204,122,0.3)',
            }}>
              <Check size={34} color="var(--green)" strokeWidth={3} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--white)', marginBottom: 6 }}>
              Slip unlocked!
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Payment confirmed. Enjoy your tip 🎯
            </div>
          </div>
        )}

        {/* ── FAILED ────────────────────────────────────────────── */}
        {state === 'failed' && (
          <div style={{ textAlign: 'center', padding: '14px 6px 22px' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 999, background: 'var(--red-lt)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', outline: '1px solid rgba(255,107,107,0.3)',
            }}>
              <AlertCircle size={34} color="var(--red)" strokeWidth={2.4} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--white)', marginBottom: 8 }}>
              Payment failed
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, maxWidth: 320, margin: '0 auto 20px' }}>
              {message || 'Something went wrong. Please try again.'}
            </div>
            <button
              onClick={() => { setMessage(''); setState('form') }}
              style={primaryBtn}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, width: '100%', padding: '12px 14px', borderRadius: 12,
  background: 'var(--bg3)', border: '1px solid var(--line)',
  color: 'var(--white)', fontSize: 15, fontWeight: 600, outline: 'none',
  fontFamily: 'inherit',
}

const primaryBtn: React.CSSProperties = {
  width: '100%', padding: '13px', borderRadius: 12, border: 'none',
  background: 'var(--gold)', color: '#1A1205', fontSize: 15, fontWeight: 800,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
}
