# e2e regression suite (Playwright) — the merge gate

These tests are the **regression gate every dev runs before merging**. They drive
the real Next.js app against a **local, dockerized Postgres via the Supabase CLI**
(`http://localhost:54321`) with **ioTec payments in DEMO mode** (no real money),
covering the flows that pay the bills: posting slips, verifying them, and the
anonymous pay-per-slip purchase.

If a spec here goes red, something user-facing broke — don't merge.

## What's covered

| Spec | Feature |
|------|---------|
| `01-home.spec.ts` | Home (`/`) marketplace loads, nav present, no uncaught errors |
| `02-tipster-auth.spec.ts` | Tipster sign-up (unique email/run) → sign-out → log back in → dashboard |
| `03-manual-slip.spec.ts` | Manual slip is auto-`verified`, on the dashboard, and **proof-only** in the public feed (no booking code leaked) |
| `04-coded-slip-paywall.spec.ts` | Booking-code slip posts `pending`; code/site stored in `betslip_secrets`; the booking code never leaks to the public feed (worker verification runs out-of-band, not in CI) |
| `05-guest-purchase.spec.ts` | Anonymous guest buys a pending slip through the **PaymentSheet UI** in demo mode, slip reveals; a **fresh** guest is denied (`403`) |
| `06-admin-hide.spec.ts` | Admin (role-promoted in setup) hides a slip → gone from the feed, still on the tipster dashboard tagged "Hidden" |
| `07-rankings.spec.ts` | Rankings leaderboard renders |

## Prerequisites (one-time)

1. **Docker** running (Supabase boots its containers).
2. **Supabase CLI** installed — `supabase --version`.
3. **Chromium for Playwright**:
   ```bash
   npx playwright install chromium
   ```
   (`@playwright/test` itself is already in devDependencies.)

## Run it — one command

```bash
npm run test:e2e
```

That runs [`scripts/e2e.sh`](../../scripts/e2e.sh), which (all idempotent):

1. `supabase start` (skips if already up).
2. `supabase db reset --no-seed` — applies every migration in `supabase/migrations/`.
3. Exports the **local** Supabase keys (legacy JWT anon + service-role, from
   `supabase status -o env`) and forces `IOTEC_CLIENT_ID=demo`. It also unsets
   `BET_CODE_WORKER_URL` so coded slips stay `pending` and no real scraper is
   touched.
4. Starts the Next.js **dev** server on `:3000` against that local stack
   (set `E2E_BUILD=1` to test a production build instead).
5. Waits for the app, then runs Playwright.

`global-setup.ts` then verifies the schema applied and seeds the one privileged
actor — a confirmed **admin** auth user (`admin@e2e.test`) with `profiles.role='admin'`.

### Pass args through to Playwright

```bash
npm run test:e2e -- tests/e2e/05-guest-purchase.spec.ts --headed
npm run test:e2e -- --debug
```

### Already have the app + Supabase running yourself?

Point the suite at it and skip the runner:

```bash
E2E_BASE_URL=http://localhost:3000 npx playwright test
```

You must still export `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL`
(global-setup seeds the admin with them) and run the app with `IOTEC_CLIENT_ID=demo`.

## Notes / gotchas

- **Never points at production.** The runner overrides `NEXT_PUBLIC_SUPABASE_URL`
  and the ioTec keys with local/demo values for the app process only; your
  committed `.env` (which targets prod) is left untouched.
- **Demo payments** mean `collect`→`Pending`, status poll→`Success`,
  `disburse`→ok — a purchase completes end-to-end with no charge.
- Specs run **serially** (one worker) because they share one DB + feed.
- Supabase is left **running** after the suite so reruns are fast. Stop it with
  `supabase stop` when you're done.
