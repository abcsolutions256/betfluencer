'use client'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { usePayment } from '@/hooks/usePayment'
import { useCountry } from '@/components/CountryProvider'

interface Props {
  betslipId:    string
  amount:       number
  tipsterName?: string
  slipLabel?:   string
  onUnlocked?:  () => void
  className?:   string
}

/**
 * BuySlipButton — drop-in "unlock this slip" button.
 * Opens the shared PaymentSheet, and calls onUnlocked() once the payment
 * reaches a successful terminal state.
 */
export function BuySlipButton({
  betslipId, amount, tipsterName, slipLabel, onUnlocked, className,
}: Props) {
  const { pay, sheet } = usePayment()
  const { fmtMoney } = useCountry()
  const [busy, setBusy] = useState(false)

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      const r = await pay({ betslipId, amount, tipsterName, slipLabel })
      if (r.status === 'success') onUnlocked?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={busy}
        className={className}
        style={{
          width: '100%', padding: '12px', borderRadius: 12, border: 'none',
          background: 'var(--gold)', color: '#1A1205', fontSize: 14, fontWeight: 800,
          cursor: busy ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: busy ? 0.85 : 1,
          transition: 'opacity 0.15s, transform 0.15s',
        }}
      >
        {busy
          ? <Loader2 size={16} className="spin" />
          : <>🔓 Unlock — {fmtMoney(amount)}</>}
      </button>
      {sheet}
    </>
  )
}
