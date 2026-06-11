// ── GET /api/payments/status ──────────────────────────────────────
// Polled by the client after initiate. Resolves a transaction by our
// external_id (?ext=) or our transaction id (?id=). While the txn is
// non-terminal it refetches the authoritative status from ioTec, and
// on first `success` it fulfils the purchase (unlock + payout).

import { NextRequest, NextResponse } from 'next/server'
import {
  getTransaction,
  getTransactionByExternalId,
  updateTransaction,
} from '@/lib/transactions'
import { getCollectionStatus, getCollectionByExternalId } from '@/lib/iotec'
import { normalizeIotecStatus, isTerminal } from '@/types/payments'
import { fulfillTransaction } from '@/lib/fulfillment'

export async function GET(req: NextRequest) {
  const ext = req.nextUrl.searchParams.get('ext')
  const id  = req.nextUrl.searchParams.get('id')

  // Resolve the transaction by external_id first, then by id.
  let txn = ext
    ? await getTransactionByExternalId(ext)
    : id
      ? await getTransaction(id)
      : null
  if (!txn) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

  // Refresh non-terminal transactions straight from ioTec.
  if (!isTerminal(txn.status)) {
    const res = txn.iotec_id
      ? await getCollectionStatus(txn.iotec_id)
      : await getCollectionByExternalId(txn.external_id)

    if (res.ok) {
      const status = normalizeIotecStatus(res.status)
      txn = await updateTransaction(txn.id, {
        status,
        iotec_status:   res.status ?? null,
        status_message: res.statusMessage ?? null,
        raw:            res.raw,
      }) ?? txn

      // First time we see success → fulfil (idempotent downstream).
      if (status === 'success') await fulfillTransaction(txn)
    }
  }

  return NextResponse.json({
    transaction_id:    txn.id,
    external_id:       txn.external_id,
    status:            txn.status,
    card_redirect_url: txn.card_redirect_url,
    message:           txn.status_message,
  })
}
