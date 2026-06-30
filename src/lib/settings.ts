// Platform settings (platform_settings key/value table) read helpers.
// Server-only — uses the service-role client.
import { supabaseServer } from '@/lib/supabase'

// Public tipster self-signup. Default CLOSED: when there is no DB, no row, or
// the value isn't exactly 'true', signups are disabled and only an admin can
// create tipster accounts (POST /api/admin/tipsters). Flip via the admin
// "Public signups" toggle (POST /api/admin/settings { publicSignupsEnabled }).
export async function publicSignupsEnabled(): Promise<boolean> {
  const db = supabaseServer()
  if (!db) return false
  const { data } = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'public_signups_enabled')
    .maybeSingle()
  return data?.value === 'true'
}
