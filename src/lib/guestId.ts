// Anonymous buyer identity. Buyers don't log in — their purchases are keyed on
// a random id persisted in localStorage and sent to the API as the
// `x-buyer-key` header.
//
// LIMITATION: localStorage is per-browser. A guest's purchases do NOT follow
// them to another device/browser, and clearing site data loses access to
// already-bought slips.
const KEY = 'bf_guest'

export function getGuestId(): string {
  if (typeof window === 'undefined') return ''
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return ''
  }
}

// Header to attach to buyer requests (initiate / reveal / subscribe).
export function buyerHeader(): Record<string, string> {
  const id = getGuestId()
  return id ? { 'x-buyer-key': id } : {}
}
