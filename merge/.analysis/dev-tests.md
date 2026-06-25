# dev/payments — E2E Test Suite (merge-gate regression suite)

Provenance: the **entire** suite is dev/payments-only. Confirmed absent from `main`:
`git ls-tree -r --name-only main` shows NO `tests/e2e/*`, NO `scripts/e2e.sh`, NO
`playwright.config.ts`; `main`'s `package.json` has NO `test:e2e` script. So merging
must **add** all of these; nothing is being overwritten on the test side.

Files (all in working tree == stag == dev/payments):
- `playwright.config.ts`
- `scripts/e2e.sh`
- `package.json` → `"test:e2e": "bash scripts/e2e.sh"`
- `tests/e2e/{01-home,02-tipster-auth,03-manual-slip,04-coded-slip-paywall,05-guest-purchase,06-admin-hide,07-rankings}.spec.ts`
- `tests/e2e/{README.md, fixtures.ts, global-setup.ts, helpers.ts}`

---

## How the tests run

**One command:** `npm run test:e2e` → `bash scripts/e2e.sh`.

`scripts/e2e.sh` (idempotent, set -euo pipefail):
1. `supabase start` (skips if `supabase status` already up). Boots dockerized
   Postgres + PostgREST + GoTrue Auth.
2. `supabase db reset --no-seed` — applies **every** migration in `supabase/migrations/`
   (formal migrations live on dev/payments — see architecture analysis). This is the
   schema source for tests; the suite does NOT use `src/lib/schema.sql`.
3. Reads local keys via `supabase status -o env` and re-exports them under app names:
   - `NEXT_PUBLIC_SUPABASE_URL` ← `API_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` ← `ANON_KEY` (legacy JWT)
   - `SUPABASE_SERVICE_ROLE_KEY` ← `SERVICE_ROLE_KEY` (legacy JWT)
4. Forces **ioTec DEMO mode** (no real money): `IOTEC_CLIENT_ID=demo`,
   `IOTEC_CLIENT_SECRET=""`, `IOTEC_WALLET_ID=""`. In demo mode collect→Pending,
   status poll→Success, disburse→ok (purchase completes, zero charge).
5. **Unsets `BET_CODE_WORKER_URL`** so `verifyAndRecord()`'s worker call no-ops →
   posted coded slips stay `pending` (exactly what spec 04 asserts). The real
   Puppeteer bookie worker is NOT exercised in CI.
6. Sets `NEXT_PUBLIC_APP_URL`/`E2E_BASE_URL`/`PORT` (default 3000) and admin creds
   `E2E_ADMIN_EMAIL=admin@e2e.test`, `E2E_ADMIN_PASSWORD=e2eAdmin123!`.
7. Starts the Next.js app: **dev server** `next dev` by default, or a production
   build+start if `E2E_BUILD=1`. Logs to `.e2e-app.log`.
8. Readiness gate: polls `GET /api/slips` up to 90×2s; aborts with last 40 log lines
   if the app exits early.
9. `npx playwright test "$@"` — extra args pass through
   (`npm run test:e2e -- tests/e2e/05-guest-purchase.spec.ts --headed`).
   On exit, the trap kills the app but **leaves Supabase running** (fast reruns;
   stop with `supabase stop`).

**Target environment — IMPORTANT:** runs against **LOCAL** dockerized Supabase
(`http://localhost:54321`), never production. The runner overrides
`NEXT_PUBLIC_SUPABASE_URL` + ioTec keys for the app process only; the committed
`.env` (which targets prod) is untouched. `playwright.config.ts` deliberately has
**no `webServer`** block — the script owns env injection; Playwright just attaches to
`E2E_BASE_URL`.

**playwright.config.ts knobs:** `testDir ./tests/e2e`; `globalSetup`
`./tests/e2e/global-setup.ts`; `fullyParallel:false`, `workers:1` (serial — specs
share one DB + the global feed surface); `retries` 1 in CI else 0; `timeout 60s`,
`expect.timeout 15s`; trace `retain-on-failure`, screenshot `only-on-failure`;
single `chromium` project.

**global-setup.ts:** (a) sanity-probes `profiles` table → fails fast with a clear
"did migrations apply?" message; (b) seeds ONE privileged actor — a confirmed admin
auth user (`admin@e2e.test`) whose `profiles.role='admin'`, via the Admin API
(`createAuthUser` with `email_confirm:true`) + `setRole`. Does NOT run db reset
itself.

**helpers.ts:** service-role `admin()` client (bypasses RLS, seeding only);
`uniqueEmail`/`uniqueUsername` (per-run, `@e2e.test`, so reruns never collide);
`setRole` (updates `profiles.role` by email); `createAuthUser` (Admin API,
email-confirmed); `newGuestKey` (random `e2e-<uuid>` guest buyer key — the value
normally in localStorage `bf_guest`, sent as `x-buyer-key`). `TEST_PASSWORD=e2ePass123!`.

**fixtures.ts:** UI flows — `signUpTipster` (drives `/tipster/signup`; relies on
local `enable_confirmations=false` so signUp returns a session immediately —
confirmed `supabase/config.toml:87`), `loginTipster` (`/tipster/login`), `loginUser`
(general `/login`, used for admin), `postManualSlip` (dashboard Post tab → asserts
`×<odds>` card appears).

---

## Secrets / services each test needs

- **Docker** running + **Supabase CLI** installed + `npx playwright install chromium`
  (one-time). All listed in README prerequisites.
- **No external secrets / no real network**: ioTec is demo, the bet-code worker is
  unset. Keys are the LOCAL Supabase legacy JWTs minted by `supabase status` — not
  prod credentials. So the suite is fully self-contained and CI-safe.
- The bet-code worker (Puppeteer scraper) is intentionally OUT of the loop; no spec
  needs it running. Live worker verification is "out-of-band, not in CI."

---

## Spec coverage → §7 preservation checklist mapping

Each spec is a ready-made verification probe for the corresponding payments/auth
feature. Routes/tables referenced below were confirmed present in the dev/payments
tree (`/api/slips`, `/api/tips`, `/api/admin/slips`, `/api/admin/me`,
`/api/slips/[id]/reveal`; tables `profiles`, `betslips`, `betslip_secrets`,
`slip_purchases`).

| Spec | Asserts (provenance) | Preserves (feature to verify survives merge) |
|------|----------------------|-----------------------------------------------|
| **01-home** | `/` renders "Verified slips"/"Marketplace", bottom nav (Channels/Rankings/Mine), feed in valid state, **zero uncaught pageerrors** | Marketplace home + global nav shell load cleanly |
| **02-tipster-auth** | signup (unique email) → dashboard → Profile→Sign out → `/tipster/login` → log back in → dashboard | **Supabase Auth tipster signup/login/logout** (the P0 tipster-login area — this is the regression probe for it) |
| **03-manual-slip** | manual slip auto-`verified`; on dashboard as `×<odds>`; in `/api/slips` feed with `verification_status='verified'`; **proof-only**: feed row has NO `booking_code`/`betting_site`/`legs`; UI shows "✓ Verified" | Manual slip posting + auto-verify + **paywall proof-only feed payload** (no secret leak) |
| **04-coded-slip-paywall** | `POST /api/tips` (auth cookies) → slip `verification_status='pending'`, `result='pending'`; `booking_code`/`betting_site` stored in **`betslip_secrets`** (not on `betslips`); feed text NEVER contains the code | **Booking-code parsing/storage + paywall secret isolation**; worker no-op behavior (stays pending without `BET_CODE_WORKER_URL`) |
| **05-guest-purchase** | anonymous guest buys pending slip via **PaymentSheet** (demo ioTec) → `slip_purchases` row `status='active'`; `/reveal` with buyer's `x-buyer-key` → 200; **fresh** guest key → **403** | **ioTec live-payments flow (demo) + guest-buyer purchase/reveal + access control** (the core revenue path; ties to guest-buyers + reveal in memory) |
| **06-admin-hide** | admin logs in via `/login`; `/api/admin/me` accepts role; `POST /api/admin/slips {hidden:true}` → `betslips.hidden=true`; gone from feed; still on tipster dashboard tagged "Hidden by admin" | **Admin role gate + slip hide/moderation** |
| **07-rankings** | `/rankings` renders "Betfluencer rankings"/"Last 28 days", loading clears, "Tipster" columnheader visible, **zero pageerrors** | Rankings page shell renders (note: ranking *logic* owned by main; this only smoke-tests the page) |

---

## Merge guidance / risks

- **Keep and run the whole suite as the merge gate.** It is the cheapest proof that
  every dev/payments revenue feature (auth, tips/secrets, payments, reveal, admin)
  survived the additive merge. README/config call it exactly that.
- **Dependency: formal `supabase/migrations/`.** The suite hard-depends on
  `supabase db reset --no-seed` applying the migration set (it probes `profiles`,
  reads `betslip_secrets`, `slip_purchases`, `betslips.hidden`). If the merge instead
  standardizes on main's `src/lib/schema.sql`, `scripts/e2e.sh` step 2 and
  `global-setup.ts`'s schema probe must be reconciled or specs will fail at setup.
  Verify the merged migration set still creates: `profiles.role`, `betslips`
  (`verification_status`, `result`, `hidden`, `total_odds`, `slip_price`),
  `betslip_secrets` (`betslip_id`, `booking_code`, `betting_site`), `slip_purchases`
  (`betslip_id`, `status`).
- **UI-coupled assertions are brittle to main's UI.** Specs assert literal copy and
  placeholders from dev/payments' UI: "Verified slips", "Marketplace", "Post tip",
  "Post betslips", placeholders `e.g. 1500`/`e.g. 12.40`/`e.g. 4`, "Unlock slip",
  `771 234 567`, `Pay UGX`, "Hidden by admin", "Betfluencer rankings", "Last 28
  days", "Tipster" columnheader. If main's versions of home/rankings/dashboard win in
  the merge with different copy, specs 01/03/05/06/07 will need their selectors
  updated even though the underlying feature is intact. Treat red here as a
  copy-drift signal, not necessarily a lost feature.
- **No spec exercises the bet-code worker or main's football-API settlement** — those
  need their own verification outside this suite.
- Env names the suite/app read (NAMES ONLY): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `IOTEC_CLIENT_ID`,
  `IOTEC_CLIENT_SECRET`, `IOTEC_WALLET_ID`, `BET_CODE_WORKER_URL`,
  `NEXT_PUBLIC_APP_URL`, `E2E_BASE_URL`, `E2E_PORT`, `PORT`, `E2E_BUILD`,
  `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `CI`.
