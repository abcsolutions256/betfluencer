// ── Buyer identity (server) ───────────────────────────────────────
// Buyers don't log in. Their identity is the Mobile Money phone they pay with
// (or, for card, the receipt email). It is stored in `slip_purchases.user_phone`
// at purchase and proves entitlement on /reveal + /subscribe. The client sends
// it back as the `x-buyer-phone` header (or `?buyer=` for share links).
//
// NOTE (accepted tradeoff): the phone is unverified — anyone who knows a buyer's
// number could view that buyer's purchased pending picks. Same risk profile as
// the previous anonymous guest-key model; full strength later = OTP.
import { normalisePhone } from './auth'

// Canonicalise a raw buyer identifier: emails lower-cased, phones normalised to
// +256…, so it matches what was stored at purchase. Empty string if blank.
export function buyerIdentity(raw: string | null | undefined): string {
  const v = (raw ?? '').trim()
  if (!v) return ''
  return v.includes('@') ? v.toLowerCase() : normalisePhone(v)
}

// Resolve the buyer identity from a request (header preferred, query fallback).
export function buyerFromRequest(req: Request): string {
  const header = req.headers.get('x-buyer-phone') ?? ''
  let query = ''
  try { query = new URL(req.url).searchParams.get('buyer') ?? '' } catch { /* ignore */ }
  return buyerIdentity(header || query)
}
