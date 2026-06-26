// Buyer identity (client). Buyers don't log in — they are identified by the
// phone (Mobile Money) they pay with. After a successful purchase the phone is
// stored in localStorage and sent to the API as the `x-buyer-phone` header, so
// already-bought slips stay unlocked. A returning buyer can re-enter their phone
// on the "Mine" page to recover purchases (incl. on another device).
const KEY = 'bf_buyer_phone'

export function getBuyerPhone(): string {
  if (typeof window === 'undefined') return ''
  try { return localStorage.getItem(KEY) ?? '' } catch { return '' }
}

export function setBuyerPhone(phone: string): void {
  if (typeof window === 'undefined') return
  try { const p = (phone ?? '').trim(); if (p) localStorage.setItem(KEY, p) } catch { /* ignore */ }
}

export function clearBuyerPhone(): void {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

// Header to attach to buyer requests (reveal / subscribe).
export function buyerHeader(): Record<string, string> {
  const p = getBuyerPhone()
  return p ? { 'x-buyer-phone': p } : {}
}
