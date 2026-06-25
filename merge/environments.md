# Environments — Runtimes, Venvs & Required Env/Secret Names

Branch-merge dossier doc for merging `main` into `stag` (based on `dev/payments`). This documents every runtime/service in the merged app, the language/runtime each needs, and the **names** of every environment variable and secret each requires — grouped by purpose.

> SECURITY: This file lists env var / secret **NAMES ONLY**. It never contains values. Live values live in `.env` (web) and `bet-code-worker/.env` (worker) — those files exist in the tree and are git-ignored; **do not read or print their contents.** The committed `*.example` files are the safe reference.

Sources: `merge/.analysis/dev-stack.md`, `dev-payments.md`, `dev-betworker.md`, `dev-auth.md`, `dev-admin.md`, `main-settlement.md`; committed examples `.env.local.example`, `bet-code-worker/.env.example`; `docker-compose.yml`, `docker-compose.prod.yml`. Snapshot: 2026-06-25.

---

## 1. Service / runtime topology (3 services)

| Service | Build / image | Runtime | Port | Env source file | Role |
|---|---|---|---|---|---|
| **web** (Next.js) | root `Dockerfile`, `node:24-bookworm-slim`, Next `output:'standalone'` | **Node 24** (enforced by Docker base image only — root `package.json` has no `engines` pin; `@types/node ^20` lags) | **3000** (published in dev; NOT published in prod — behind reverse proxy) | `.env` (runtime secrets) + Docker **build args** for `NEXT_PUBLIC_*` | App: public/tipster/admin pages + all API routes. Holds Supabase service-role key, ioTec creds, Anthropic + football API keys. |
| **bet-code-worker** (Node/Express + Puppeteer) | `bet-code-worker/Dockerfile`, `node:24` + Debian `/usr/bin/chromium` | **Node ≥24** (`engines.node ">=24"`), ESM (`"type":"module"`) | **8080** (internal only; `expose` in prod) | `bet-code-worker/.env` | Stateless headless-Chrome scraper. `POST /verify`, `GET /health`, `GET /shots/<file>`. |
| **sync** (curl loop) | `curlimages/curl:8.10.1` | curl only (no app runtime) | — (no port) | reads `SYNC_*` from web's `.env`/compose | Every `SYNC_INTERVAL`s curls `POST web:3000/api/slips/sync-codes` **and** `POST web:3000/api/payments/reconcile` with `x-sync-token`. Does NOT call the worker directly. |

**No Python venv anywhere.** The stack is entirely Node/TypeScript (web) + Node/ESM (worker). The only non-Node tool is the Supabase CLI (`supabase/config.toml` + `npm run db:*` scripts) used for migrations, which reads its own connection config, not app env.

### Build-arg vs runtime split (web) — important for the merge
- **`NEXT_PUBLIC_*` are inlined at build time** → passed as Docker **build args** (`docker-compose.prod.yml`, `Dockerfile`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`.
- **Server secrets are runtime env** (`env_file: .env`): service-role key, all ioTec keys, Anthropic key, football API key, worker URL/key, sync token, etc. They are NOT build args (secrets aren't available at `next build`; a DB route that prerenders without the service key fails the build → hence the `force-dynamic` rule on DB routes).
- **`PORT` pinning:** web pins `PORT=3000` in compose `environment` to override any `PORT` leaking via `env_file: .env` (the worker uses 8080). **Do not put a shared `PORT` in `.env`.**

---

## 2. Web (Next.js) — required env var NAMES by purpose

Reference file: **`.env.local.example`** (committed, safe). Live file: `.env` (exists; do NOT read).

### Supabase — Postgres + Supabase Auth
- `NEXT_PUBLIC_SUPABASE_URL` — project URL (build arg; also read at runtime by `supabaseServer()`).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key for session/browser + SSR clients (build arg).
- `SUPABASE_SERVICE_ROLE_KEY` — privileged server client (`supabaseServer()`), bypasses RLS; runtime secret.

> Merge note: dev/payments uses Supabase **Auth** (`auth.users` + `profiles.role`) in addition to Postgres. The example file header still says "NOT Supabase Auth" — that header is stale (auth overhaul shipped); the three Supabase names above are unchanged and correct.

### Anthropic / Claude (Vision — betslip screenshot → legs)
- `ANTHROPIC_API_KEY` — `@anthropic-ai/sdk`, used by `api/parse-slip`.

### Football API (Verifier 2 — result settlement, `main`-owned, merging in)
- `FOOTBALL_API_KEY` — API-Football (api-sports.io v3), sent as header `x-apisports-key` by `src/lib/footballApi.ts`. Free tier: 100 req/day. (Confirmed in `.env.local.example:27` and `merge/.analysis/main-settlement.md`.)

### ioTec Pay (Mobile Money UG — collections + disbursements)
- `IOTEC_BASE_URL` — API base (default `https://pay.iotec.io`).
- `IOTEC_AUTH_URL` — OAuth2 `client_credentials` token endpoint (default `https://id.iotec.io/connect/token`).
- `IOTEC_CLIENT_ID` — OAuth client id. **Empty or `demo` → demo mode** (no real charges).
- `IOTEC_CLIENT_SECRET` — OAuth client secret.
- `IOTEC_WALLET_ID` — wallet for collect/disburse/balance.
- `IOTEC_WEBHOOK_SECRET` — verifies `POST /api/webhooks/iotec` via `x-iotec-callback-token` / `Authorization: Bearer`. If unset, webhook auth is skipped (demo/sandbox).
- `IOTEC_CURRECY` — ⚠️ **misspelled on purpose** (no "N"). Read by `collect()` in `src/lib/iotec.ts` as the collection currency. **Must be set with the exact same typo** or collect sends an empty currency. (Disburse hardcodes `UGX`.)

### Platform / money
- `PLATFORM_COMMISSION` — global commission rate, default `0.10` (platform 10% / tipster 90%). Overridable per-tipster via `tipsters.commission_rate` and per-deploy via `platform_settings.platform_commission`.
- `NEXT_PUBLIC_APP_URL` — public base URL (build arg). Used for ioTec `redirectUrl` → `/pay/return?ext=…`.
- `RECONCILE_BATCH` — max stranded collections swept per reconcile run (default 25). Read by `src/app/api/payments/reconcile/route.ts`.

### Bet-code worker URL + shared key (web → worker)
- `BET_CODE_WORKER_URL` — e.g. `http://bet-code-worker:8080` (internal Docker DNS) / `http://localhost:8080` dev. Read by `callWorker()` in `src/lib/verifyCode.ts`. If unset, verification no-ops (returns failed-shaped result).
- `BET_CODE_WORKER_KEY` — **must equal** the worker's `WORKER_API_KEY`; sent as `x-worker-key`.

### Sync / poller (drives sync-codes + payments reconcile)
- `SYNC_TOKEN` — shared secret protecting `POST /api/slips/sync-codes` **and** `POST /api/payments/reconcile` (`x-sync-token`).
- `SYNC_INTERVAL` — seconds between `sync` container polls (default 300).
- `SYNC_BATCH` — max coded slips re-verified per poll (default 20).
- `SYNC_MAX_FAILED_RETRIES` — max `verify_attempts` before a coded slip is given up on (default 5). Present in both compose files; read by the sync-codes route.
- `SYNC_CODES_ENABLED` — kill switch; set **`false` in production** (scraper is IP-geo-blocked from datacenter IPs → run code-sync from a residential-IP stack). Payment reconcile is unaffected. Default `true`.

### Admin (auth model is changing in the merge — see notes)
- `ADMIN_PASSWORD` — present in `.env.local.example:20` and both compose files. **dev/payments' admin is Supabase-Auth role-based (`requireRole('admin')`); this var is obsolete under the merged model** and should be dropped along with `main`'s `adminAuth.ts` / `/api/admin/login`. Listed here only because it still appears in committed example/compose; do not rely on it post-merge.

### Worker normalisation key (set on the WEB side too in compose)
- `GEMINI_API_KEY` — present in the root/prod compose **and** `.env.local.example:40`; compose passes it through to the worker service. The worker is the actual consumer (§3). Unset → Gemini normalisation disabled.
- `GEMINI_MODEL` — default `gemini-3.1-flash-lite`; same passthrough.

### Africa's Talking (SMS) — configured-but-stubbed; legacy
- `AT_*` — referenced in `dev-stack.md` as "`AT_*` in `.env`" for the stubbed `sendSMS` (real SMS provider not wired; AT SMS was dropped on dev/payments). No `AT_*` names are read in the dev/payments or main `src` tree (grep returns none). Treat as **legacy/optional** — keep only if a real SMS provider is re-introduced. Names are not pinned by code today.

> Legacy/absent on dev/payments (must NOT resurrect from `main`): there is **no** Flutterwave env (`FLW_*`/`FLUTTERWAVE_*`) — that payment stack was deleted and replaced by ioTec. `main`'s `ADMIN_SETTLE_KEY` (gating `/api/admin/settle`) is being **dropped** in favor of `requireRole('admin')`; do not carry it forward unless `settle` is ported before the auth rewire.

---

## 3. bet-code-worker (Node/Express service) — required env var NAMES by purpose

Reference file: **`bet-code-worker/.env.example`** (committed, safe). Live file: `bet-code-worker/.env` (exists; do NOT read).

### Auth / shared key
- `WORKER_API_KEY` — shared secret; **must equal** web's `BET_CODE_WORKER_KEY`. Sent by web as `x-worker-key`. ⚠️ **If empty, `/verify` auth is skipped (open)** — MUST be set in any non-local deploy.

### Server / concurrency
- `PORT` — listen port (default 8080).
- `MAX_CONCURRENT` (alias `MAX`) — in-process semaphore cap on simultaneous headless-Chrome scrapes (default 2). Note: root compose also references `WORKER_MAX_CONCURRENT` — reconcile which name the merged compose feeds the worker (the worker code reads `MAX_CONCURRENT`/`MAX`).
- `NAV_TIMEOUT_MS` — per-scrape navigation timeout (default 45000).

### Screenshots (debug PNGs served at `/shots`)
- `SCREENSHOT_DIR` — output dir (default `./screenshots`; named volume `screenshots:/app/screenshots`).
- `SCREENSHOT_TTL_HOURS` — prune age for old shots (default 48).
- `PUBLIC_BASE_URL` — absolute base for returned screenshot URLs when behind a TLS proxy; defaults to the request host. (Optional.)

### Puppeteer / Chromium
- `PUPPETEER_EXECUTABLE_PATH` — system chromium path (default `/usr/bin/chromium`; set by the Dockerfile).
- `PUPPETEER_SKIP_DOWNLOAD` — `true` in the Dockerfile (no bundled Chromium download; uses `puppeteer-core`).

### Gemini (optional LLM normalisation of scraped output)
- `GEMINI_API_KEY` — enables normalisation; unset → disabled. ⚠️ **Missing from `bet-code-worker/.env.example`** (it lives in `.env.local.example:40` + both compose files). Post-merge doc nit: add it to the worker's own example.
- `GEMINI_MODEL` — default `gemini-3.1-flash-lite`.
- `GEMINI_BASE_URL` — default Google Generative Language v1beta. (Read by `normalize.js`; not in any example file.)
- `GEMINI_TIMEOUT_MS` — abort timeout, default 20000. (Read by `normalize.js`; not in any example file.)

---

## 4. sync (curl) service — env it relies on

No application runtime; the `curlimages/curl` container reads only:
- `SYNC_INTERVAL` — loop period (default 300s).
- `SYNC_TOKEN` — sent as `x-sync-token` to both `/api/slips/sync-codes` and `/api/payments/reconcile`.

(It targets `http://web:3000`; it does NOT need worker, Supabase, or ioTec keys.)

---

## 5. Cross-service shared secrets (must match across `.env` files)

| Logical secret | Web name | Worker name | Bound how |
|---|---|---|---|
| Worker access key | `BET_CODE_WORKER_KEY` | `WORKER_API_KEY` | `x-worker-key` header — values must be identical |
| Sync token | `SYNC_TOKEN` | — (sync container reads it) | `x-sync-token` header on sync-codes + reconcile |
| Gemini key | `GEMINI_API_KEY` (compose passthrough) | `GEMINI_API_KEY` (actual consumer) | compose injects web's value into the worker |
| Gemini model | `GEMINI_MODEL` | `GEMINI_MODEL` | same passthrough |

---

## 6. Committed example files (safe to read) vs live files (do NOT read)

| File | Status | Should contain (NAMES) |
|---|---|---|
| `.env.local.example` | committed, safe | All web names in §2 except `RECONCILE_BATCH`, `SYNC_MAX_FAILED_RETRIES`, `IOTEC_CURRECY`, `AT_*` (those are code-read but absent from the example — gaps to close post-merge). Includes a stale "NOT Supabase Auth" header. |
| `bet-code-worker/.env.example` | committed, safe | `WORKER_API_KEY`, `PORT`, `MAX_CONCURRENT`, `NAV_TIMEOUT_MS`, `SCREENSHOT_DIR`, `SCREENSHOT_TTL_HOURS`, `PUBLIC_BASE_URL` (commented), `PUPPETEER_EXECUTABLE_PATH` (commented). **Missing: `GEMINI_API_KEY`/`GEMINI_MODEL`/`GEMINI_BASE_URL`/`GEMINI_TIMEOUT_MS`, `PUPPETEER_SKIP_DOWNLOAD`.** |
| `.env` | **exists, git-ignored — DO NOT READ** | Live web secret values for every §2 name. |
| `bet-code-worker/.env` | **exists, git-ignored — DO NOT READ** | Live worker secret values for every §3 name. |

---

## 7. Merge action items (env-related)

1. **Add `FOOTBALL_API_KEY` to the merged web env contract** — it is `main`'s Verifier-2 settlement key and is already in `.env.local.example:27`; ensure it is in the live `.env` and (if used) the web compose `environment`/`env_file`.
2. **Drop `ADMIN_PASSWORD`** (and `main`'s `ADMIN_SETTLE_KEY`) once admin is re-wired onto `requireRole('admin')`. They linger in the example + compose today.
3. **Do not introduce Flutterwave env** (`FLW_*`/`FLUTTERWAVE_*`) — that stack is deleted; ioTec is the only payment provider.
4. **Reconcile worker concurrency var name** — compose references `WORKER_MAX_CONCURRENT`; worker code reads `MAX_CONCURRENT`/`MAX`. Make the compose feed the name the worker actually reads.
5. **Close example-file gaps:** add `GEMINI_*` (and `PUPPETEER_SKIP_DOWNLOAD`) to `bet-code-worker/.env.example`; add `RECONCILE_BATCH`, `SYNC_MAX_FAILED_RETRIES`, `IOTEC_CURRECY` (with the typo) to `.env.local.example`.
6. **Keep the misspelling** `IOTEC_CURRECY` consistent between code and `.env` — renaming it to `IOTEC_CURRENCY` requires changing `src/lib/iotec.ts` in the same commit or collect breaks.
7. **`SYNC_CODES_ENABLED=false` in prod** (datacenter IP geo-block); run code-sync from a residential-IP stack against the same DB.
</content>
</invoke>
