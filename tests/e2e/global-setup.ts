// Playwright global setup — runs once before any spec.
//
// Auth is now phone-identity (signed cookies). The admin is configured purely
// by env (ADMIN_PHONES + ADMIN_PASSWORD, exported by scripts/e2e.sh) — there is
// no admin DB row to seed. We only verify the schema is applied.
import type { FullConfig } from '@playwright/test'
import { admin } from './helpers'

export const ADMIN_PHONE = process.env.E2E_ADMIN_PHONE ?? '+256700000000'
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'e2eAdmin123!'

async function ensureSchema() {
  const db = admin()
  // A cheap probe: select from a core table that only exists after migrations.
  const { error } = await db.from('betslips').select('id').limit(1)
  if (error) {
    throw new Error(
      `Schema check failed (betslips table missing?). Did migrations apply?\n` +
        `Run \`supabase db reset --no-seed\` (the runner does this).\n` +
        `Underlying error: ${error.message}`,
    )
  }
}

export default async function globalSetup(_config: FullConfig) {
  // Expose the admin creds to specs (they read these from env).
  process.env.E2E_ADMIN_PHONE = ADMIN_PHONE
  process.env.E2E_ADMIN_PASSWORD = ADMIN_PASSWORD
  await ensureSchema()
}
