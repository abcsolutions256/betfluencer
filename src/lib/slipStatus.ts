// Shared slip-status rules — used by the marketplace feed, the public channel
// view and the tipster dashboard so "expired" means the same thing everywhere.

// A still-pending slip is "expired" once its EARLIEST match kicked off more
// than 90 minutes ago: the accumulator can no longer be placed, so it drops
// off client-facing lists. Finished (win/loss) slips are a track record and
// are never treated as expired. The owner still sees expired slips on their
// own dashboard.
export const SLIP_EXPIRY_GRACE_MS = 90 * 60 * 1000

export function isSlipExpired(
  slip: { result?: string | null; earliest_kickoff?: string | null },
  now: number = Date.now(),
): boolean {
  if (slip.result === 'win' || slip.result === 'loss') return false
  if (!slip.earliest_kickoff) return false
  const ko = Date.parse(slip.earliest_kickoff)
  return !Number.isNaN(ko) && ko < now - SLIP_EXPIRY_GRACE_MS
}
