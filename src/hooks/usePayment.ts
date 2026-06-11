'use client'
import { useCallback, useRef, useState } from 'react'
import { createElement, type ReactNode } from 'react'
import { PaymentSheet } from '@/components/ui/PaymentSheet'
import type { PaymentResult } from '@/types/payments'

// Options passed to pay(). The sheet uses these to render the summary.
export interface PayOptions {
  betslipId:    string
  amount:       number
  tipsterName?: string
  slipLabel?:   string
}

interface SheetState {
  open: boolean
  opts: PayOptions | null
}

const CANCELLED: PaymentResult = {
  transaction_id: '',
  external_id:    '',
  status:         'cancelled',
}

/**
 * usePayment — drives a single shared <PaymentSheet />.
 *
 *   const { pay, sheet } = usePayment()
 *   const r = await pay({ betslipId, amount, tipsterName, slipLabel })
 *   if (r.status === 'success') { ... }
 *   return <>{...}{sheet}</>
 *
 * `pay` opens the sheet and resolves once the payment reaches a terminal
 * state (success / failed / cancelled). Closing the sheet without completing
 * resolves with a `{ status: 'cancelled' }`-shaped PaymentResult.
 */
export function usePayment() {
  const [state, setState] = useState<SheetState>({ open: false, opts: null })
  // The promise resolver for the in-flight pay() call. Held in a ref so the
  // sheet callbacks always see the latest one without re-creating them.
  const resolver = useRef<((r: PaymentResult) => void) | null>(null)

  const pay = useCallback((opts: PayOptions): Promise<PaymentResult> => {
    // If a previous call is somehow still hanging, cancel it cleanly.
    resolver.current?.(CANCELLED)
    return new Promise<PaymentResult>(res => {
      resolver.current = res
      setState({ open: true, opts })
    })
  }, [])

  const finish = useCallback((r: PaymentResult) => {
    const res = resolver.current
    resolver.current = null
    setState(s => ({ ...s, open: false }))
    res?.(r)
  }, [])

  const sheet: ReactNode = createElement(PaymentSheet, {
    open:        state.open,
    amount:      state.opts?.amount ?? 0,
    betslipId:   state.opts?.betslipId ?? '',
    tipsterName: state.opts?.tipsterName,
    slipLabel:   state.opts?.slipLabel,
    onDone:      (r: PaymentResult) => finish(r),
    onClose:     () => finish(CANCELLED),
  })

  return { pay, sheet }
}
