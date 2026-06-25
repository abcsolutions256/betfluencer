// Playwright global setup — runs once before any spec.
//
// Responsibilities:
//  1. Sanity-check that the local Supabase service-role key is present
//     (scripts/e2e.sh exports it). Without it nothing can be seeded.
//  2. Ensure the schema is applied. We do NOT run `supabase db reset` here by
//     default — that's the runner script's job and resetting mid-suite would
//     be slow/destructive — but we DO verify the expected tables exist and
//     fail fast with a clear message if migrations were never applied.
//  3. Seed the one privileged actor the suite needs: a confirmed admin auth
//     user whose profile role is 'admin'. Specs read its credentials from
//     env so they can log in through the real /login UI.
import type { FullConfig } from '@playwright/test'
import { admin, createAuthUser, setRole } from './helpers'

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@e2e.test'
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'e2eAdmin123!'

async function ensureSchema() {
  const db = admin()
  // A cheap probe: select from a table that only exists after migrations.
  const { error } = await db.from('profiles').select('id').limit(1)
  if (error) {
    throw new Error(
      `Schema check failed (profiles table missing?). Did migrations apply?\n` +
        `Run \`supabase db reset --no-seed\` (the runner does this).\n` +
        `Underlying error: ${error.message}`,
    )
  }
}

async function ensureAdmin() {
  const db = admin()
  // Create (or reuse) the admin auth user, then force the role to 'admin'.
  const { data: existing } = await db
    .from('profiles')
    .select('id, role')
    .eq('email', ADMIN_EMAIL)
    .maybeSingle()

  if (!existing) {
    await createAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD)
  }
  await setRole(ADMIN_EMAIL, 'admin')
  // eslint-disable-next-line no-console
  console.log(`[global-setup] admin ready: ${ADMIN_EMAIL}`)
}

export default async function globalSetup(_config: FullConfig) {
  // Expose the admin creds to specs (they import these from env).
  process.env.E2E_ADMIN_EMAIL = ADMIN_EMAIL
  process.env.E2E_ADMIN_PASSWORD = ADMIN_PASSWORD

  await ensureSchema()
  await ensureAdmin()
}
