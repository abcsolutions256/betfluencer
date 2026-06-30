import { defineConfig, devices } from '@playwright/test'

// ── Playwright e2e config — the merge-gate regression suite ────────
// Runs against the app pointed at LOCAL Supabase (http://localhost:54321)
// with ioTec in DEMO mode (no real money). The app server is started by
// scripts/e2e.sh (which exports the local Supabase keys + demo payment env),
// so we DON'T configure a `webServer` here — injecting `supabase status`
// keys into webServer.env is awkward and the script does it cleanly in one
// place. With reuseExistingServer the suite simply attaches to whatever is
// already listening on E2E_BASE_URL.
//
// New devs: `npm run test:e2e` (see tests/e2e/README.md). It boots Supabase,
// applies migrations, starts the app, and runs this suite.
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e',
  // global-setup applies the schema and promotes the test admin.
  globalSetup: './tests/e2e/global-setup.ts',
  // Specs share a single dev server + DB; run serially to avoid cross-test
  // interference (the feed is a shared, global surface).
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
