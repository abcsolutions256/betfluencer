// ── Slip entitlement / paid-content gating ────────────────────────
// Pending slips are the paid product. Their picks live in the
// booking_code / betting_site / slip_image_url columns. We must NOT
// return those to anyone who hasn't bought the slip. Finished slips
// (win/loss) are free to view, so they are never gated.
//
// Buyer identity has no session — it is the phone (MoMo) or email
// (Card) used at purchase, normalised the same way on both sides.

import { supabaseServer } from './supabase'
import { normalisePhone } from './auth'

// Normalise a buyer identifier: email → lowercased; otherwise a phone
// number → +256XXXXXXXXX. Matches what initiate stores on slip_purchases.
export function normalizeBuyer(raw?: string | null): string {
  const v = (raw ?? '').trim()
  if (!v) return ''
  if (v.includes('@')) return v.toLowerCase()
  return normalisePhone(v)
}

// The subset of `slipIds` this buyer has an ACTIVE purchase for.
export async function paidSlipIds(
  buyer: string | null | undefined,
  slipIds: string[],
): Promise<Set<string>> {
  const id = normalizeBuyer(buyer)
  if (!id || slipIds.length === 0) return new Set()

  const db = supabaseServer()
  const { data } = await db
    .from('slip_purchases')
    .select('betslip_id')
    .eq('user_phone', id)
    .eq('status', 'active')
    .in('betslip_id', slipIds)

  return new Set((data ?? []).map((r: any) => r.betslip_id))
}

type GateableSlip = {
  id:              string
  result?:         string
  booking_code?:   unknown
  betting_site?:   unknown
  slip_image_url?: unknown
  note?:           unknown
}

// Strip the paid fields from a PENDING slip the buyer hasn't unlocked.
// Returns the slip with a `locked` flag the client can read. Finished
// slips and paid slips pass through untouched (locked: false).
export function gateSlip<T extends GateableSlip>(slip: T, paid: boolean): T & { locked: boolean } {
  const finished = slip.result === 'win' || slip.result === 'loss'
  if (finished || paid) return { ...slip, locked: false }
  return {
    ...slip,
    booking_code:   null,
    betting_site:   null,
    slip_image_url: null,
    note:           '',
    locked:         true,
  }
}
