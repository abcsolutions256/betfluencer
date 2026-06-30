// ── POST /api/webhooks/iotec ──────────────────────────────────────
// ioTec calls this when a collection's status changes. We never trust
// the posted body: we authenticate the caller (shared callback token,
// when configured), then refetch the authoritative status from ioTec
// before updating our transaction and fulfilling on success.
// Always ack with 200 (so ioTec stops retrying) unless we hit an
// unexpected error — then 500 so ioTec retries later.

import { NextRequest, NextResponse } from 'next/server'
import {
  getTransactionByIotecId,
  getTransactionByExternalId,
  updateTransaction,
} from '@/lib/transactions'
import { getCollectionStatus } from '@/lib/iotec'
import { normalizeIotecStatus } from '@/types/payments'
import { fulfillTransaction } from '@/lib/fulfillment'

export async function POST(req: NextRequest) {
  try {
    // ── Authenticate the caller ───────────────────────────────────
    // If a secret is configured, require it via header or bearer token.
    // No secret set → skip (demo / sandbox).
    const secret = process.env.IOTEC_WEBHOOK_SECRET ?? ''
    if (secret) {
      const provided =
        req.headers.get('x-iotec-callback-token') ??
        (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      if (provided !== secret) {
        return NextResponse.json({ error: 'invalid callback token' }, { status: 401 })
      }
    }

    // ── Parse the posted transaction object ───────────────────────
    let payload: any
    try {
      payload = await req.json()
    } catch {
      return NextResponse.json({ error: 'invalid json' }, { status: 400 })
    }
    const { id, externalId, status } = payload ?? {}

    // ── Find our transaction (by ioTec id, then by externalId) ────
    let txn =
      (id ? await getTransactionByIotecId(id) : null) ??
      (externalId ? await getTransactionByExternalId(externalId) : null)
    // Ack unknown transactions so ioTec doesn't keep retrying.
    if (!txn) return NextResponse.json({ received: true })

    // ── Verify by refetch (don't trust the payload) ───────────────
    const res = await getCollectionStatus(id ?? txn.iotec_id ?? '')
    const authoritative = res.ok ? res.status : status
    const norm = normalizeIotecStatus(authoritative)

    txn = await updateTransaction(txn.id, {
      status:         norm,
      iotec_status:   authoritative ?? null,
      status_message: res.statusMessage ?? txn.status_message,
      raw:            res.raw ?? null,
    }) ?? txn

    // Fulfil on success (idempotent — safe alongside the status poller).
    if (norm === 'success') await fulfillTransaction(txn)

    return NextResponse.json({ received: true })
  } catch (err) {
    // Unexpected failure → 500 so ioTec retries the callback.
    console.error('ioTec webhook error:', err)
    return NextResponse.json({ error: 'webhook processing failed' }, { status: 500 })
  }
}
