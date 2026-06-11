// ── Payment fulfillment ───────────────────────────────────────────
// Runs once a collection reaches `success`: unlocks the buyer's slip
// purchase, pays the tipster their 90% via mobile-money disbursement,
// and logs the earning. Designed to be idempotent and safe to call
// from both the status poller and the ioTec webhook — a duplicate call
// is a no-op once the purchase is already `active`.

import { supabaseServer } from './supabase'
import { disburse } from './iotec'
import { createTransaction, updateTransaction, getTransactionByExternalId } from './transactions'
import { normalizeIotecStatus } from '@/types/payments'
import type { TransactionRow } from '@/types/payments'
import { logEarning } from './db'

// Fulfil a successful collection: unlock the slip + pay out the tipster.
// Never throws — fulfillment failures are logged, not propagated, so the
// caller (status route / webhook) can still respond cleanly.
export async function fulfillTransaction(txn: TransactionRow): Promise<void> {
  // Only successful collections get fulfilled.
  if (txn.status !== 'success') return

  const db = supabaseServer()

  // ── Idempotency guard ───────────────────────────────────────────
  // If the linked purchase is already active, fulfillment ran before.
  if (txn.slip_purchase_id) {
    const { data: existing } = await db
      .from('slip_purchases')
      .select('status')
      .eq('id', txn.slip_purchase_id)
      .single()
    if (existing?.status === 'active') return
  }

  // ── Unlock the buyer's slip purchase ────────────────────────────
  if (txn.slip_purchase_id) {
    await db
      .from('slip_purchases')
      .update({ status: 'active' })
      .eq('id', txn.slip_purchase_id)
  }

  // ── Pay out the tipster (90%) ───────────────────────────────────
  // Wrapped so a disbursement/earning failure never throws out of
  // fulfillment — the buyer is already unlocked above.
  try {
    // Capture in a const so the non-null narrowing survives the awaits below.
    const tipsterId = txn.tipster_id
    if (!tipsterId) {
      console.error('fulfillTransaction: no tipster_id on txn', txn.id)
      return
    }

    const { data: tipster } = await db
      .from('tipsters')
      .select('name, phone')
      .eq('id', tipsterId)
      .single()

    // Platform takes its commission; tipster gets the remainder.
    const commission    = Math.round(txn.amount * parseFloat(process.env.PLATFORM_COMMISSION ?? '0.10'))
    const tipsterAmount = txn.amount - commission
    const payee         = (tipster?.phone ?? '').replace('+', '')

    // Track the payout as its own disbursement transaction.
    const payoutExternalId = txn.external_id + '-payout'
    await createTransaction({
      external_id: payoutExternalId,
      amount:      tipsterAmount,
      type:        'disbursement',
      method:      'momo',
      purpose:     'tipster_payout',
      betslip_id:  txn.betslip_id,
      tipster_id:  tipsterId,
      payer:       tipster?.phone ?? null,
      status:      'pending',
    })

    // Fire the actual mobile-money disbursement to the tipster.
    const d = await disburse({
      amount:     tipsterAmount,
      payee,
      externalId: payoutExternalId,
      payeeName:  tipster?.name,
    })

    // Reconcile the disbursement transaction with ioTec's response.
    const payoutTxn = await getTransactionByExternalId(payoutExternalId)
    if (payoutTxn) {
      await updateTransaction(payoutTxn.id, {
        iotec_id:     d.id ?? null,
        status:       d.ok ? normalizeIotecStatus(d.status) : 'failed',
        iotec_status: d.status ?? null,
        raw:          d.raw ?? null,
      })
    }

    if (!d.ok) {
      console.error('fulfillTransaction: tipster payout failed', { txn: txn.id, error: d.error })
    }

    // Record the earning regardless of payout transport outcome — the
    // sale happened; payout retries/reconciliation are tracked separately.
    await logEarning({
      tipster_id: tipsterId,
      amount:     tipsterAmount,
      gross:      txn.amount,
      commission,
      plan:       'slip',
      user_phone: txn.user_phone ?? txn.payer ?? '',
    })
  } catch (err) {
    // Buyer is already unlocked; never let a payout error bubble up.
    console.error('fulfillTransaction: payout/earning step failed', { txn: txn.id, err })
  }
}
