# `dev/payments` — Branch Memory (the merge base)

> **What this document is.** The consolidated, authoritative reference for how the
> `dev/payments` branch works — the *base* of the `main → stag` merge (working tree
> `stag` is `==` `dev/payments`). Audience: senior engineers performing the additive,
> non-destructive merge. Source of truth is the `dev/payments` working tree; `main` is
> cited only where it diverges. Snapshot: 2026-06-25.
>
> **Merge stance recap (fixed by the owners).** (1) Additive, non-destructive migrations
> only — `main`'s DB holds real data. (2) Settlement is unified — code-entered slips must
> stay settle-able by `main`'s football-API verifier through the common match/leg model.
> (3) `dev/payments`' Supabase Auth is the *only* auth; `main`'s admin re-wires onto it.
> (4) Keep **both** input methods (screenshot + booking code) and **both** verifiers
> (bet-worker entry-validation + football-API settlement). Never drop a feature to dodge a
> conflict.
>
> **Provenance caveat.** `docs/ARCHITECTURE.md` (2026-06-12) and `supabase/README.md`
> predate the auth/paywall overhaul and are STALE (they describe "no Supabase Auth", RLS
> `using(true)`, `entitlement.ts`, `/api/subscribe` POST, only migrations 0001–0003).
> `CLAUDE.md` (2026-06-25) + `TODO.md` + the migration files are current. Where docs
> conflict with code/migrations, **code/migrations win.**

---

## 1. Authoritative stack & infrastructure

### 1.1 Runtimes & language

| Layer | Version / detail | Evidence |
|---|---|---|
| Framework | **Next.js 14.2.3**, App Router | `package.json` (`"next":"14.2.3"`), `CLAUDE.md` |
| UI | **React 18** + React-DOM 18 | `package.json` |
| Language | **TypeScript ^5** | `package.json`, `tsconfig.json` |
| Styling | **Tailwind ^3.4.1** + PostCSS + autoprefixer; CSS vars in `globals.css` | `tailwind.config.js`, `postcss.config.js` |
| Validation | **zod ^3.23.8** (`safeParse` on every API input) | `package.json`, `CLAUDE.md` |
| Web Node runtime | **Node 24** (`node:24-bookworm-slim` in all Docker stages) | `Dockerfile` |
| Worker Node runtime | **Node ≥24** (`engines.node ">=24"`) | `bet-code-worker/package.json` |
| Build output | **Next `output:'standalone'`** (`.next/standalone/server.js`) | `next.config.js`, `CLAUDE.md` |

- Root `package.json` has **no `engines` pin** — Node 24 is enforced only by the Docker
  base image. `@types/node` is `^20` (type defs lag the runtime).
- **Web deps:** `@anthropic-ai/sdk ^0.102.0`, `@supabase/ssr ^0.5.2`,
  `@supabase/supabase-js ^2.43.1`, `date-fns`, `lucide-react`, `next`, `react`,
  `react-dom`, `zod`. Dev: `@playwright/test ^1.61.1`, eslint `^8` + `eslint-config-next
  14.2.3`, tailwind/postcss/autoprefixer, typescript.
- `@supabase/ssr` was pruned in the 2026-06-10 cleanup then **re-added** for the auth
  overhaul — it is present now.
- **Worker deps (`bet-code-worker/package.json`):** `"type":"module"` (ESM); only
  **express ^4.19.2** + **puppeteer-core ^23.10.4**. No bundled Chromium — uses Debian's
  `/usr/bin/chromium` (`PUPPETEER_SKIP_DOWNLOAD=true`, `PUPPETEER_EXECUTABLE_PATH`).

### 1.2 Service topology — 3 services

From root `docker-compose.yml` (dev) / `docker-compose.prod.yml` (prod):

| Service | Image / build | Port | Role |
|---|---|---|---|
| **web** | root `Dockerfile` (Next standalone, `node:24-bookworm-slim`) | **3000** (published dev; **NOT published** prod — behind reverse proxy) | The Next.js app: public/tipster/admin pages + all API routes. Holds Supabase **service-role** key + ioTec creds. |
| **bet-code-worker** | `bet-code-worker/Dockerfile` (`node:24` + Debian chromium) | **8080** (internal `expose` only) | Stateless Puppeteer scraper. `POST /verify {betting_site, booking_code}` → `matches[]`+`raw_text`+`found`+`screenshot_url`. `GET /health`. |
| **sync** | `curlimages/curl:8.10.1` | — | curl loop every `SYNC_INTERVAL`s (default 300): `POST /api/slips/sync-codes` **and** `POST /api/payments/reconcile`, both with `x-sync-token`. |

**Data flow:** browser → **web**; web → **Supabase** (Postgres, service role) / **ioTec**
(HTTPS) / **worker** (`http://bet-code-worker:8080`, internal, behind
`BET_CODE_WORKER_KEY`); **sync** → web (`http://web:3000`). `sync` waits on web's
healthcheck (`service_healthy`, probes `/api/health` — a no-DB `force-dynamic` liveness
route returning `{ok:true}`). Worker screenshots persist in named volume
`screenshots:/app/screenshots`, served at `/shots/<file>`.

### 1.3 Deployment targets

Two documented; **Docker is the real one.**

- **Docker (canonical for prod).** Full stack via Compose. Hosting target named
  **Hetzner + Coolify** (or Railway/Fly/Traefik). Reverse proxy fronts `web` (not
  published in prod).
  - Dev: `docker compose up --build` → web :3000 + worker :8080 + sync; bind-mounted
    source, hot reload (`next dev`, worker `node --watch`).
  - Prod: `docker compose -f docker-compose.prod.yml up --build -d`; standalone images,
    no source mounts, web behind proxy.
- **Vercel (legacy / partial).** `vercel.json`: `framework:nextjs`, region `bom1`
  (Mumbai), and a **cron** `POST /api/verify` daily `0 2 * * *` (football-API
  result auto-verification). **Vercel cannot run the worker** (no headless Chrome) — it
  can only host `web`. Treat `vercel.json` as legacy, but the cron schedule still encodes
  the intended `/api/verify` cadence.

### 1.4 Build / infra gotchas (carry forward)

1. **Docker SWC clash (dev).** `node_modules` + `.next` live in NAMED volumes (not host
   mounts) to keep the container's linux SWC binary. If `web` boot-loops (prints
   "✓ Starting…" then exits 0, SIGBUS on SWC load) the volume holds a stale native
   binary; `npm install` thinks it's up to date. **Fix: `docker compose down -v && docker
   compose up`.** Do this on any base-image / host-arch change.
2. **`force-dynamic` on DB API routes.** Any route hitting the DB MUST
   `export const dynamic = 'force-dynamic'` — else `next build` prerenders it,
   `supabaseServer()` runs with no service key → "supabaseKey is required" → Docker build
   fails.
3. **`NEXT_PUBLIC_*` are build args; server secrets are runtime env.**
   `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY`/`NEXT_PUBLIC_APP_URL` are inlined at build →
   passed as Docker build args. Service-role key, ioTec, worker url/key are runtime
   `env_file:.env`.
4. **Port pinning.** `web` pins `PORT=3000` in compose `environment` to override any
   `PORT` leaking from `env_file:.env` (worker uses 8080). Don't put a shared `PORT` in
   `.env`.
5. **Stale-feed cache trap (keep the fix).** Next persists supabase-js GET responses to
   `.next/cache` → stale/empty feeds despite `force-dynamic`. Fix: `supabaseServer()` uses
   `cache:'no-store'`; `/api/slips` sends `Cache-Control:no-store`. Don't remove.
6. **`.dockerignore`** excludes `node_modules`, `.next`, `.git`, `.env*`,
   `bet-code-worker`, `supabase`, `docs`, `*.md`, `screenshots`, `.vercel` from the web
   image. (Does not apply to bind mounts — dev compose separately masks those dirs as
   anonymous volumes for fast hot-reload on Apple Silicon.)
7. **Worker runs Chrome `--no-sandbox`**, one shared browser capped at `MAX_CONCURRENT`
   (default 2), as non-root `app` user. Scale = more replicas behind a load balancer.
8. **Worker IP geo-block.** Bookie scrapers are blocked from datacenter/cloud IPs → prod
   sets `SYNC_CODES_ENABLED=false`; the worker + code-sync must run from a
   **local/residential IP**. Payment `reconcile` is unaffected.

### 1.5 Commands & the merge gate

```bash
npm run dev       # next dev → http://localhost:3000
npm run build     # production build (standalone output)
npm run start     # serve build
npm run lint      # next lint (eslint)
npm run test:e2e  # Playwright e2e MERGE GATE — bash scripts/e2e.sh
npm run db:push   # supabase db push (alias: migrate); also db:new / db:reset / db:diff / db:link
```

### 1.6 Money & domain conventions

- Money is **integer UGX** everywhere (no decimals).
- Phone normalised to `+256XXXXXXXXX` via `normalisePhone()` (`src/lib/auth.ts`, one of
  the few still-live exports there).
- Commission = `PLATFORM_COMMISSION` env, default **0.10** (platform 10% / tipster 90%).
  Resolution order in `fulfillment.ts`: tipster `commission_rate` override →
  `platform_settings.platform_commission` → `process.env.PLATFORM_COMMISSION` → `'0.10'`.
  Instant payout per sale; no funds held.

---

## 2. External services

| Service | Use | Lib / entrypoint | Env (NAMES ONLY) |
|---|---|---|---|
| **ioTec Pay** | Mobile Money (MTN+Airtel UG) + Card; collections + disbursements. OAuth2 client-credentials. **Demo mode** when `IOTEC_CLIENT_ID` empty/`demo`. | `src/lib/iotec.ts`, `src/lib/payments.ts` (barrel), `transactions.ts`, `fulfillment.ts` | `IOTEC_BASE_URL`, `IOTEC_CLIENT_ID`, `IOTEC_CLIENT_SECRET`, `IOTEC_WALLET_ID`, `IOTEC_AUTH_URL`, `IOTEC_WEBHOOK_SECRET`, **`IOTEC_CURRECY`** (sic — misspelled), `PLATFORM_COMMISSION`, `RECONCILE_BATCH` |
| **Anthropic (Claude Vision)** | Betslip screenshot → structured legs | `@anthropic-ai/sdk`, `api/parse-slip` | `ANTHROPIC_API_KEY` |
| **api-football** | Auto-verify finished match results (**main's settlement domain**) | `src/lib/footballApi.ts`, `api/verify` (cron `0 2 * * *`) | api-football key |
| **Google Gemini** | Worker-side normalisation of scraped bookie output | `bet-code-worker/src/normalize.js` | `GEMINI_API_KEY` (enable), `GEMINI_MODEL` (default `gemini-3.1-flash-lite`), `GEMINI_BASE_URL`, `GEMINI_TIMEOUT_MS` |
| **Africa's Talking** | SMS — **configured but stubbed** (`sendSMS` only `console.log`s) | — | `AT_*` |

> Gemini is omitted from `ARCHITECTURE.md` §3 but is real and current — it lives in the
> worker. AT was dropped on `dev/payments` (`types/africastalking.d.ts` deleted) and the
> SMS path is a stub.

---

## 3. ioTec live-payments flow (dev/payments OWNS the entire payments stack)

`main` has **no** ioTec code — it still carries the OLD Flutterwave + Africa's Talking
stack that `dev/payments` deleted. **On merge, dev/payments WINS every payment file; none
of main's payment files may resurrect** (see §3.5).

### 3.1 The ioTec client (`src/lib/iotec.ts`, 281 ln)

- **Auth:** OAuth2 `client_credentials` against `IOTEC_AUTH_URL` (default
  `https://id.iotec.io/connect/token`). Token cached in module scope, refreshed within 60s
  of expiry.
- **`apiFetch`:** Bearer on every call to `IOTEC_BASE_URL` (default
  `https://pay.iotec.io`); parses JSON defensively; **never throws** (network error →
  `{ok:false,status:0}`).
- **Demo mode** (`isDemoMode()` — `IOTEC_CLIENT_ID` empty or `'demo'`): every call
  short-circuits to deterministic success (collect→`Pending`, status→`Success`,
  disburse→`Success`). No real charges.
- **Operations:** `collect` (`POST /api/collections/collect`),
  `getCollectionStatus(:id)`, `getCollectionByExternalId(:extId)`, `disburse`
  (`POST /api/disbursements/disburse`), `getDisbursementStatus(:id)`,
  `getWalletBalance(:walletId)`, `sendSMS`/`smsTemplates` (stub — `console.log` only).
- ⚠️ **`collect` reads currency from `env('IOTEC_CURRECY')`** — the env key is misspelled
  (no "N"). `.env` must carry the same typo or collect sends an empty currency.

### 3.2 End-to-end flow

**INITIATE — `POST /api/payments/initiate`** (`route.ts`, 139 ln)
1. Rate-limit (`rateLimit('payments', ip)`); require non-empty `x-buyer-key` (guest id).
2. Zod-validate `{betslip_id, method('momo'|'card'), payer, payer_name?}`.
3. Load betslip (`slip_price, tipster_id, result, verification_status`); 404 if missing;
   reject if `verification_status !== 'verified'`; reject if `result !== 'pending'`
   (settled slips are free).
4. Load tipster; enforce `amount >= MIN_AMOUNT_UGX (500)`.
5. Already-owned guard: active `slip_purchases` for `(betslip_id, buyer_key)` → 409.
6. Resolve payer: momo → `normalisePhone` (stored `+256…`, ioTec payer = digits w/o `+`);
   card → must be a valid email.
7. `external_id = 'bf-'+base36(now)+'-'+rand6`.
8. `createTransaction({external_id, amount, method, category:'MobileMoney',
   purpose:'slip_purchase', betslip_id, tipster_id, …, status:'pending'})`.
9. Record pending purchase **before** charging (lookup → insert/update on
   `(betslip_id, buyer_key)`; per-step `abort()` error reporting; on failure marks txn
   `failed`).
10. Link txn → purchase (`updateTransaction(txn.id,{slip_purchase_id})`).
11. `collect({…, redirectUrl:${NEXT_PUBLIC_APP_URL}/pay/return?ext=external_id})`.
12. `!ok` → txn `failed`. ok → update txn (`iotec_id`, normalised `status`,
    `card_redirect_url`, …) → return `PaymentResult`.

**STATUS — `GET /api/payments/status?ext=|id=`** (56 ln): resolve txn; if non-terminal,
refetch from ioTec, update row, and on FIRST `success` call `fulfillTransaction`.

**WEBHOOK — `POST /api/webhooks/iotec`** (71 ln): auth via `x-iotec-callback-token` /
`Authorization: Bearer` *if* `IOTEC_WEBHOOK_SECRET` set (skipped in demo). **Body is NOT
trusted** — find txn, **re-verify** by `getCollectionStatus(id)`, update, fulfil on
success. Always `200` (unknown txn → `200 {received:true}`; only unexpected error → `500`
so ioTec retries).

**RECONCILE — `POST|GET /api/payments/reconcile`** (72 ln; driven by the `sync` container):
auth `x-sync-token === SYNC_TOKEN`. Selects `type='collection'`, status in
`('pending','processing')`, `created_at` between now-48h and now-60s (skip fresh to avoid
racing the client poll), `limit RECONCILE_BATCH` (25). Refetch → update → fulfil.
**Safety net for buyers who close the tab.**

**FULFILLMENT — `fulfillTransaction(txn)`** (`src/lib/fulfillment.ts`, 119 ln; idempotent,
never throws): only when `txn.status==='success'`; no-op if the linked purchase is already
`active`. Then: unlock buyer (`slip_purchases.status='active'`) → pay tipster (commission
math per §1.6, `disburse` to `tipster.phone` sans `+`, wrapped so payout failure never
bubbles) → `logEarning(...)` (recorded regardless of payout transport).

### 3.3 Paywall reveal & guest-buyer model

- **`GET /api/slips/[id]/reveal`** (62 ln): finished slips (`result` win/loss) → content
  free to anyone. Pending slips → returned ONLY if the buyer has an `active`
  `slip_purchases` row for `(betslip_id, buyer_key)` (via `x-buyer-key`/`?buyer=`) OR the
  logged-in owning tipster (`getSessionUser()` + `tipsters.profile_id === user.id` — note:
  this `profile_id` join is the **P0 locus**, §6.2). Else `403 Not purchased`. Content
  joined service-role from `betslip_secrets` + `betslip_legs` + `slip_verifications`
  (matches, raw_text, normalized, summary, total_odds).
- **Buyers do NOT log in.** Identity = random `bf_guest` UUID in localStorage →
  `x-buyer-key` header (`src/lib/guestId.ts buyerHeader()`). Purchases keyed on
  `(betslip_id, buyer_key)` (unique `uniq_purchase_betslip_buyerkey`).
- **Limitation (documented in code):** localStorage is per-browser — purchases don't
  follow a buyer across devices; clearing site data loses access. `buyer_id`
  (auth.users) kept nullable for legacy logged-in purchases.

### 3.4 Frontend payment surface

`BuySlipButton` ("Unlock — UGX X") → `usePayment` (promise driver for one shared sheet) →
`<PaymentSheet>` (bottom-sheet form + poll + states) → `/api/payments/initiate`. Card flow
returns to `src/app/pay/return/page.tsx` (polls status). `SlipReveal.tsx` renders unlocked
content from `/reveal`. `/api/subscribe` is now **GET-only** ("my purchases" list) — the
legacy POST collect/disburse body is gone.

### 3.5 Files dev/payments owns vs deletes (payments)

**Owned (preserve verbatim, dev WINS):** `src/lib/{iotec,payments,transactions,
fulfillment}.ts`, `src/types/payments.ts`; routes `api/payments/{initiate,status,
reconcile}`, `api/webhooks/iotec`, `api/slips/[id]/reveal`, GET-only `api/subscribe`;
frontend `usePayment`, `PaymentSheet`, `BuySlipButton`, `SlipReveal`, `pay/return`,
`guestId.ts`.

**Deleted on dev — must NOT come back from main:**
`main:src/app/api/webhooks/flutterwave/route.ts`, `main:src/types/flutterwave.d.ts`,
`main:src/types/africastalking.d.ts`, main's old `src/app/api/subscribe/route.ts` (mock
collect/disburse), main's Flutterwave `src/lib/payments.ts` (replaced by 1-line barrel
`export * from './iotec'`). The `payments` table + `flw_ref` column linger in `init.sql`
but are **unused** by dev (the `transactions` table superseded them).

---

## 4. The bet worker — its TRUE nature: a Puppeteer scraper service

> **This entire feature is dev/payments-only** (`main` has no `bet-code-worker/` dir, no
> `api/slips/verify-code`, no `api/slips/sync-codes`). Add the whole service + the two API
> routes + `src/lib/verifyCode.ts` + compose wiring verbatim — **nothing on main
> collides.**

### 4.1 What it actually is

It is **NOT a Postgres/queue worker.** It is a **standalone, stateless HTTP microservice**
— its own Node process, `package.json`, Dockerfile/image — that drives **headless Chrome
(puppeteer-core + Debian `/usr/bin/chromium`)** to load a bookie *booking/share code* on
the real betting site and scrape back the selected matches. It is separate on purpose:
Vercel can't run headless Chrome, so it deploys as its own Docker container on a private
network behind `WORKER_API_KEY`.

- Entry: `bet-code-worker/src/server.js` — an **Express** app on `:8080` (`PORT`).
- **Stateless re. business data** — writes **nothing** to Postgres. Its only persistence
  is debug PNG screenshots in a local dir/volume. All DB writes happen web-side
  (`recordVerification` in `verifyCode.ts`).
- Source files (`bet-code-worker/src/`): `server.js` (API/auth/concurrency/static, 112 ln),
  `scraper.js` (Puppeteer + scrape state-machine, 240 ln), `adapters.js` (per-bookie
  selectors + site normalisation, 218 ln), `normalize.js` (optional Gemini normaliser,
  257 ln).

### 4.2 HTTP API surface (`server.js`)

- **`POST /verify`** — auth header `x-worker-key: <WORKER_API_KEY>`. **If `WORKER_API_KEY`
  is empty, auth is SKIPPED (open)** → the key MUST be set in any non-local deploy. Body
  `{betting_site, booking_code}`; missing either → 400; unknown site (no adapter) → 400
  with the supported list. In-process semaphore caps scrapes at `MAX_CONCURRENT`
  (default 2). **Site key is lowercased, booking code's case is PRESERVED** (some bookies,
  e.g. Betika `KkxPBu`, 404 if lowercased). Success → `{ok:true, ...result, ...enrich,
  screenshot_url}`. **Scrape failure → still HTTP 200** with
  `{ok:false, error, step, matches:[], raw_text:'', count:0, screenshot_url}` (deliberate —
  the caller records a failed attempt rather than throwing; `step` names the exact failing
  stage).
- **`GET /health`** — `{ok:true, active, sites}`. No auth. Used by Docker `HEALTHCHECK`.
- **`GET /shots/<file>`** — static debug screenshots (`PUBLIC_BASE_URL` or request host).
- **Graceful shutdown** — `SIGINT`/`SIGTERM` closes the shared Chrome.

### 4.3 How it validates a code (`scraper.js`)

`scrapeCode({site,code})` is a logged **step state-machine** (each `step` set before the
action so a throw reports exactly where it broke; full-page screenshot on success AND
failure):

1. **Shared browser, fresh incognito `createBrowserContext()` per scrape** — critical:
   bookies persist the betslip in `localStorage`; a reused profile would carry the prior
   code's selections and hide the empty-state input.
2. **Two load strategies per adapter:** `codeUrl(code)` direct URL (best; Betika,
   MozzartBet, SportyBet) or **type-and-submit** (optional `expandSelector` click for
   1xBet/22Bet; `waitForSelector`; `type(code,{delay:40})`; click submit / Enter;
   `waitForNavigation` when `navigatesOnSubmit`).
3. **Wait for results** (`waitFor` — soft, never hard-fails).
4. **Extract** (`page.evaluate`): `resultSelector`→container, `rowSelector`→rows,
   per-row `fields.{teams,league,market,pick,kickoff}`. Rows kept if `teams || pick`.
   Always grabs `rawText` (≤8000 chars) as fallback.
5. **`found = matches.length > 0`** — **this is the validation signal.** `found:true` ⇒
   the code is real/valid and its legs were scraped; `found:false` ⇒ invalid/expired,
   anti-bot wall, or stale selectors.
6. **Screenshot** into `SHOT_DIR` (`${site}-${code}-${ts}.png`, never throws);
   `pruneOldShots()` deletes shots older than `SCREENSHOT_TTL_HOURS` (default 48). Page +
   context always closed in `finally`.

Tuning env: `NAV_TIMEOUT_MS` (45000), `PUPPETEER_EXECUTABLE_PATH` (`/usr/bin/chromium`),
`SCREENSHOT_DIR` (`./screenshots`), `SCREENSHOT_TTL_HOURS` (48).

### 4.4 Optional Gemini normalisation (`normalize.js`)

Best-effort LLM post-processing that rewrites messy bookie-specific `matches`/`raw_text`
into clean machine-readable legs. **Optional and non-blocking** — enabled only when
`GEMINI_API_KEY` is set and only run when `result.found` is true; any failure (no key,
HTTP error, timeout, non-JSON) is caught and **`/verify`'s base contract is untouched**.
Single `fetch` to the Gemini REST API (`x-goog-api-key` header — key never in URL),
`responseMimeType:'application/json'` + `responseSchema` for strict JSON, `temperature:0`,
`AbortController` timeout. Adds `normalized[]` (per-leg `{teams, homeTeam, awayTeam,
market(1X2|DC|OU|BTTS|DNB|AH|EH|CS|OTHER), marketLabel, pickSymbol, pickSide(home|away|
draw|n/a), pickTeam, line, odds, kickoff(ISO-8601 +03:00 EAT), kickoffRaw, summary}`),
`totalOdds`, `summary`.

### 4.5 Supported bookies (`adapters.js` ↔ `src/lib/bettingSites.ts`)

`getAdapter(site)` lowercases + strips non-alnum, then maps an alias table. **Two parallel
lists must stay in sync** (`bettingSites.ts` UI order ↔ worker adapter keys):

| Display | adapter key (aliases) | strategy | confidence |
|---|---|---|---|
| Betika | `betika` | `codeUrl` `/en-ug/share/<code>` | confirmed 2026-06-19 (`KkxPBu`) |
| betPawa | `betpawa` (`pawa`) | type-submit, single+combo | confirmed 2026-06-19 |
| 1xBet | `1xbet` (`onexbet`) | type-submit + expand + `navigatesOnSubmit` | confirmed (`KSA6G`) |
| 22Bet | `22bet` (`twentytwobet`) | type-submit + `navigatesOnSubmit` | confirmed (`XLD6G`) |
| SportPesa | `sportpesa` (`pesa`) | type-submit | confirmed (`HXHWHV`) |
| MozzartBet | `mozzart` (`mozzartbet`) | `codeUrl` numeric ticket route | codeUrl confirmed; rows inferred |
| SportyBet | `sportybet` | `codeUrl` `/ug/sport/load_code/<code>` | **UNVERIFIED** placeholder |
| Betway | `betway` | type-submit | **UNVERIFIED** placeholder |

**Deliberately NOT supported** (documented in `adapters.js`): **Fortebet** (counter-only
numeric i-ticket) and **Championbet** (ticket status needs code+PIN). Omitted on purpose so
`/verify` returns a clear "unsupported site". Per-site selector commentary is load-bearing
provenance — preserve verbatim.

### 4.6 Worker deploy / env

`bet-code-worker/Dockerfile`: `node:24-bookworm-slim` + Debian `chromium`; non-root `app`
user; pre-chowned `/app/screenshots`; `HEALTHCHECK` hits `/health`. Env (NAMES ONLY):
`WORKER_API_KEY`, `PORT` (8080), `MAX_CONCURRENT`, `NAV_TIMEOUT_MS`, `SCREENSHOT_DIR`,
`SCREENSHOT_TTL_HOURS`, `PUBLIC_BASE_URL` (opt), `PUPPETEER_EXECUTABLE_PATH`,
`PUPPETEER_SKIP_DOWNLOAD`, `GEMINI_*` (opt). **Verified working 2026-06-25:** live
`/verify` 22Bet → `found=true` + Gemini normalize; 1xBet machinery works (~53s on invalid
codes via the `navigatesOnSubmit` timeout). Datacenter IPs blocked → prod runs sync from a
residential IP.

> Doc nit (non-blocking): `GEMINI_API_KEY` is **missing from
> `bet-code-worker/.env.example`** (it lives in `.env.local.example` + both compose files);
> the worker README still describes raw-scrape-only (predates `normalize.js`).

---

## 5. Code parsing & the web↔worker integration

> **Input method 2.** A tipster posts a slip with **bookie name + booking/share code**
> (e.g. `betting_site:"Betika", booking_code:"KkxPBu"`) instead of typing legs or uploading
> a screenshot. The platform independently verifies the code by loading it on the real
> bookie. Three input methods (`api/tips/route.ts`): `booking_code` → `screenshot` →
> `manual`, chosen by which field is present. **Only `booking_code` slips are scraped**
> (start `verification_status='pending'`); screenshot/manual are trusted `'verified'` on
> post.

### 5.1 The bridge — `src/lib/verifyCode.ts`

Transport is **plain HTTP over the internal network behind a shared key — no queue, no
Redis** (a Redis-queue rearchitecture was built then **reverted**; do not reintroduce).
Two shared secrets bind web↔worker: `BET_CODE_WORKER_URL` (e.g.
`http://bet-code-worker:8080`) and `BET_CODE_WORKER_KEY` (web) **must equal**
`WORKER_API_KEY` (worker), sent as `x-worker-key`.

- `callWorker(site, code)` — `POST {BET_CODE_WORKER_URL}/verify`, `x-worker-key`,
  `AbortSignal.timeout(90_000)` (a scrape can take ~53s). **Never throws** — returns a
  failed-shaped `WorkerResult` if the URL is unset (`{ok:false,error:'worker not
  configured'}`) or unreachable. No format validation of the code itself — any non-empty
  string is accepted; legitimacy is decided entirely by whether the worker can load it.
- `recordVerification({betslip_id, betting_site, booking_code, result})` — upserts
  **`slip_verifications`** (one row per betslip, `onConflict:'betslip_id'`; no-id admin
  checks are `insert`ed). Persists `matches`, `normalized` (Gemini legs — secret),
  `summary`, `total_odds` (coerced numeric), `raw_text`, `match_count`, `found`, `status`
  (`scraped`/`failed`), `error`, `screenshot_url`, `scraped_at`. Then **reflects onto
  `betslips`**:
  - `found && matches.length` → `verification_status='verified'` + public PROOF
    (`game_count`, `markets`, `leagues`, `earliest_kickoff`, `total_odds`; derived from
    `normalized` when present, else raw). **Never un-verifies.**
  - worker ran but found nothing → `db.rpc('record_failed_verify',{p_betslip_id})`
    (atomically bump `verify_attempts` + flip still-pending → `failed`).
  - worker errored/unreachable → changes nothing (leaves slip `pending`; does NOT
    increment `verify_attempts` — "not the code's fault").
- `verifyAndRecord(betslip_id, site, code)` = `callWorker` then `recordVerification` —
  **the single entry point all three callers use.**

### 5.2 Three callers of `verifyAndRecord`

1. **`POST /api/tips`** — auto-trigger, fire-and-forget on post/update of a booking-code
   slip (`verifyAndRecord(bs.id, …).catch(()=>{})`).
2. **`POST /api/slips/verify-code`** (dev-only) — **admin manual** re-verify;
   `requireRole('admin')`; zod `{betting_site, booking_code, betslip_id?}`; `503` if
   `BET_CODE_WORKER_URL` unset.
3. **`POST|GET /api/slips/sync-codes`** (dev-only) — **the poller** (driven by the `sync`
   container; auth `x-sync-token`). Reads pending coded slips from **`betslip_secrets`**
   (service-role-only; the overhaul moved `booking_code`/`betting_site` off `betslips`),
   joined `betslips!inner` filtered `result='pending' AND verification_status IN
   (pending,failed) AND verify_attempts < SYNC_MAX_FAILED_RETRIES` (default 5),
   `LIMIT SYNC_BATCH` (default 20). **Kill switch:** `SYNC_CODES_ENABLED='false'` →
   `{ok:true,disabled:true}` (prod, because the scraper is blocked from datacenter IPs).
   **Skips already-verified slips** — a code's selections are immutable; re-scraping wastes
   the worker / risks IP blocks (the whole point of migration 0010).

### 5.3 Two representations of a coded slip's contents (both in `slip_verifications`)

1. **`matches`** (raw scrape) — `[{teams, league, market, pick, kickoff}]`, messy /
   bookie-specific.
2. **`normalized`** (`NormalizedLeg[]`) — clean Gemini output (only when `GEMINI_API_KEY`
   set + code valid). The **buyer-facing structured picks** returned by `/reveal`.

### 5.4 Settlement seam (unifies with main)

`main` owns football-API **settlement** (win/loss on `betslips.result`); dev owns
**verification** (does the code resolve / what does it contain → `verification_status`).
They are orthogonal. The poller's `result='pending'` filter is the seam: once main's
settlement marks a slip win/loss, the poller stops touching it. The common match/leg model
(`betslip_legs` + the `slip_verifications.normalized` legs) is the shared surface the
unified-settlement requirement hangs on.

---

## 6. Auth model (dev/payments is the ONLY auth)

> **Merge rule:** dev's auth WINS — the one non-additive area. Wherever main and dev
> disagree on how a request is authenticated/authorized, dev's Supabase-Auth model
> replaces main's; main's admin/tipster features re-wire onto it. Auth tables are created
> inside main's DB.

### 6.1 The model

Auth is **Supabase Auth** (`auth.users` + `@supabase/ssr` cookie sessions); identity =
email + password (email confirmation ON in prod; OFF locally via `config.toml`
`enable_confirmations=false`). **No custom session token/JWT for end users.**

- **`public.profiles`** (one row per auth user) carries the **role**
  (`user|tipster|admin`, default `user`). Roles are **not** in the JWT — read server-side
  via the **service-role** client (bypasses RLS) so the check is reliable regardless of RLS
  (`getProfile()`).
- **Auto-provision:** `handle_new_user()` (SECURITY DEFINER) fires `after insert on
  auth.users` → inserts a `profiles` row at `role='user'`.
- **Role elevation:** `user→tipster` via `POST /api/tipster/register`
  (`profiles.update({role:'tipster'})` + inserts the `tipsters` row, service-role).
  `*→admin` has **no code path** — provision manually:
  `update profiles set role='admin' where id=…`.

**Three Supabase clients:**

| Helper | File | Key | Use |
|---|---|---|---|
| `supabaseBrowser()` | `src/lib/supabase/client.ts` | anon | client components; login/signup call `signInWithPassword`/`signUp` here |
| `supabaseSession()` | `src/lib/supabase/server.ts` | anon | "act AS the logged-in user", RLS applies; used by `getSessionUser()` + logout |
| `supabaseServer()` | `src/lib/supabase/index.ts` | **service-role** | privileged reads/writes; **bypasses RLS**; forces `cache:'no-store'` |

**Middleware (`src/middleware.ts`)** runs on every non-static request and **only refreshes
the session + rotates cookies** — it does **NOT** protect routes. **Every protected
handler/page must call `getSessionUser`/`requireRole` itself.** Guard primitives in
`src/lib/auth/session.ts`: `getSessionUser()`, `getProfile()` (falls back to synthesized
`{role:'user'}` if the row is missing), `requireRole(role)` (admins pass everything),
`getMyTipster()` (the P0 locus, §6.2).

### 6.2 🔴 P0 — legacy tipster `profile_id` is NULL → login dead-ends

Migration 0005 **adds** `tipsters.profile_id` but **never backfills it** (no `update
tipsters set profile_id=…` anywhere). So every pre-existing tipster — including the 4
**seeded** ones (`Enzo Kampala`, `Nairobi King`, `StatAttack`, `BetWise UG`) — has
`profile_id = NULL` and **no `auth.users` row at all** (they used the old phone+bcrypt
scheme, now defunct; 0005 drops the `password_hash` NOT NULL but migrates no credentials).

Dead-end: `getMyTipster()` does `tipsters.select('*').eq('profile_id', user.id).single()`.
A re-created legacy tipster gets a **new** `auth.users`/`profiles` id that matches no
`tipsters` row → `/api/tipster/me` 401 → dashboard
(`tipster/dashboard/page.tsx`) sees `!d?.tipster` and `router.push('/tipster/login')` →
**infinite bounce**. `.single()` (not `.maybeSingle()`) also throws on 0 rows. **Fix
directions:** backfill/link migration binding each legacy `tipsters` row to a Supabase auth
uid; harden `getMyTipster()` to `.maybeSingle()`; decide seeded tipsters get real auth rows
or are display-only.

### 6.3 RLS posture (auth-adjacent)

- `profiles`: `profiles_self_read`/`_self_update` → `id = auth.uid()`. Admin access via
  service-role (no policy needed).
- `betslip_secrets`: RLS ON, **no policy → service-role only** (booking code/site/screenshot
  reachable only through the purchase-checked API).
- `betslips`: `betslips_verified_public` → public reads `verification_status='verified' OR
  result IN (win,loss)` (proof columns only; secrets live in `betslip_secrets`).
- `slip_purchases`: `purchases_owner_read` → `buyer_id = auth.uid()`. Writes service-role
  only.

These assume `auth.uid()`. **main's permissive `using(true)` RLS must NOT win** — keeping
it re-leaks pending booking codes / password_hash to the anon key.

### 6.4 Secondary auth findings (don't lose at merge)

- **Tipster dashboard "Sign out" doesn't sign out** — only removes the dead
  `bf_tipster_id` localStorage key + redirects; never calls `/api/auth/logout` /
  `signOut()`, so the Supabase cookie survives. (Buyer + admin logout are correct.)
- **No password-strength enforcement on the live path** — `isStrongPassword()` exists but
  is unused; UIs enforce only `length >= 6` client-side.
- `src/lib/auth.ts` is now **legacy/partial** — `hashPassword`/`verifyPassword`/
  `generateSessionToken` are dead; **only `normalisePhone()` is still used.** Keep the file
  for that export.

### 6.5 Admin — dev model vs main, the re-wiring rule (CRITICAL)

| | dev/payments (authoritative) | main (to be replaced) |
|---|---|---|
| Admin auth | Supabase auth user with `profiles.role='admin'`, gated by `requireRole('admin')` server-side | shared **`ADMIN_PASSWORD`** env (default hardcoded `'Betfluencer@Admin2026'`) + `x-admin-token` header (`src/lib/adminAuth.ts`) |
| Admin page gate | `GET /api/admin/me`; not-ok → "Log in with an admin account" → `/login`; logout = `POST /api/auth/logout` | `AdminLogin` posts password to `/api/admin/login`, stores token in `localStorage['bf_admin_session']`, every fetch sends `x-admin-token` |
| `src/lib/adminAuth.ts` | **DELETED** | present + used |

**Re-wiring checklist (no admin feature may be lost):**
1. main-only admin routes (`pending-slips`, `settle`, and main's
   `revenue/review/settings/tipsters/stats/ads`) **drop** `verifyAdminToken(req)` /
   `x-admin-token` → replace with `if (!(await requireRole('admin'))) return 401`.
2. Stop sending `x-admin-token` from the client (the Supabase cookie authenticates).
3. main's settlement entrypoints (`/api/admin/settle`, `/api/verify` from main's admin
   page) sit behind `requireRole('admin')`.
4. Delete `adminAuth.ts`, `ADMIN_PASSWORD`, `/api/admin/login`; provision admin via
   `profiles.role='admin'`.

**dev admin routes (inventory):** `me` (NEW), `slips` (NEW — list 80 recent incl.
`hidden`; POST toggles `betslips.hidden`), `verify-slip` (NEW — set
`verification_status`), `transactions` (NEW — `listTransactions` w/ status+pagination),
plus `ads`/`review`/`settings`/`stats`/`tipsters`/`revenue` (auth swap; `settings` now
persists to `platform_settings`; `stats` reads `slip_purchases.purchased_at` not
`created_at`; `review` orders by `match_time` not `created_at`; `tipsters` PATCH gains
`commission_rate`). New page tabs: `TransactionsTab`, `SlipsTab`, commission editor.

**Two distinct review/settlement features must both survive** (not a conflict): main's
ReviewTab = slip-level settlement via `/api/admin/pending-slips` + `/api/admin/settle`
(**dropped on dev — DO NOT LOSE; re-add ported to `requireRole`**); dev's ReviewTab =
leg-level "unverifiable" resolution via `/api/admin/review`. Keep both (likely "Settle" +
"Review legs" tabs).

**Latent bug to clean up:** dev's `admin/page.tsx` is only half-migrated — the top-level
gate uses `/api/admin/me` ✅ but every tab is still rendered with `token={localStorage
.getItem(SESSION_KEY)}` and each fetch still sends `x-admin-token` (now ignored — works only
because the cookie rides along). `AdminLogin` + `/api/admin/login` are dead code
(`SESSION_KEY` is never written). Finish the migration on merge.

---

## 7. Schema objects the code depends on

> `dev/payments` ships **two** schema descriptions that are **not in sync**:
> `supabase/migrations/*.sql` (authoritative) and `src/lib/schema.sql` + `src/lib/rls.sql`
> (a "full reference" that is **STALE — only reflects 0001–0003**). **Migrations are the
> source of truth**; `schema.sql`/`rls.sql` must NOT override them and should be
> regenerated or dropped post-merge. `main` has **no `supabase/migrations/` dir at all** —
> the entire tree is an additive dev contribution.

### 7.1 Migration roster (timestamp = apply order)

| # | File | Net new |
|---|---|---|
| 0001 | `20260610000001_init.sql` | baseline: 7 tables, 5 idx, `update_tipster_tick()` fn+trigger, `tipster_rankings` view, seed |
| 0002 | `20260610000002_transactions.sql` | `transactions` + 4 idx + `set_updated_at()` + trigger + RLS; loosens `slip_purchases.status` (adds `pending`, default `active`→`pending`) |
| 0003 | `20260610000003_lock_pending_content.sql` | RLS hardening (drops open policies; finished-only reads) |
| 0004 | `20260610000004_slip_verifications.sql` | `slip_verifications` + 2 idx + RLS |
| — | `20260611075122_test.sql` | **EMPTY (0 bytes) — DUMMY.** Sorts 5th. See §7.5. |
| 0005 | `20260612120000_auth_paywall_overhaul.sql` | `profiles`, `betslip_secrets`, `handle_new_user()`+auth trigger, tipster/betslip/slip_purchases columns, RLS rewrite |
| 0006 | `20260622120000_normalized_verification.sql` | `slip_verifications.normalized/summary/total_odds` |
| 0007 | `20260622130000_admin_hide_flag.sql` | `betslips.hidden` + partial idx |
| 0008 | `20260623090000_fix_slip_purchases_buyer.sql` | re-applies 0005's `buyer_id` + indexes (idempotent) |
| 0009 | `20260623100000_guest_buyer_key.sql` | `slip_purchases.buyer_key` + 2 idx |
| 0010 | `20260625120000_skip_verified_sync.sql` | `betslips.verify_attempts` + idx + `record_failed_verify()` fn |

**Live-DB state:** 0001 applied; **0002–0010 must be applied** (`CLAUDE.md`/`TODO.md`).
Until 0010 lands, `sync-codes` + the `record_failed_verify` RPC error out and sync silently
no-ops.

### 7.2 Tables the code depends on

- **`profiles`** (0005) — `id PK → auth.users(id) CASCADE`, `role check(user|tipster|admin)`,
  `email`, `display_name`. **Hard dependency on the `auth` schema.** Code: `auth/session.ts`,
  `api/admin/me`, `api/tipster/register`.
- **`betslip_secrets`** (0005) — `betslip_id PK → betslips CASCADE`, `booking_code`,
  `betting_site`, `slip_image_url`. Secrets isolated off `betslips`; RLS no-policy →
  service-role only. 0005 migrates secrets out of `betslips` then NULLs the old columns.
  Read by reveal / sync-codes / tips.
- **`transactions`** (0002) — `iotec_id UNIQUE`, `external_id UNIQUE NOT NULL`,
  `type(collection|disbursement)`, `method(momo|card)`, `category`, `purpose`,
  `betslip_id`/`tipster_id`/`slip_purchase_id` (FK SET NULL), `user_phone`, `user_email`,
  `payer`, `amount` (int UGX), `currency`, `status(pending|processing|success|failed|
  cancelled)`, `iotec_status`, `status_message`, `card_redirect_url`, `transaction_charge`,
  `raw` jsonb, `created_at`, `updated_at` (trigger). 4 indexes.
- **`slip_verifications`** (0004 + 0006) — `betslip_id FK CASCADE`, `betting_site`,
  `booking_code NOT NULL`, `matches` jsonb, `raw_text`, `screenshot_url`, `match_count`,
  `found`, `status(scraped|failed|verified)`, `error`, `scraped_at`; **0006 adds**
  `normalized` jsonb, `summary`, `total_odds`. Unique `uniq_slip_verif_betslip` on
  `betslip_id` (enables the upsert); idx on `booking_code`. RLS no-policy → service-role
  only.
- **Core (0001) the code reads:** `tipsters` (+ dev cols `profile_id`, `commission_rate`;
  `password_hash` NOT NULL dropped), `betslips`, `betslip_legs`, `slip_purchases`,
  `payments` (legacy, holds `flw_ref` — unused by dev), `earnings`, `platform_settings`
  (seeded `platform_commission='0.10'`).

### 7.3 Column additions to existing tables

- **`betslips`** (0005 unless noted): `posting_mode` check gains `'booking_code'`;
  `total_odds` + `leg_count` made **nullable** (main: NOT NULL — **incompatible with
  booking-code slips; dev's nullable MUST win**); `verification_status NOT NULL default
  'pending' check(pending|verified|failed|rejected)`; `verified_at`; `game_count`,
  `leagues` jsonb, `markets` jsonb, `earliest_kickoff` (PUBLIC PROOF — no secret);
  `hidden` bool (0007) + partial idx; `verify_attempts` int (0010) + idx. 0005 backfill:
  manual/screenshot slips → `verification_status='verified'`.
- **`slip_purchases`** (0005/0008/0009): `status` gains `pending`, default flips
  `active→pending`; `buyer_id → auth.users SET NULL` + unique `(betslip_id, buyer_id)`;
  `buyer_key` (guest id) + unique `(betslip_id, buyer_key)`. Both coexist.
- **`tipsters`** (0005): `profile_id → profiles SET NULL` + unique; `commission_rate`
  numeric(4,3); `password_hash` NOT NULL dropped.

### 7.4 Functions, triggers, view, RLS

- **Functions/triggers:** `update_tipster_tick()` + trigger (0001, AFTER UPDATE OF result
  ON betslips — auto-tick); `set_updated_at()` + trigger (0002); `handle_new_user()`
  (SECURITY DEFINER) + `on_auth_user_created` trigger on **`auth.users`** (0005);
  `record_failed_verify(p_betslip_id uuid) returns int` (0010 — bump `verify_attempts` +
  flip pending→failed; never touches verified/rejected).
- **View `tipster_rankings`** (0001, main baseline — dev does NOT modify): public tipster
  info (subscriber_count, wins_last_10, avg_odds, score = wins×avg). Public tipster info is
  exposed via this view, never the raw `tipsters` table. (Ranking *logic* is main's domain.)
- **RLS final state:** `tipsters`/`payments`/`earnings`/`platform_settings`/
  `slip_verifications`/`betslip_secrets` → no policy = service-role only; `betslips` →
  `betslips_verified_public`; `betslip_legs` → `legs_finished_public`; `slip_purchases` →
  `purchases_owner_read (buyer_id=auth.uid())`; `profiles` → self read/update.
  ⚠️ **`transactions_service_only` uses `for all using(true)`** — technically grants anon
  too (works only because the anon key never queries `transactions`). **Flag for security
  review**; likely should be no-policy (deny) like payments/earnings.

### 7.5 The dummy migration

`20260611075122_test.sql` — **0 bytes, no-op**, sorts 5th (between 0004 and 0005). Supabase
records it in `schema_migrations`. **Recommendation:** delete it; if the live/linked DB
already recorded version `20260611075122`, use `supabase migration repair` rather than
silently removing (else `db push`/`diff` warns "missing migration"). Do not carry it
forward as-is without a decision.

### 7.6 config.toml highlights

project_id `betfluencer`; db major_version 15; API schemas `public, graphql_public`;
`[auth] enabled=true`, `enable_signup=true`, `[auth.email] enable_confirmations=false`
(local); site_url `http://127.0.0.1:3000`; Storage (50MiB) + Realtime enabled.

---

## 8. Test suite — the merge gate

The **entire** Playwright e2e suite is dev/payments-only (`main` has no `tests/e2e/*`, no
`scripts/e2e.sh`, no `playwright.config.ts`, no `test:e2e` script). **Add it all; keep and
run it as the merge gate** — it is the cheapest proof every dev/payments revenue feature
survived the additive merge.

**How it runs:** `npm run test:e2e` → `bash scripts/e2e.sh` (idempotent, `set -euo
pipefail`): boots **LOCAL** dockerized Supabase (`http://localhost:54321`, never prod) →
`supabase db reset --no-seed` applies **every migration** (the suite does NOT use
`src/lib/schema.sql`) → re-exports local keys under app names → forces **ioTec DEMO mode**
(`IOTEC_CLIENT_ID=demo`) → **unsets `BET_CODE_WORKER_URL`** so coded slips stay `pending`
(spec 04) → starts `next dev` (or `E2E_BUILD=1` prod build) → readiness-gates on
`GET /api/slips` → `npx playwright test`. `playwright.config.ts` has **no `webServer`**
(the script owns env injection); serial (`workers:1`, `fullyParallel:false`); single
chromium project. `global-setup.ts` probes `profiles` (fails fast if migrations didn't
apply) + seeds one confirmed admin (`admin@e2e.test`, `role='admin'`). Fully self-contained
/ CI-safe — no external secrets, no real network, worker out of the loop.

| Spec | Preserves (feature this probe guards) |
|---|---|
| 01-home | Marketplace home + global nav shell; zero pageerrors |
| 02-tipster-auth | Supabase tipster signup/login/logout (**the P0 regression probe**) |
| 03-manual-slip | Manual slip auto-verify + **proof-only** feed (no secret leak) |
| 04-coded-slip-paywall | Booking-code storage in `betslip_secrets` + secret isolation; worker no-op |
| 05-guest-purchase | ioTec demo flow + guest purchase/reveal + access control (core revenue path) |
| 06-admin-hide | Admin role gate + `betslips.hidden` moderation |
| 07-rankings | Rankings page shell (logic owned by main; smoke only) |

**Risks:** specs assert literal dev/payments UI copy ("Verified slips", "Marketplace",
"Post tip", "Unlock slip", "Pay UGX", "Betfluencer rankings", placeholders `e.g. 1500`/
`e.g. 12.40`…). If main's home/rankings/dashboard copy wins, specs 01/03/05/06/07 need
selector updates even though the feature is intact — **treat red as a copy-drift signal,
not a lost feature.** No spec exercises the bet-code worker or main's football-API
settlement — those need separate verification. The suite hard-depends on
`supabase/migrations/`; if the merge standardizes on `schema.sql`, `scripts/e2e.sh` step 2
+ the `global-setup.ts` probe must be reconciled.

---

## 9. Merge landmines (quick index)

- **🔴 P0 tipster login** — legacy + seeded `tipsters.profile_id = NULL`, no `auth.users`
  rows (§6.2). Needs a backfill/link migration + `.maybeSingle()` hardening + real tipster
  logout.
- **Migrations 0002–0010 not yet applied to the live DB.** Until 0010, sync no-ops.
- **`betslips.total_odds`/`leg_count` NOT NULL (main) is incompatible** with booking-code
  slips — dev's nullable MUST win.
- **main's permissive `using(true)` RLS must NOT win** — re-leaks pending codes /
  password_hash to anon. (And `transactions_service_only using(true)` is itself flagged for
  security review.)
- **Do not let main resurrect** Flutterwave/AT files (§3.5) or the old `subscribe` POST.
- **Admin re-wire** — port `pending-slips` + `settle` (dropped on dev) onto
  `requireRole('admin')`; both review/settlement features survive as distinct tabs (§6.5).
- **Two synced lists** (`bettingSites.ts` ↔ `adapters.js`) must survive together; adapter
  alias table + selector commentary are load-bearing.
- **Redis was built then reverted** — direct worker call only; do not reintroduce.
- **Stale `schema.sql`/`rls.sql`**, **empty `20260611075122_test.sql`** (use `migration
  repair`), and the `GEMINI_API_KEY` doc gap in `bet-code-worker/.env.example` — clean up,
  not blockers.
- **Off-by-one (low):** `listTransactions` paginates `.range(offset+1, offset+limit-1)`
  (`transactions.ts`) — drops the first row, shortens the page (admin-only listing).

---

## 10. Env var inventory (NAMES ONLY)

**Web (build args):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_APP_URL`.
**Web (runtime):** `SUPABASE_SERVICE_ROLE_KEY`, `IOTEC_BASE_URL`, `IOTEC_CLIENT_ID`,
`IOTEC_CLIENT_SECRET`, `IOTEC_WALLET_ID`, `IOTEC_AUTH_URL`, `IOTEC_WEBHOOK_SECRET`,
**`IOTEC_CURRECY`** (sic), `PLATFORM_COMMISSION`, `RECONCILE_BATCH`, `ANTHROPIC_API_KEY`,
`ADMIN_PASSWORD` (main-legacy — to be removed), `ADMIN_SETTLE_KEY` (main `settle` —
re-wire), `BET_CODE_WORKER_URL`, `BET_CODE_WORKER_KEY`, `SYNC_TOKEN`, `SYNC_BATCH`,
`SYNC_INTERVAL`, `SYNC_MAX_FAILED_RETRIES`, `SYNC_CODES_ENABLED`, `AT_*`, api-football key.
**Worker:** `WORKER_API_KEY` (= web's `BET_CODE_WORKER_KEY`), `PORT` (8080),
`MAX_CONCURRENT`, `NAV_TIMEOUT_MS`, `SCREENSHOT_DIR`, `SCREENSHOT_TTL_HOURS`,
`PUBLIC_BASE_URL`, `PUPPETEER_EXECUTABLE_PATH`, `PUPPETEER_SKIP_DOWNLOAD`, `GEMINI_API_KEY`,
`GEMINI_MODEL`, `GEMINI_BASE_URL`, `GEMINI_TIMEOUT_MS`.
**Shared:** `BET_CODE_WORKER_KEY`=`WORKER_API_KEY`; `SYNC_TOKEN` (slips-sync + payments
reconcile). Reference files: `.env.local.example` (web), `bet-code-worker/.env.example`
(worker); `.env` is the source of truth for live keys.
