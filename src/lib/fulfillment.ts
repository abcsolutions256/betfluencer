// ── Payment fulfillment ───────────────────────────────────────────
// Runs once a collection reaches `success`: unlocks the buyer's slip
// purchase, records what the tipster is owed (earning) and a PENDING
// payout transaction. Tipster payouts are DISBURSED MANUALLY by an admin
// — there is no automatic mobile-money disbursement. Idempotent and safe
// to call from both the status poller and the ioTec webhook — a duplicate
// call is a no-op once the purchase is already `active`.

import { supabaseServer } from './supabase'
import { createTransaction } from './transactions'
import type { TransactionRow } from '@/types/payments'
import { logEarning } from './db'

// Fulfil a successful collection: unlock the slip + record the owed payout.
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

  // ── Record the tipster's payout (90%) — MANUAL disbursement ──────
  // No funds are sent automatically. We log the earning (what's owed) and a
  // PENDING disbursement transaction so an admin can pay it out manually and
  // see the payout queue in the Transactions tab. Wrapped so a recording
  // failure never throws out of fulfillment — the buyer is already unlocked.
  try {
    const tipsterId = txn.tipster_id
    if (!tipsterId) {
      console.error('fulfillTransaction: no tipster_id on txn', txn.id)
      return
    }

    const { data: tipster } = await db
      .from('tipsters')
      .select('name, phone, commission_rate')
      .eq('id', tipsterId)
      .single()

    // Effective platform cut: per-tipster override → global setting → env.
    const { data: setting } = await db.from('platform_settings').select('value').eq('key', 'platform_commission').maybeSingle()
    const globalRate = parseFloat(setting?.value ?? process.env.PLATFORM_COMMISSION ?? '0.10')
    const rate       = tipster?.commission_rate != null ? Number(tipster.commission_rate) : globalRate
    const commission    = Math.round(txn.amount * rate)
    const tipsterAmount = txn.amount - commission

    // Record the payout as a PENDING disbursement — the admin's manual-payout
    // queue. Left 'pending' on purpose; nothing auto-sends or reconciles it.
    const payoutExternalId = txn.external_id + '-payout'
    await createTransaction({
      external_id:    payoutExternalId,
      amount:         tipsterAmount,
      type:           'disbursement',
      method:         'momo',
      purpose:        'tipster_payout',
      betslip_id:     txn.betslip_id,
      tipster_id:     tipsterId,
      payer:          tipster?.phone ?? null,
      status:         'pending',
      status_message: 'Awaiting manual disbursement',
    })

    // Record the earning regardless — the sale happened; the manual payout is
    // tracked by the pending disbursement above.
    await logEarning({
      tipster_id: tipsterId,
      amount:     tipsterAmount,
      gross:      txn.amount,
      commission,
      plan:       'slip',
      user_phone: txn.user_phone ?? txn.payer ?? '',
    })
  } catch (err) {
    // Buyer is already unlocked; never let a recording error bubble up.
    console.error('fulfillTransaction: payout/earning record step failed', { txn: txn.id, err })
  }
}
