# Verification Plan — `main` → `stag` (base `dev/payments`)

**Status:** PLAN (tests execute later in step f). This document defines *how* the
merge will be verified. The working tree is `stag` (== `dev/payments`); `main` is
read via `git show main:PATH`.

**Scope reminder — the four fixed merge decisions this plan must prove survived:**
1. Additive, non-destructive migrations only; existing `main` users backfilled into
   `dev/payments`' Supabase Auth (no data loss).
2. **Unified settlement** — code-entered (booking-code) slips must ALSO be settleable
   by `main`'s football-API verifier via the common `betslips`/`betslip_legs` model.
3. Single auth = `dev/payments`' Supabase Auth; `main`'s admin re-wired onto it; auth
   tables created inside `main`'s DB.
4. Both input methods (screenshot + booking code) AND both verifiers (bet-code worker
   entry-validation + football-API settlement) kept.

Sources: `merge/.analysis/dev-tests.md`, `merge/.analysis/main-settlement.md`.

---

## 1. Test assets being merged (provenance)

The **entire** E2E suite is `dev/payments`-only — confirmed absent from `main`
(`git ls-tree -r --name-only main` shows no `tests/e2e/*`, no `scripts/e2e.sh`, no
`playwright.config.ts`; `main`'s `package.json` has no `test:e2e`). The merge **adds**
all of it; nothing on the test side is overwritten.

- `playwright.config.ts` — `testDir ./tests/e2e`, `globalSetup ./tests/e2e/global-setup.ts`,
  `fullyParallel:false`, `workers:1` (serial — specs share one DB + global feed),
  `retries` 1 in CI / 0 local, `timeout 60s`, `expect.timeout 15s`, single `chromium`
  project, **no `webServer` block** (the script owns env injection).
- `scripts/e2e.sh` — orchestrator (boots Supabase, resets DB, injects env, starts Next,
  runs Playwright).
- `package.json` → `"test:e2e": "bash scripts/e2e.sh"` (present on `stag`, absent on `main`).
- `tests/e2e/01-home … 07-rankings.spec.ts` + `README.md`, `fixtures.ts`,
  `global-setup.ts`, `helpers.ts`.

`main` ships **no automated tests** — its verifier (`src/lib/footballApi.ts`,
`src/app/api/verify/route.ts`) has only manual debug routes (`/api/verify-debug`,
`/api/fixturetest`, `/api/apitest`). Those become part of "main tests" below.

---

## 2. §7 Preservation checklist — how each item is verified

Every row is a feature that MUST survive the additive merge. "Probe" = the concrete
check; "Auto?" = covered by an existing Playwright spec (✅), needs a NEW test (🆕),
or is manual/SQL (🔧).

| # | Preserved feature | Owner | How it will be verified | Auto? |
|---|-------------------|-------|-------------------------|-------|
| 7.1 | Marketplace home + global nav shell | dev | Spec 01 — `/` renders "Verified slips"/"Marketplace", bottom nav (Channels/Rankings/Mine), feed valid, **zero pageerrors** | ✅ 01-home |
| 7.2 | Supabase-Auth tipster signup / login / logout (the **P0 legacy `profile_id` NULL** area) | dev | Spec 02 — signup (unique email) → dashboard → sign out → `/tipster/login` → log back in → dashboard | ✅ 02-tipster-auth |
| 7.3 | Manual/screenshot slip post + auto-`verified` | dev | Spec 03 — slip lands `verification_status='verified'`, shows as `×<odds>`, in `/api/slips` feed | ✅ 03-manual-slip |
| 7.4 | Paywall **proof-only** feed payload (no secret leak) | dev | Spec 03 — feed row has NO `booking_code`/`betting_site`/`legs`; UI "✓ Verified" | ✅ 03-manual-slip |
| 7.5 | Booking-code parse + secret isolation in `betslip_secrets` | dev | Spec 04 — `POST /api/tips` → slip `verification_status='pending'`, `result='pending'`; `booking_code`/`betting_site` stored in **`betslip_secrets`** (not on `betslips`); feed text never contains the code | ✅ 04-coded-slip-paywall |
| 7.6 | Bet-code worker no-op safety (stays `pending` w/o `BET_CODE_WORKER_URL`) | dev | Spec 04 — with worker URL unset, posted coded slip stays `pending` | ✅ 04-coded-slip-paywall |
| 7.7 | ioTec payments (demo) + guest-buyer purchase | dev | Spec 05 — anon guest buys pending slip via PaymentSheet (demo ioTec) → `slip_purchases` row `status='active'` | ✅ 05-guest-purchase |
| 7.8 | Reveal access control (buyer key gate) | dev | Spec 05 — `/api/slips/[id]/reveal` with buyer's `x-buyer-key` → 200; **fresh** guest key → **403** | ✅ 05-guest-purchase |
| 7.9 | Admin role gate + slip hide/moderation | dev→main re-wire | Spec 06 — admin login via `/login`; `/api/admin/me` accepts role; `POST /api/admin/slips {hidden:true}` → `betslips.hidden=true`; gone from feed; still on dashboard tagged "Hidden by admin" | ✅ 06-admin-hide |
| 7.10 | Rankings page shell renders | main (logic) / dev (shell) | Spec 07 — `/rankings` renders "Betfluencer rankings"/"Last 28 days", "Tipster" columnheader, zero pageerrors | ✅ 07-rankings |
| 7.11 | **Both verifiers kept, orthogonal columns** — `verification_status` (worker) AND `result` (football API) coexist on a single slip | merge seam | SQL/manual — confirm a code slip can be `verification_status='verified'` AND independently `result='win'/'loss'`; columns never overwrite each other (`betslips.verification_status` `pending\|verified\|failed\|rejected`; `betslips.result` `pending\|win\|loss`) | 🔧 + 🆕 (see §3) |
| 7.12 | **UNIFIED settlement of code-entered slips** — `main`'s `/api/verify` grades a `posting_mode='booking_code'` slip via `betslip_legs` | merge seam (hard req #2) | New smoke test — worker-scraped legs in `betslip_legs(match "X vs Y", pick, match_time)` → `/api/verify` (POST) → `betslips.result` set; mock the football API | 🆕 (see §3) |
| 7.13 | Football-API settlement for screenshot/manual slips still works | main | `/api/verify` over a manual slip with legs → `result` written; leg `result` cascaded; `result_proof_pending=true` on `unverifiable` | 🆕 / 🔧 (see §3) |
| 7.14 | Migrations are additive & non-destructive; `main` users backfilled into Supabase Auth | merge | SQL — `supabase db reset` applies full set clean; verify `posting_mode` allows superset `manual\|screenshot\|booking_code`; spot-check a backfilled `main` user can log in (extends spec 02) | 🔧 + 🆕 |
| 7.15 | Merged schema columns intact | merge | `global-setup.ts` schema probe + SQL — `profiles.role`; `betslips`(`verification_status`,`result`,`hidden`,`total_odds`,`slip_price`,`posting_mode`,`result_proof_pending`); `betslip_secrets`(`betslip_id`,`booking_code`,`betting_site`); `betslip_legs`(`match`,`pick`,`match_time`,`result`); `slip_purchases`(`betslip_id`,`status`) | 🔧 (setup probe) |
| 7.16 | App builds & lints after merge | merge | `npm run lint` + `next build` (also `E2E_BUILD=1` path of `scripts/e2e.sh`) | 🔧 |

---

## 3. Playwright spec → checklist coverage, and the gaps

### 3.1 What existing specs cover

| Spec | Covers checklist items |
|------|------------------------|
| `01-home.spec.ts` | 7.1 |
| `02-tipster-auth.spec.ts` | 7.2 |
| `03-manual-slip.spec.ts` | 7.3, 7.4 |
| `04-coded-slip-paywall.spec.ts` | 7.5, 7.6 |
| `05-guest-purchase.spec.ts` | 7.7, 7.8 |
| `06-admin-hide.spec.ts` | 7.9 |
| `07-rankings.spec.ts` | 7.10 |

This covers the **input → entry-validation** half: both input methods (screenshot via
03, booking code via 04) reach the **first verifier** (auto-verify for manual; worker
no-op `pending` for coded). It also covers the full revenue path (paywall → purchase →
reveal) and admin moderation.

### 3.2 Coverage GAP — the unified settlement seam (BLOCKING, hard req #2)

**No existing spec exercises `main`'s football-API settlement (`/api/verify`) at all**,
and none drives a code-entered slip *through to* settlement. `dev-tests.md` and
`main-settlement.md` both state this explicitly. The matrix the merge requires is:

| Input method | Verifier 1 (entry: worker / auto) | Verifier 2 (settlement: `/api/verify`) |
|--------------|-----------------------------------|----------------------------------------|
| Screenshot / manual | ✅ spec 03 (auto-verify) | 🆕 **gap** — `08` |
| Booking code | ✅ spec 04 (worker no-op → pending) | 🆕 **gap** — `08` (the unified requirement) |

The bottom-right cell is the **hard requirement**: a `posting_mode='booking_code'` slip
must be gradable by `main`'s verifier. The seam (per `main-settlement.md §11`): the
bet-code worker must write scraped legs into `betslip_legs` with `match = "<Home> vs
<Away>"`, a `pick`, and a `match_time`, because `/api/verify`:
- selects `betslips` where `posting_mode in ('manual','screenshot','booking_code')` AND
  `result='pending'`, joining `betslip_legs(*)` (`main:verify/route.ts:24`);
- **skips slips with no legs** (`verify/route.ts:30`);
- splits `leg.match` on `/\s+vs\.?\s+/i` and resolves a fixture by teams+date
  (`footballApi.ts:117-121`).

So a code slip with mis-shaped or missing legs silently never settles — that is the
exact regression a smoke test must catch.

### 3.3 NEW smoke test required — `tests/e2e/08-unified-settlement.spec.ts`

Add one spec proving **both input methods reach Verifier 2**, with the football API
mocked (the live API-Football provider is rate-limited to 100 req/day and has a -1..+2d
date window — never call it in CI). Suggested assertions:

1. **Code-entered slip settles (7.12, the unified requirement):**
   - Seed (service-role `admin()` helper) a `betslips` row `posting_mode='booking_code'`,
     `verification_status='verified'`, `result='pending'` + matching `betslip_secrets`.
   - Insert `betslip_legs` rows shaped `match="Arsenal vs Chelsea"`, `pick`, `match_time`
     (in the past, beyond the 2h/3h finish guards).
   - Drive `POST /api/verify` with a **mocked** fixture response (final `FT`, known goals)
     so `calcSlipResult` is deterministic.
   - Assert `betslips.result` becomes `win`/`loss`, `betslip_legs.result` cascaded, and
     that `verification_status` is **untouched** (still `verified`) — proves the two
     verifier columns are orthogonal (7.11).
2. **Screenshot/manual slip settles (7.13):** same `/api/verify` run grades a
   `posting_mode='manual'` slip with legs → `result` written.
3. **Unverifiable routing (7.13):** a slip whose legs can't resolve → `result` stays
   `pending` and `result_proof_pending=true`.

**Mocking strategy (decide in step f):** preferred is route-level interception of
`https://v3.football.api-sports.io/fixtures*` (the `x-apisports-key` header call in
`footballApi.ts:13`) via Playwright `page.route` if the verify call is browser-driven,
**or** a server-side fetch stub / fixture fixture-file if `/api/verify` is invoked
server-to-server. Because `/api/verify` POST is **unauthenticated** today
(`verify/route.ts`, cron-only by convention), the spec can hit it directly. Confirm the
merged route keeps it callable in the e2e env (or add a test-only guard bypass).

### 3.4 Secondary gaps (note, lower priority than 3.3)

- **`main`-user auth backfill (7.14):** spec 02 proves a *new* signup logs in; it does
  NOT prove a *backfilled* `main` user logs in. Add a seeded "legacy" auth user (mimicking
  the backfill) to spec 02 or 08 and assert login + correct `profiles.role`/non-NULL
  `profile_id` (directly targets the P0 legacy `profile_id` NULL risk).
- **`'void'` settlement CHECK mismatch:** `main:/api/admin/settle` writes `result='void'`
  but neither branch's CHECK constraint allows it (`main-settlement.md §8`). If the merge
  adds `'void'` to the constraint, add an assertion in `08` (or a SQL check) that
  `admin/settle {result:'void'}` succeeds; otherwise record it as a known-open bug, not a
  test failure.

---

## 4. Commands, services, and secrets

### 4.1 The merged E2E suite (covers 7.1–7.10, and 7.11–7.14 once `08` is added)

```bash
# one-time
npx playwright install chromium
# Docker Desktop must be running; Supabase CLI installed

# full suite (boots Supabase, db reset --no-seed = applies ALL migrations,
# injects env, starts Next dev, runs Playwright, leaves Supabase up)
npm run test:e2e

# single spec / pass-through args
npm run test:e2e -- tests/e2e/04-coded-slip-paywall.spec.ts --headed
npm run test:e2e -- tests/e2e/08-unified-settlement.spec.ts

# production-build path (exercises next build, 7.16)
E2E_BUILD=1 npm run test:e2e

# tear down dockerized Supabase between cold runs
supabase stop
```

**What `scripts/e2e.sh` does (must stay green post-merge):** `supabase start` →
`supabase db reset --no-seed` (applies every `supabase/migrations/*`) → reads local keys
via `supabase status -o env` → forces **ioTec demo mode** → **unsets `BET_CODE_WORKER_URL`**
(worker no-op) → seeds admin → starts Next → readiness-polls `GET /api/slips` → runs
Playwright.

**Target env:** LOCAL dockerized Supabase (`http://localhost:54321`) only — never prod.
The committed prod-targeting `.env` is untouched (script overrides the app process env).

### 4.2 Services required

| Service | Suite role | Live in CI? |
|---------|-----------|-------------|
| Docker Desktop | hosts Supabase (Postgres + PostgREST/GoTrue) | yes |
| Supabase CLI | `supabase start` / `db reset` / `status` | yes |
| Chromium (Playwright) | browser driver | yes |
| Next.js app | `next dev` (or build+start if `E2E_BUILD=1`) | yes |
| ioTec | **demo mode** — no real money, no network | stubbed |
| Bet-code worker (Puppeteer) | **unset** (`BET_CODE_WORKER_URL` cleared) → no-op | NOT run |
| API-Football (`v3.football.api-sports.io`) | for `08` settlement — **MOCK it** | stubbed/mocked |

### 4.3 Secret / env var NAMES (values never printed)

Injected by `scripts/e2e.sh` for the app process (all LOCAL/demo, not prod):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
(local legacy JWTs from `supabase status`), `IOTEC_CLIENT_ID` (=`demo`),
`IOTEC_CLIENT_SECRET` (empty), `IOTEC_WALLET_ID` (empty), `BET_CODE_WORKER_URL` (unset),
`NEXT_PUBLIC_APP_URL`, `E2E_BASE_URL`, `E2E_PORT`, `PORT`, `E2E_BUILD`,
`E2E_ADMIN_EMAIL` (=`admin@e2e.test`), `E2E_ADMIN_PASSWORD`, `CI`.

For the NEW settlement test `08` (Verifier 2): `FOOTBALL_API_KEY` is the live key name
(`footballApi.ts:8`, sent as header `x-apisports-key`) — **do NOT supply a real key in
CI; mock the provider instead.** Optional admin-settle gate: `ADMIN_SETTLE_KEY`.

> No external secrets / no real network needed for the existing suite — ioTec is demo,
> the worker is unset, keys are local JWTs. The suite is self-contained and CI-safe. The
> only addition (`08`) keeps that property by mocking API-Football.

### 4.4 "main tests" (verifier-2, manual — `main` ships no automated tests)

`main` has only unauthenticated debug routes; run them against the merged app pointed at
a DB with seeded legs (LOCAL):

```bash
# read-only dry run of fixture resolution over pending slips with legs
curl -s http://localhost:3000/api/verify-debug

# free-tier date-window + team-search probe (needs FOOTBALL_API_KEY -> use a
# throwaway/sandbox key OUTSIDE CI; rate-limited 100/day)
curl -s http://localhost:3000/api/fixturetest
curl -s http://localhost:3000/api/apitest        # key presence + /status sample

# the actual settlement orchestrator (cron entry point, unauthenticated POST)
curl -s -X POST http://localhost:3000/api/verify
```

These confirm `footballApi.ts` resolution and `/api/verify` writes `betslips.result`
(which fires `tipster_tick_trigger` → `tipster_rankings`, `main-settlement.md §7`).
**`/api/verify-debug|fixturetest|apitest` are unauthenticated and leak pending-slip
internals** — run only locally; flag for prod gating, do not expose during a hosted test.

---

## 5. Pre-flight gates (run before the suite in step f)

```bash
npm run lint                 # 7.16
npx next build               # 7.16 (or rely on E2E_BUILD=1 path)
supabase db reset --no-seed  # 7.14/7.15 — must apply full migration set clean
```

Then confirm the merged schema superset (SQL spot-check; `global-setup.ts` also probes
`profiles`):
- `betslips.posting_mode` CHECK allows `manual | screenshot | booking_code` (the dev
  superset; `main`'s schema lacked `booking_code` though its verify route filters it —
  `main-settlement.md §11/§12`).
- Columns from 7.15 all exist.
- (If void settlement is in-scope) `betslips.result` / `betslip_legs.result` CHECK
  allows `void`.

---

## 6. Execution order for step f

1. Pre-flight gates (§5) — lint, build, `db reset`, schema superset SQL check.
2. `npm run test:e2e` — full existing suite (7.1–7.10).
3. Add + run `tests/e2e/08-unified-settlement.spec.ts` (7.11–7.13, the unified seam).
4. Extend spec 02/08 with a seeded backfilled `main` user (7.14, P0 `profile_id`).
5. Manual main-verifier checks (§4.4) against LOCAL DB with seeded legs.
6. `E2E_BUILD=1 npm run test:e2e` once (production-build path, 7.16).
7. Fill in §7.

---

## 7. Results: PENDING (pre-merge)

> To be completed after step f. Record: branch/commit under test, date, machine, and
> per-row pass/fail.

| Item | Probe | Result | Notes |
|------|-------|--------|-------|
| 7.1 Home + nav | spec 01-home | PENDING | |
| 7.2 Tipster auth (P0) | spec 02-tipster-auth | PENDING | |
| 7.3 Manual auto-verify | spec 03-manual-slip | PENDING | |
| 7.4 Paywall proof-only feed | spec 03-manual-slip | PENDING | |
| 7.5 Code parse + secret isolation | spec 04-coded-slip-paywall | PENDING | |
| 7.6 Worker no-op pending | spec 04-coded-slip-paywall | PENDING | |
| 7.7 ioTec demo + guest purchase | spec 05-guest-purchase | PENDING | |
| 7.8 Reveal access control | spec 05-guest-purchase | PENDING | |
| 7.9 Admin role + hide | spec 06-admin-hide | PENDING | |
| 7.10 Rankings shell | spec 07-rankings | PENDING | |
| 7.11 Two verifiers orthogonal | spec 08 (new) + SQL | PENDING | |
| 7.12 Unified code-slip settlement | spec 08 (new) | PENDING | hard req #2 |
| 7.13 Football-API settles manual + unverifiable routing | spec 08 (new) / §4.4 | PENDING | |
| 7.14 Additive migrations + auth backfill login | `db reset` + seeded legacy user | PENDING | P0 `profile_id` |
| 7.15 Schema superset columns | `global-setup` probe + SQL | PENDING | |
| 7.16 Build + lint | `npm run lint` / `next build` / `E2E_BUILD=1` | PENDING | |

**Suite-level:** `npm run test:e2e` exit — PENDING. `E2E_BUILD=1` run — PENDING.
Main-verifier manual checks (§4.4) — PENDING.

### Known-open items to distinguish from regressions (per analysis)
- UI copy-drift: specs 01/03/05/06/07 assert literal dev/payments copy ("Verified slips",
  "Marketplace", "Unlock slip", "Pay UGX", "Hidden by admin", "Betfluencer rankings",
  "Last 28 days", "Tipster" header, placeholders `e.g. 1500`/`e.g. 12.40`/`e.g. 4`). If
  `main`'s UI copy wins the merge, red here = selector update needed, **not** a lost
  feature (`dev-tests.md` merge guidance).
- `'void'` settlement: `admin/settle` writes `void` but no CHECK constraint allows it on
  either branch — open bug unless the merge adds it (`main-settlement.md §8`).
- Latent dead path: `fixture_id` fixture resolution has no backing column — optional
  high-value enhancement, not a regression.

---

## RESULTS (step e — as run)

### Static
- **`tsc --noEmit`: PASS (0 errors)** on the full merged tree, after one fix
  (`tipster/dashboard` imported `supabaseBrowser` from the wrong module).
- **Conflict markers:** none remain in `src/` or `supabase/` (grep-verified).
- **Migration idempotency/safety:** adversarially reviewed — no unguarded
  `create table/index/policy`, no `drop table/column/truncate`; one BLOCKER
  (view create-or-replace) and one MEDIUM (transactions RLS) fixed.

### Pending (needs DB + running services — gated on main-DB credentials)
| Check | Status | Needs |
|---|---|---|
| `next build` (full route compile) | not run | clean env; low risk (tsc clean) |
| `npm run test:e2e` (Playwright) | not run | local Supabase w/ migrations + worker + ioTec/football keys |
| Apply migrations `20260626*` | not applied | main-DB creds; Supabase Auth enabled; `tipster_stats` dump; backfill inputs |
| Both inputs → both verifiers (live) | not run | DB + bet-code worker + football API key |
| Paywall secret-isolation (specs 03/04) | not run | DB + ioTec sandbox |

### §7 preservation checklist — static confidence
- [x] Ranking page (main) — merged, reads `tipster_stats`
- [x] Screenshot input (main) — `parse-slip` + `ImageUpload` came in clean
- [x] Booking-code input (dev) — `verifyCode` + worker untouched, additive
- [x] Channels (main) — integrated, seed-hide preserved
- [x] Bet worker entry-validation (dev) — untouched
- [x] Football-API settlement (main) — `verify/route` + `footballApi` clean; **now also
      grades code slips** via the `betslip_legs` projection seam
- [x] Common match/leg model — `betslip_legs`, fed by both inputs
- [x] ioTec payments (dev) — untouched, additive
- [x] Admin: both main settlement Review tab + dev Slips/Verify/Txns — integrated
- [x] Admin + app under dev Supabase Auth only — re-guarded
- [~] Runs on main's DB extended w/ dev objects — migrations authored, **not applied**
- [~] dev e2e suite passes — **not run** (needs services)

(`[x]` = done + statically validated; `[~]` = built, runtime/DB validation pending.)
