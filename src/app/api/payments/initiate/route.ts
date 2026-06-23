// ── POST /api/payments/initiate ───────────────────────────────────
// Start a per-slip purchase for the LOGGED-IN buyer. Requires a session,
// a verified+live slip, and ties the purchase to buyer_id (so it follows
// the user across devices and gates the reveal). Creates pending
// transaction + slip_purchase, then asks ioTec to collect.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit, getClientIP, rateLimitResponse } from '@/lib/rateLimit'
import { supabaseServer } from '@/lib/supabase'
import { normalisePhone } from '@/lib/auth'
import { getSessionUser } from '@/lib/auth/session'
import { collect } from '@/lib/iotec'
import { createTransaction, updateTransaction } from '@/lib/transactions'
import { normalizeIotecStatus, MIN_AMOUNT_UGX } from '@/types/payments'
import type { PaymentResult } from '@/types/payments'

export const dynamic = 'force-dynamic'

const schema = z.object({
  betslip_id: z.string(),
  method:     z.enum(['momo', 'card']),
  payer:      z.string(),
  payer_name: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const rl = rateLimit('payments', getClientIP(req))
  if (!rl.allowed) return rateLimitResponse(rl.resetIn)

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Please log in to buy a slip.' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const { betslip_id, method, payer, payer_name } = parsed.data
  const db = supabaseServer()

  const { data: betslip } = await db
    .from('betslips')
    .select('id, slip_price, tipster_id, result, verification_status')
    .eq('id', betslip_id).single()
  if (!betslip) return NextResponse.json({ error: 'Slip not found' }, { status: 404 })
  if (betslip.verification_status !== 'verified') return NextResponse.json({ error: 'This slip is not verified yet.' }, { status: 400 })
  if (betslip.result !== 'pending') return NextResponse.json({ error: 'This slip is already settled (free to view).' }, { status: 400 })

  const { data: tipster } = await db.from('tipsters').select('id, name, phone').eq('id', betslip.tipster_id).single()
  if (!tipster) return NextResponse.json({ error: 'Tipster not found' }, { status: 404 })

  const amount = betslip.slip_price
  if (amount < MIN_AMOUNT_UGX) return NextResponse.json({ error: 'Minimum payment is UGX 500' }, { status: 400 })

  // Already own it?
  const { data: owned } = await db
    .from('slip_purchases').select('id, status')
    .eq('betslip_id', betslip_id).eq('buyer_id', user.id).maybeSingle()
  if (owned?.status === 'active') return NextResponse.json({ error: 'You already own this slip.', already: true }, { status: 409 })

  // Resolve the payer for ioTec (phone for momo, email for card).
  let user_phone: string | null, user_email: string | null, payerForIotec: string
  if (method === 'momo') {
    const norm = normalisePhone(payer)
    user_phone = norm; user_email = null; payerForIotec = norm.replace('+', '')
  } else {
    if (!z.string().email().safeParse(payer).success) return NextResponse.json({ error: 'A valid email is required for card payments' }, { status: 400 })
    user_email = payer; user_phone = null; payerForIotec = payer
  }

  const external_id = 'bf-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)

  const txn = await createTransaction({
    external_id, amount, method, category: 'MobileMoney', purpose: 'slip_purchase',
    betslip_id, tipster_id: tipster.id, user_phone, user_email, payer: payerForIotec, status: 'pending',
  })
  if (!txn) return NextResponse.json({ error: 'Could not create transaction' }, { status: 500 })

  // ── Record the pending purchase (one row per slip+buyer) BEFORE charging ──
  // Explicit lookup → insert/update (no ON CONFLICT / unique-index dependency)
  // with per-step error reporting, so we never charge without a row AND we
  // surface the exact DB error. `detail`/`step` are dev-only.
  const fields = {
    tipster_id: tipster.id,
    user_phone: user_phone ?? user_email ?? payerForIotec,
    user_name:  payer_name ?? '',
    amount_paid: amount,
    status:     'pending' as const,
  }
  const abort = async (step: string, e: any) => {
    console.error(`initiate: slip_purchase ${step} failed —`, e?.message)
    await updateTransaction(txn.id, { status: 'failed', status_message: `purchase ${step} failed` })
    return NextResponse.json({
      error:  'Could not start the purchase. Please try again.',
      step,
      detail: process.env.NODE_ENV !== 'production' ? (e?.message ?? 'unknown error') : undefined,
    }, { status: 500 })
  }

  let purchaseId: string
  // 1) Existing purchase for this slip + buyer?
  const { data: existing, error: selErr } = await db
    .from('slip_purchases').select('id')
    .eq('betslip_id', betslip_id).eq('buyer_id', user.id).maybeSingle()
  if (selErr) return abort('lookup', selErr)

  if (existing) {
    // 2a) Reuse it — reset to pending for this fresh attempt.
    purchaseId = existing.id
    const { error: updErr } = await db.from('slip_purchases').update(fields).eq('id', purchaseId)
    if (updErr) return abort('update', updErr)
  } else {
    // 2b) Insert a new pending purchase.
    const { data: inserted, error: insErr } = await db
      .from('slip_purchases')
      .insert({ betslip_id, buyer_id: user.id, ...fields })
      .select('id').single()
    if (insErr || !inserted) return abort('insert', insErr)
    purchaseId = inserted.id
  }

  // 3) Link the transaction to the purchase so fulfillment can unlock it.
  await updateTransaction(txn.id, { slip_purchase_id: purchaseId })

  const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/pay/return?ext=${external_id}`
  const res = await collect({ amount, payer: payerForIotec, externalId: external_id, payerName: payer_name, payerNote: 'Betfluencer slip purchase', redirectUrl })

  if (!res.ok) {
    await updateTransaction(txn.id, { status: 'failed', status_message: res.error })
    return NextResponse.json({ transaction_id: txn.id, external_id, status: 'failed', message: res.error } as PaymentResult)
  }
  const status = normalizeIotecStatus(res.status)
  await updateTransaction(txn.id, {
    iotec_id: res.id, status, iotec_status: res.status,
    card_redirect_url: res.cardRedirectUrl ?? null, status_message: res.statusMessage, raw: res.raw,
  })
  return NextResponse.json({
    transaction_id: txn.id, external_id, status,
    card_redirect_url: res.cardRedirectUrl ?? null, message: res.statusMessage,
  } as PaymentResult)
}
