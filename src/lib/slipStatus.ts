// Slip visibility helpers for the marketplace / public channel.
//
// Kickoff times aren't reliable across bookies (some don't expose them), so we
// DON'T auto-hide slips by kickoff. Instead an admin manually hides a slip by
// setting betslips.hidden = true; the public feeds exclude those.
//
// This lookup is BEST-EFFORT: if the `hidden` column doesn't exist yet
// (migration 0007 not applied), it returns an empty set so the marketplace
// keeps showing every slip rather than erroring into an empty feed.
export async function fetchHiddenSlipIds(db: any): Promise<Set<string>> {
  const { data, error } = await db.from('betslips').select('id').eq('hidden', true)
  if (error) return new Set()
  return new Set((data ?? []).map((r: any) => r.id as string))
}
