// ── transactions table data layer ─────────────────────────────────
// CRUD for the `transactions` table. Used by the payment API routes,
// the webhook, and the admin transactions tab. The table DDL lives in
// supabase/migrations/0002_transactions.sql (and src/lib/schema.sql).

import { supabaseServer } from './supabase'
import type { TransactionRow, TxnStatus } from '@/types/payments'

const TABLE = 'transactions'

export type NewTransaction = {
  external_id:       string
  amount:            number
  type?:             'collection' | 'disbursement'
  method?:           string | null
  category?:         string | null
  purpose?:          string | null
  betslip_id?:       string | null
  tipster_id?:       string | null
  slip_purchase_id?: string | null
  user_phone?:       string | null
  user_email?:       string | null
  payer?:            string | null
  currency?:         string
  status?:           TxnStatus
  iotec_status?:     string | null
  status_message?:   string | null
}

export async function createTransaction(t: NewTransaction): Promise<TransactionRow | null> {
  const db = supabaseServer()
  const { data, error } = await db
    .from(TABLE)
    .insert({ status: 'pending', currency: 'UGX', type: 'collection', ...t })
    .select()
    .single()
  if (error) { console.error('createTransaction error:', error.message); return null }
  return data as TransactionRow
}

export async function updateTransaction(
  id: string,
  patch: Partial<TransactionRow>,
): Promise<TransactionRow | null> {
  const db = supabaseServer()
  const { data, error } = await db
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error('updateTransaction error:', error.message); return null }
  return data as TransactionRow
}

export async function getTransaction(id: string): Promise<TransactionRow | null> {
  const db = supabaseServer()
  const { data } = await db.from(TABLE).select('*').eq('id', id).single()
  return (data as TransactionRow) ?? null
}

export async function getTransactionByExternalId(externalId: string): Promise<TransactionRow | null> {
  const db = supabaseServer()
  const { data } = await db.from(TABLE).select('*').eq('external_id', externalId).single()
  return (data as TransactionRow) ?? null
}

export async function getTransactionByIotecId(iotecId: string): Promise<TransactionRow | null> {
  const db = supabaseServer()
  const { data } = await db.from(TABLE).select('*').eq('iotec_id', iotecId).single()
  return (data as TransactionRow) ?? null
}

export async function listTransactions(opts: {
  limit?: number
  offset?: number
  status?: TxnStatus
  tipsterIds?: string[] | null   // admin market filter; null/undefined = all
} = {}): Promise<{ rows: TransactionRow[]; count: number }> {
  const db = supabaseServer()
  const limit  = opts.limit  ?? 50
  const offset = opts.offset ?? 0
  if (opts.tipsterIds && opts.tipsterIds.length === 0) return { rows: [], count: 0 }
  let q = db
    .from(TABLE)
    .select('*, tipster:tipsters(name, username)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset+1, offset + limit - 1)
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.tipsterIds) q = q.in('tipster_id', opts.tipsterIds)
  const { data, count ,error} = await q
  return { rows: (data as TransactionRow[]) ?? [], count: count ?? 0 }
}
