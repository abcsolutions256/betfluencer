// ── POST /api/payments/initiate ───────────────────────────────────
// Starts a per-betslip purchase: validates the slip, creates a pending
// transaction + slip_purchase, then asks ioTec to collect from the
// buyer (Mobile Money prompt, or a card redirect URL). Returns a
// PaymentResult the client polls via /api/payments/status.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit, getClientIP, rateLimitResponse } from '@/lib/rateLimit'
import { supabaseServer } from '@/lib/supabase'
import { normalisePhone } from '@/lib/auth'
import { normalizeBuyer } from '@/lib/entitlement'
import { collect } from '@/lib/iotec'
import { createTransaction, updateTransaction } from '@/lib/transactions'
import { normalizeIotecStatus, MIN_AMOUNT_UGX } from '@/types/payments'
import type { PaymentResult } from '@/types/payments'

const schema = z.object({
  betslip_id: z.string(),
  method:     z.enum(['momo', 'card']),
  payer:      z.string(),
  payer_name: z.string().optional(),
})

export async function POST(req: NextRequest) {
  // Rate limit by client IP.
  const ip = getClientIP(req)
  const rl = rateLimit('payments', ip)
  if (!rl.allowed) return rateLimitResponse(rl.resetIn)

  // Validate the request body.
  const body   = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { betslip_id, method, payer, payer_name } = parsed.data
  const db = supabaseServer()

  // ── Fetch the betslip being purchased ───────────────────────────
  const { data: betslip } = await db
    .from('betslips')
    .select('id, slip_price, tipster_id, result')
    .eq('id', betslip_id)
    .single()
  if (!betslip) return NextResponse.json({ error: 'Betslip not found' }, { status: 404 })

  // Settled slips are free to view — nothing to charge for.
  if (betslip.result !== 'pending') {
    return NextResponse.json({ error: 'This slip is already settled (free to view).' }, { status: 400 })
  }

  // ── Fetch the tipster (payout target) ───────────────────────────
  const { data: tipster } = await db
    .from('tipsters')
    .select('id, name, phone')
    .eq('id', betslip.tipster_id)
    .single()
  if (!tipster) return NextResponse.json({ error: 'Tipster not found' }, { status: 404 })

  // ── Amount + minimum check ──────────────────────────────────────
  const amount = betslip.slip_price
  if (amount < MIN_AMOUNT_UGX) {
    return NextResponse.json({ error: 'Minimum payment is UGX 500' }, { status: 400 })
  }

  // ── Resolve the payer identity for ioTec ────────────────────────
  let user_phone:    string | null
  let user_email:    string | null
  let payerForIotec: string
  if (method === 'momo') {
    const norm    = normalisePhone(payer)        // → +2567...
    const msisdn  = norm.replace('+', '')        // ioTec wants 2567... (no +)
    user_phone    = norm
    user_email    = null
    payerForIotec = msisdn
  } else {
    // Card flow uses the buyer's email as the ioTec payer.
    const isEmail = z.string().email().safeParse(payer).success
    if (!isEmail) return NextResponse.json({ error: 'A valid email is required for card payments' }, { status: 400 })
    user_email    = payer
    user_phone    = null
    payerForIotec = payer
  }

  // Our reconciliation reference — unique, sortable-ish, opaque.
  const external_id = 'bf-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)

  // ── Create the pending transaction record ───────────────────────
  const txn = await createTransaction({
    external_id,
    amount,
    method,
    category:   'MobileMoney',
    purpose:    'slip_purchase',
    betslip_id,
    tipster_id: tipster.id,
    user_phone,
    user_email,
    payer:      payerForIotec,
    status:     'pending',
  })
  if (!txn) return NextResponse.json({ error: 'Could not create transaction' }, { status: 500 })

  // ── Create the pending slip_purchase ────────────────────────────
  // slip_purchases.user_phone is NOT NULL — store the payer identity
  // (phone for momo, email for card) so the row is valid either way.
  const { data: purchase } = await db
    .from('slip_purchases')
    .insert({
      betslip_id,
      tipster_id:  tipster.id,
      // Buyer identity for entitlement checks — normalised phone or email,
      // matched by paidSlipIds() when gating slip content on read.
      user_phone:  normalizeBuyer(payer),
      user_name:   payer_name ?? '',
      amount_paid: amount,
      status:      'pending',
    })
    .select()
    .single()
  if (purchase) await updateTransaction(txn.id, { slip_purchase_id: purchase.id })

  // Where ioTec returns the buyer after a card payment.
  const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/pay/return?ext=${external_id}`

  // ── Ask ioTec to collect from the buyer ─────────────────────────
  const res = await collect({
    amount,
    payer:       payerForIotec,
    externalId:  external_id,
    payerName:   payer_name,
    payerNote:   'Betfluencer slip purchase',
    redirectUrl,
  })

  // Collection request rejected outright — mark failed, tell the client.
  if (!res.ok) {
    await updateTransaction(txn.id, { status: 'failed', status_message: res.error })
    const result: PaymentResult = {
      transaction_id: txn.id,
      external_id,
      status:         'failed',
      message:        res.error,
    }
    return NextResponse.json(result)
  }

  // Accepted — persist ioTec's ids/status and return the result.
  const status = normalizeIotecStatus(res.status)
  await updateTransaction(txn.id, {
    iotec_id:          res.id ?? null,
    status,
    iotec_status:      res.status ?? null,
    card_redirect_url: res.cardRedirectUrl ?? null,
    status_message:    res.statusMessage ?? null,
    raw:               res.raw,
  })

  const result: PaymentResult = {
    transaction_id:    txn.id,
    external_id,
    status,
    card_redirect_url: res.cardRedirectUrl ?? null,
    message:           res.statusMessage,
  }
  return NextResponse.json(result)
}
