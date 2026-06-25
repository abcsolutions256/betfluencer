// Shared e2e helpers. These talk DIRECTLY to local Supabase with the
// service-role key (for seeding/promoting) and to the running app's HTTP API
// (for driving flows that are awkward through the UI, e.g. the worker
// callback or a deterministic guest purchase).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
export const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
export const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

// A service-role client — bypasses RLS. Used only by setup/seeding code.
export function admin(): SupabaseClient {
  if (!SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — run via scripts/e2e.sh which exports the local key.',
    )
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Unique-per-run identifiers so reruns never collide.
export function uniqueEmail(prefix = 'tipster'): string {
  return `${prefix}+${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}@e2e.test`
}
export function uniqueUsername(prefix = 'enzo'): string {
  return `${prefix}${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 5)}`.replace(/[^a-z0-9]/g, '')
}
export const TEST_PASSWORD = 'e2ePass123!'

// Promote a Supabase-auth user (by email) to a given role on their profile.
// The auth signup trigger creates the profile row; we just flip the role.
export async function setRole(email: string, role: 'user' | 'tipster' | 'admin') {
  const db = admin()
  const { data, error } = await db
    .from('profiles')
    .update({ role })
    .eq('email', email)
    .select('id, role')
  if (error) throw new Error(`setRole(${email}, ${role}) failed: ${error.message}`)
  if (!data?.length) throw new Error(`setRole: no profile found for ${email}`)
  return data[0]
}

// Create a confirmed auth user directly via the Admin API (no email
// confirmation needed). Returns the user id. Used where we want a logged-in
// session without driving the signup UI.
export async function createAuthUser(email: string, password = TEST_PASSWORD) {
  const db = admin()
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw new Error(`createAuthUser(${email}) failed: ${error.message}`)
  return data.user!.id
}

// Random guest buyer key (the value normally generated client-side and stored
// in localStorage under `bf_guest`, sent as the x-buyer-key header).
export function newGuestKey(): string {
  return `e2e-${randomUUID()}`
}
