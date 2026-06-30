# dev/payments — Authoritative Stack & Infrastructure

Canonical stack reference for `dev-payments-memory.md`. Source of truth is branch `dev/payments` (working tree `stag`). All paths absolute to repo root `/Users/paulk/work/abc solutions`. Snapshot: 2026-06-25.

> Provenance note: `docs/ARCHITECTURE.md` is a 2026-06-12 snapshot and predates the auth/paywall overhaul — several of its statements (no Supabase Auth, RLS `using(true)`, `entitlement.ts`, `api/subscribe`, 4 migrations) are STALE. `CLAUDE.md` (2026-06-25) + `TODO.md` are current. Where they conflict, CLAUDE.md/migrations win. Conflicts called out inline below.

---

## 1. Runtimes & language stack

| Layer | Version / detail | Evidence |
|---|---|---|
| Framework | **Next.js 14.2.3**, App Router | `package.json:24` (`"next": "14.2.3"`), `CLAUDE.md:11` |
| UI | **React 18** + **React-DOM 18** | `package.json:25-26` |
| Language | **TypeScript ^5** | `package.json:39`, `tsconfig.json` |
| Styling | **Tailwind ^3.4.1** + PostCSS + autoprefixer; inline styles + CSS vars in `globals.css` | `package.json:37-38`, `tailwind.config.js`, `postcss.config.js`, `CLAUDE.md:11` |
| Validation | **zod ^3.23.8** (`safeParse` on API input) | `package.json:27`, `CLAUDE.md:45` |
| Icons / dates | lucide-react ^0.383.0, date-fns ^3.6.0 | `package.json:22-23` |
| Web app Node runtime | **Node 24** (`node:24-bookworm-slim` in all Docker stages) | `Dockerfile:7,12,25` |
| Worker Node runtime | **Node ≥24** (`engines.node ">=24"`) | `bet-code-worker/package.json` |
| Build output | **Next `output: 'standalone'`** (self-contained `.next/standalone/server.js` for Docker) | `next.config.js:4`, `CLAUDE.md:65` |

Note: the root `package.json` has **no `engines` pin** — Node 24 is enforced only by the Docker base image, not by npm. `@types/node` is `^20` (type defs lag the runtime).

### Web dependencies (root `package.json`)
- Runtime: `@anthropic-ai/sdk ^0.102.0`, `@supabase/ssr ^0.5.2`, `@supabase/supabase-js ^2.43.1`, `date-fns`, `lucide-react`, `next`, `react`, `react-dom`, `zod`.
- Dev: `@playwright/test ^1.61.1`, `@types/*`, `autoprefixer`, `eslint ^8` + `eslint-config-next 14.2.3`, `postcss`, `tailwindcss`, `typescript`.
- Note (provenance): `@supabase/ssr` was pruned in the 2026-06-10 cleanup (`IMPROVEMENTS.md:119`) then **re-added** for the auth overhaul (Supabase Auth uses it). It is present in `dev/payments` now.

### Worker dependencies (`bet-code-worker/package.json`)
- `"type": "module"` (ESM). Deps: **express ^4.19.2** + **puppeteer-core ^23.10.4** only. No bundled Chromium — uses Debian's `/usr/bin/chromium` via `PUPPETEER_SKIP_DOWNLOAD=true` / `PUPPETEER_EXECUTABLE_PATH`.

---

## 2. Service topology — 3 services

All from root `docker-compose.yml` (dev) / `docker-compose.prod.yml` (prod). Confirmed in `docs/ARCHITECTURE.md` §2 and `CLAUDE.md:65`.

| Service | Image / build | Port | Role |
|---|---|---|---|
| **web** | root `Dockerfile` (Next standalone, `node:24-bookworm-slim`) | **3000** (published dev; **NOT published** prod — behind reverse proxy) | The Next.js app: public/tipster/admin pages + API routes. Holds Supabase **service-role** key + ioTec creds. |
| **bet-code-worker** | `bet-code-worker/Dockerfile` (`node:24` + Debian chromium) | **8080** (internal only / `expose` in prod) | Stateless Puppeteer scraper. `POST /verify {betting_site, booking_code}` → loads code on bookie → `matches[]` + `raw_text` + `found` + `screenshot_url`. `GET /health`. |
| **sync** | `curlimages/curl:8.10.1` | — (no port) | curl loop, every `SYNC_INTERVAL`s (default 300): `POST /api/slips/sync-codes` **and** `POST /api/payments/reconcile`, both with `x-sync-token`. |

Data flow: browser → **web**; web → **Supabase** (Postgres, service role) / **ioTec** (HTTPS) / **worker** (`http://bet-code-worker:8080`, internal); **sync** → web (`http://web:3000`). Worker is private behind `WORKER_API_KEY`; never published. Screenshots persist in named volume `screenshots:/app/screenshots`, served by worker at `/shots/<file>`.

`sync` waits on web's `healthcheck` (`service_healthy`, probes `/api/health`) instead of a fixed sleep. `/api/health` (`src/app/api/health/route.ts`) is a no-DB liveness probe returning `{ok:true}`, `force-dynamic`.

---

## 3. Deployment targets

**Two targets documented; Docker is the real one.**

- **Docker (canonical for prod).** Full stack via Docker Compose. Hosting target named as **Hetzner + Coolify** (or Railway/Fly/Traefik). Reverse proxy fronts `web` (not published in prod). `docs/ARCHITECTURE.md:134`: "Hosting target: Docker (Hetzner + Coolify / Railway). `vercel.json` is legacy — Vercel can't run the worker."
  - Dev: `docker compose up --build` → web :3000 + worker :8080 + sync. Bind-mounted source, hot reload (`next dev`, worker `node --watch`).
  - Prod: `docker compose -f docker-compose.prod.yml up --build -d`. Built standalone images, no source mounts, web behind proxy.

- **Vercel (legacy / partial).** `vercel.json` configures `framework: nextjs`, region `bom1` (Mumbai), and a **cron** `POST /api/verify` daily `0 2 * * *` (result auto-verification). Vercel **cannot run the worker** (no headless Chrome), so it can only host `web`. `CLAUDE.md:17` flags: brain plan was Hetzner + Coolify — confirm target before deploy. Treat `vercel.json` as legacy but note the cron schedule still encodes the intended `/api/verify` cadence.

---

## 4. Supabase usage (CURRENT — overhaul shipped)

**Supabase = Postgres + Supabase Auth.** This is the biggest divergence from the stale `ARCHITECTURE.md` (which says "Postgres only, no Auth, RLS `using(true)`").

- **Postgres** accessed server-side via service-role client `supabaseServer()` (`src/lib/supabase.ts`) — bypasses RLS, pins `cache:'no-store'` (stale-feed fix), reads `NEXT_PUBLIC_SUPABASE_URL` from env (hardcoded URL bug fixed).
- **Supabase Auth** (email+password via `@supabase/ssr`) for **tipsters + admins**. Per-user session client `supabaseSession()` (`src/lib/supabase/server.ts`, reads cookies, enforces RLS as the user). `src/middleware.ts` refreshes the session each request. Helpers in `src/lib/auth/session.ts`; admin gate = `requireRole('admin')` (the forgeable `base64("admin:")` token is RETIRED).
- **Buyers do NOT log in** — anonymous localStorage guest key (`src/lib/guestId.ts` → `x-buyer-key` header / `?buyer=`); buyer purchases keyed by `buyer_key`. (`CLAUDE.md:12,79`.)
- **RLS is hardened** (migrations 0003 + 0005): anon reads only verified/finished slips; pending codes, purchases, financials, `betslip_secrets`, `tipsters` are service-role-only. Never reintroduce `using(true)` (`CLAUDE.md:78`).

### Migrations — source of truth = `supabase/migrations/` (11 files)
CLI: `supabase/config.toml` + migrations. Scripts in `package.json`: `db:new`, `db:push` (alias `migrate`), `db:reset`, `db:diff`, `db:link`. `src/lib/schema.sql` + `src/lib/rls.sql` kept as full-schema reference mirror.

```
20260610000001_init.sql                  baseline (tables, auto-tick trigger, tipster_rankings view, seed)
20260610000002_transactions.sql          ioTec ledger table + updated_at trigger + RLS
20260610000003_lock_pending_content.sql  RLS lockdown (anon = finished only)
20260610000004_slip_verifications.sql    worker results table
20260611075122_test.sql                  (test migration)
20260612120000_auth_paywall_overhaul.sql 0005 — Supabase Auth, profiles+role, betslip_secrets,
                                          verification_status + proof cols, slip_purchases.buyer_id, commission_rate
20260622120000_normalized_verification.sql  normalized / summary / total_odds on slip_verifications
20260622130000_admin_hide_flag.sql       betslips.hidden
20260623090000_fix_slip_purchases_buyer.sql
20260623100000_guest_buyer_key.sql       slip_purchases.buyer_key (guest buyers)
20260625120000_skip_verified_sync.sql    0010 — skip-verified sync + verify_attempts + record_failed_verify RPC
```
The doc shorthand "0001–0010" maps the four `0001…0004` files then counts the five dated overhaul migrations as 0005–0010 (`20260611075122_test` is the odd one out). **Live-DB state:** 0001 applied; **0002–0010 must be applied** to the live DB (`CLAUDE.md:31`, `TODO.md`). Until 0010 lands, `sync-codes` + `record_failed_verify` RPC error out and sync silently no-ops.

> `supabase/README.md` only documents 0001–0003 — it is STALE (predates 0004–0010). Use `CLAUDE.md` + the directory listing.

### Tables (current)
`profiles` (role: user|tipster|admin), `tipsters`, `betslips` (+`verification_status`, `hidden`, `verify_attempts`, proof cols, `booking_code`, `betting_site`, `total_odds`, `result`, `slip_price`, `posting_mode`), `betslip_legs`, **`betslip_secrets`** (code/site/screenshot — service-role only), `slip_purchases` (`buyer_key` for guests, `buyer_id` for accounts, `status` pending→active), `slip_verifications` (+`normalized`/`summary`/`total_odds`, `matches` jsonb, unique on `betslip_id`), `transactions` (ioTec ledger), `payments` (legacy, `flw_ref`), `earnings`, `platform_settings`. View: `tipster_rankings`.

**Gotcha:** `betslips` / `betslip_legs` / `slip_purchases` have **no `created_at`** — selecting/ordering by it silently empties the feed (`CLAUDE.md:35`).

---

## 5. External services

| Service | Use | Lib / entrypoint | Env |
|---|---|---|---|
| **ioTec Pay** | Mobile Money (MTN + Airtel UG) + Card, collections + disbursements. OAuth2 client-credentials at `id.iotec.io/connect/token` → Bearer. **Demo mode** when `IOTEC_CLIENT_ID` empty/`demo` (no real charges, polling resolves success). | `src/lib/iotec.ts` (client), `src/lib/payments.ts` (re-export), `src/lib/transactions.ts`, `src/lib/fulfillment.ts` | `IOTEC_BASE_URL`, `IOTEC_CLIENT_ID`, `IOTEC_CLIENT_SECRET`, `IOTEC_WALLET_ID`, `IOTEC_AUTH_URL`, `IOTEC_WEBHOOK_SECRET`, `PLATFORM_COMMISSION` (default 0.10) |
| **Anthropic (Claude Vision)** | Betslip screenshot → structured legs | `@anthropic-ai/sdk`, `api/parse-slip` | `ANTHROPIC_API_KEY` |
| **api-football** | Auto-verify finished match results | `src/lib/footballApi.ts`, `api/verify` (cron `0 2 * * *`) | api-football key |
| **Google Gemini** | Worker-side normalisation of scraped bookie response | bet-code-worker (env `GEMINI_API_KEY`, `GEMINI_MODEL` default `gemini-3.1-flash-lite`) | `GEMINI_API_KEY`, `GEMINI_MODEL`. Unset `GEMINI_API_KEY` to disable. |
| **Africa's Talking** | SMS — **configured but stubbed** (`sendSMS` only logs) | — | `AT_*` in `.env` |

> Provenance: `ARCHITECTURE.md` §3 omits Gemini (it lists only Supabase/ioTec/Anthropic/api-football/AT). Gemini is real and current — it lives in the worker (`docker-compose*.yml`, `CLAUDE.md:70`).

---

## 6. Money & domain conventions

- Money is **integer UGX** everywhere (no decimals). `CLAUDE.md:48`, `ARCHITECTURE.md:56`.
- Phone normalised to `+256XXXXXXXXX` (`normalisePhone`).
- Commission = `PLATFORM_COMMISSION` env, default **0.10** (platform 10% / tipster 90%); global default + per-tipster `commission_rate` override; instant payout per sale. No funds held.

---

## 7. Build / infra gotchas (carry forward)

1. **Docker SWC clash (dev).** `node_modules` + `.next` live in NAMED volumes, not host mounts — keeps container's own linux SWC binary, avoids macOS↔linux clash. If `web` boot-loops (prints "✓ Starting…" then exits 0 repeatedly, SIGBUS on SWC load), the volume holds a stale/incompatible native SWC binary; `npm install` thinks it's "up to date" and never replaces it. Fix: `docker compose down -v && docker compose up`. Do this on any base-image or host-arch change. (`docker-compose.yml:12-18`.)
2. **`force-dynamic` on DB API routes.** Any API route hitting the DB MUST `export const dynamic = 'force-dynamic'` — else `next build` prerenders it, `supabaseServer()` runs with no service key (secrets aren't build args) → "supabaseKey is required" → Docker build fails. Applied to `api/slips`, `api/tipster` (`CLAUDE.md:50`).
3. **`NEXT_PUBLIC_*` are build args; server secrets are runtime env.** `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`APP_URL` inlined at build → passed as Docker build args (`docker-compose.prod.yml:21-25`, `Dockerfile:16-22`). Service-role key, ioTec, worker url/key are runtime env (`env_file: .env`).
4. **Port pinning.** `web` pins `PORT=3000` in compose `environment` to override any `PORT` leaking in via `env_file: .env` (worker uses 8080). Don't put a shared `PORT` in `.env`. (`CLAUDE.md:51`, both compose files.)
5. **Stale-feed cache trap (keep the fix).** Next persists supabase-js GET responses to `.next/cache` → stale/empty feeds despite `force-dynamic`. Fixed: `supabaseServer()` uses `cache:'no-store'`; `/api/slips` sends `Cache-Control: no-store`. Don't remove. (`CLAUDE.md:76`.)
6. **`.dockerignore`** excludes `node_modules`, `.next`, `.git`, `.env*` (keeps `.env.local.example`), `bet-code-worker`, `supabase`, `docs`, `*.md`, `screenshots`, `.vercel` from the web image. Note: `.dockerignore` does NOT apply to bind mounts, so dev compose separately masks `.git`/`bet-code-worker`/`screenshots`/`docs` as anonymous volumes to keep hot-reload fast on Apple Silicon.
7. **Worker runs Chrome `--no-sandbox`**, one shared browser capped at `MAX_CONCURRENT` (default 2). Runs as non-root `app` user; screenshots dir pre-chowned for mounted-volume writes. Scale = more replicas behind a load balancer.
8. **Worker IP geo-block.** Bookie scrapers are blocked from datacenter/cloud IPs → prod sets `SYNC_CODES_ENABLED=false`; the worker + code-sync must run from a **local/residential IP**. Payment `reconcile` is unaffected. (`CLAUDE.md:70`, `docker-compose.prod.yml:42`.)

---

## 8. Env var inventory (names only)

**Web (runtime + build):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IOTEC_BASE_URL`, `IOTEC_CLIENT_ID`, `IOTEC_CLIENT_SECRET`, `IOTEC_WALLET_ID`, `IOTEC_AUTH_URL`, `IOTEC_WEBHOOK_SECRET`, `PLATFORM_COMMISSION`, `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`, `BET_CODE_WORKER_URL`, `BET_CODE_WORKER_KEY`, `SYNC_TOKEN`, `SYNC_BATCH`, `SYNC_INTERVAL`, `SYNC_MAX_FAILED_RETRIES`, `SYNC_CODES_ENABLED`, `AT_*` (Africa's Talking), api-football key.

**Worker:** `WORKER_API_KEY` (= web's `BET_CODE_WORKER_KEY`), `PORT` (8080), `MAX_CONCURRENT`, `NAV_TIMEOUT_MS`, `SCREENSHOT_DIR`, `SCREENSHOT_TTL_HOURS`, `PUBLIC_BASE_URL`, `PUPPETEER_EXECUTABLE_PATH`, `PUPPETEER_SKIP_DOWNLOAD`, `GEMINI_API_KEY`, `GEMINI_MODEL`.

Shared secrets across services: `BET_CODE_WORKER_KEY` (= worker `WORKER_API_KEY`), `SYNC_TOKEN`. Env reference files: `.env.local.example` (web), `bet-code-worker/.env.example` (worker). `.env` is the source of truth for live keys.

---

## 9. Commands & test/merge gate

```bash
npm run dev       # next dev → http://localhost:3000
npm run build     # production build (next build, standalone output)
npm run start     # serve build
npm run lint      # next lint (eslint)
npm run test:e2e  # Playwright e2e MERGE GATE — bash scripts/e2e.sh
npm run db:push   # supabase db push (alias: migrate); db:new / db:reset / db:diff / db:link
```

**Playwright e2e is the merge gate** (`playwright.config.ts`, `scripts/e2e.sh`, `tests/e2e/`). Boots LOCAL Supabase (`http://localhost:54321`) + ioTec DEMO mode; `scripts/e2e.sh` exports keys + starts the app (no `webServer` in config — attaches to `E2E_BASE_URL`, default `:3000`, `reuseExistingServer`). Serial (`workers:1`, `fullyParallel:false`) — feed is a shared global surface. `globalSetup` applies schema + promotes test admin. Chromium project only; prereq `npx playwright install chromium`. 7 specs: home, tipster signup/login, manual-slip→verified+proof-only, coded-slip→pending+secret-hidden, guest purchase (demo)→reveal entitlement, admin hide, rankings. Suite is green as of 2026-06-25.

---

## 10. Key flows (owning libs, for stack cross-ref)

- **Payments (ioTec, per-slip):** `BuySlipButton`/`usePayment` → `<PaymentSheet>` → `POST /api/payments/initiate` (insert pending `transactions` + `slip_purchases`, ioTec collect) → confirm via `POST /api/webhooks/iotec` (verify `x-iotec-callback-token` + refetch status, never trusts payload) or `GET /api/payments/status` poll → `fulfillTransaction` (`src/lib/fulfillment.ts`): mark purchase active + disburse 90% to **tipster's** phone + `logEarning`, idempotent. Card returns to `/pay/return`. Reconcile sweep: `POST /api/payments/reconcile` (sync loop). Libs: `src/lib/iotec.ts`, `transactions.ts`, `fulfillment.ts`.
- **Booking-code verify + sync:** post/update coded slip → `POST /api/tips` → `verifyAndRecord` (`src/lib/verifyCode.ts`) → `callWorker` → `BET_CODE_WORKER_URL` → upsert `slip_verifications`. `sync` polls `POST /api/slips/sync-codes` (`x-sync-token`). Manual admin path: `POST /api/slips/verify-code`. Adapters: `bet-code-worker/src/adapters.js` (1xBet/22Bet/betPawa/SportPesa/MozzartBet HTML-confirmed; SportyBet/Betway unverified).
- **Paywall reveal:** gated `GET /api/slips/[id]/reveal` checks active purchase → returns `betslip_secrets` (code+site or screenshot) + legs + matches; else proof only. (`entitlement.ts` was DELETED in Phase 7 — `ARCHITECTURE.md` references to it are stale.)
- **Result auto-verify:** `POST /api/verify` (Vercel cron `0 2 * * *`) → api-football → updates `betslip_legs`/`betslips.result`; DB auto-tick trigger updates tipster `verified`/`tick_type`.

---

## 11. Known infra/state landmines (for the merge)

- **🔴 P0 tipster login broken for legacy tipsters.** Existing `tipsters` rows have `profile_id = NULL` + old `password_hash`, never migrated to Supabase Auth → `getMyTipster()` (matches `tipsters.profile_id == auth.uid`) returns null → `/api/tipster/me` 401 → dashboard redirect loop. New signups via `/api/tipster/register` (set `profile_id`) work. Fix not built: link-on-signup + backfill. (`CLAUDE.md:75`, `TODO.md`.)
- **Redis-queue rearchitecture was built then REVERTED** — current model is the direct worker call. Do NOT reintroduce Redis without the user re-asking. (`CLAUDE.md:69`.)
- **Migrations 0002–0010 not yet applied to the live DB.**
- **Legacy `payments` table + `flw_ref`** superseded by `transactions` — leave or drop later.
- Buyer identity is an unauthenticated guest key (`x-buyer-key`/`?buyer=`) — acceptable for the no-login guest model; full strength = buyer OTP.
