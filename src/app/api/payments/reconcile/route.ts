// ── POST /api/payments/reconcile ──────────────────────────────────
// Server-side safety net for stranded payments. The client status poll only
// runs while the payment sheet is open, so a buyer who closes the tab mid-
// approval (common with MoMo STK push) can pay without the purchase ever
// being fulfilled — unless the webhook fires. This endpoint re-checks
// non-terminal BUYER collections against ioTec and fulfils any that have
// since succeeded, independent of the client and the webhook.
//
// Driven by the `sync` container on an interval. Auth: header
// `x-sync-token: <SYNC_TOKEN>` (same as /api/slips/sync-codes).

import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase'
import { getCollectionStatus, getCollectionByExternalId } from '@/lib/iotec'
import { updateTransaction } from '@/lib/transactions'
import { normalizeIotecStatus } from '@/types/payments'
import { fulfillTransaction } from '@/lib/fulfillment'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const token = req.headers.get('x-sync-token') ?? ''
  if (!process.env.SYNC_TOKEN || token !== process.env.SYNC_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const db    = supabaseServer()
  const batch = Number(process.env.RECONCILE_BATCH ?? 25)
  const now   = Date.now()

  // Non-terminal BUYER collections only (never tipster payouts). Skip the
  // freshest (<60s) so we don't race the live client poll, and ignore stale
  // ones (>48h) that ioTec has long since finalised.
  const { data: txns } = await db
    .from('transactions')
    .select('*')
    .eq('type', 'collection')
    .in('status', ['pending', 'processing'])
    .lt('created_at', new Date(now - 60_000).toISOString())
    .gt('created_at', new Date(now - 48 * 3600_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(batch)

  let checked = 0, updated = 0, fulfilled = 0
  for (const txn of txns ?? []) {
    const res = txn.iotec_id
      ? await getCollectionStatus(txn.iotec_id)
      : await getCollectionByExternalId(txn.external_id)
    checked++
    if (!res.ok) continue

    const status = normalizeIotecStatus(res.status)
    if (status === txn.status) continue   // no change

    const u = await updateTransaction(txn.id, {
      status,
      iotec_status:   res.status ?? null,
      status_message: res.statusMessage ?? null,
      raw:            res.raw ?? null,
    }) ?? txn
    updated++

    // fulfillTransaction is idempotent (no-op if the purchase is already
    // active), so this is safe alongside the client poll + webhook.
    if (status === 'success') { await fulfillTransaction(u); fulfilled++ }
  }

  return NextResponse.json({ ok: true, checked, updated, fulfilled })
}

export const POST = handler
export const GET  = handler   // convenience for a plain curl
