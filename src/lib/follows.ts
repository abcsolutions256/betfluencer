// ── Follow system — stored locally, no login needed ──────────────

const FOLLOWS_KEY = 'bf_follows'

export function getFollows(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(FOLLOWS_KEY) ?? '[]')
  } catch { return [] }
}

export function isFollowing(tipsterId: string): boolean {
  return getFollows().includes(tipsterId)
}

export function toggleFollow(tipsterId: string): boolean {
  const follows = getFollows()
  const idx     = follows.indexOf(tipsterId)
  if (idx === -1) {
    follows.push(tipsterId)
    localStorage.setItem(FOLLOWS_KEY, JSON.stringify(follows))
    return true  // now following
  } else {
    follows.splice(idx, 1)
    localStorage.setItem(FOLLOWS_KEY, JSON.stringify(follows))
    return false // unfollowed
  }
}

export function getFollowCount(): number {
  return getFollows().length
}
