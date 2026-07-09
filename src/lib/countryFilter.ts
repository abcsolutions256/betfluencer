// ── Per-market content filtering ───────────────────────────────────
// Which tipsters (and therefore slips/rankings) belong to a market,
// via the tipster_countries link table (migration 0011).
//
// Failure semantics protect Uganda: if the link table can't be read
// (not yet migrated, transient error), UG falls back to UNFILTERED —
// exactly the pre-expansion behaviour — while any other market fails
// closed (empty list beats showing another market's content).
import { DEFAULT_COUNTRY } from './country'

type Db = ReturnType<typeof import('./supabase').supabaseServer>

/**
 * Tipster ids visible in a market. `null` means "don't filter" (the
 * UG fallback when the link table is unreadable).
 */
export async function tipsterIdsForCountry(db: Db, countryCode: string): Promise<Set<string> | null> {
  try {
    const { data, error } = await db
      .from('tipster_countries')
      .select('tipster_id')
      .eq('country_code', countryCode)
    if (error) throw new Error(error.message)
    return new Set((data ?? []).map((r: { tipster_id: string }) => r.tipster_id))
  } catch (e) {
    console.error(`tipster_countries read failed (${countryCode}):`, (e as Error)?.message)
    return countryCode === DEFAULT_COUNTRY.code ? null : new Set()
  }
}

/** Convenience: keep only rows whose `id`/`tipster_id` is in the market. */
export function filterByTipsterIds<T extends Record<string, any>>(
  rows: T[],
  ids: Set<string> | null,
  key: 'id' | 'tipster_id' = 'id'
): T[] {
  if (ids === null) return rows
  return rows.filter(r => ids.has(r[key]))
}

/** Best-effort link of a tipster to a market (used at signup / by admin). */
export async function linkTipsterToCountry(db: Db, tipsterId: string, countryCode: string): Promise<void> {
  try {
    const { error } = await db
      .from('tipster_countries')
      .upsert({ tipster_id: tipsterId, country_code: countryCode }, { onConflict: 'tipster_id,country_code' })
    if (error) throw new Error(error.message)
  } catch (e) {
    // Never fail the caller (e.g. signup) over the link — UG resolves
    // unfiltered on error anyway, and admin can fix links later.
    console.error(`linkTipsterToCountry(${tipsterId}, ${countryCode}) failed:`, (e as Error)?.message)
  }
}
