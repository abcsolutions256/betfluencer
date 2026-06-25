# Merge Dossier — `main` → `stag`

Branch-merge dossier for folding the production branch **`main`** into a new staging
branch **`stag`** that is based on **`dev/payments`**. Audience: senior engineers
performing the merge. Snapshot: 2026-06-25.

> **Security:** every doc in this dossier lists env var / secret **NAMES ONLY** — never
> values. Live values live in `.env` (web) and `bet-code-worker/.env` (worker), both
> git-ignored. Do not read or print them. The committed `*.example` files are the safe
> reference.

---

## 1. Merge objective

Produce one unified app that keeps **every feature of both branches** — an **additive,
non-destructive** merge. Neither side loses a capability to dodge a conflict.

- **`dev/payments`** owns the modern **payments / auth / verification** shape: ioTec Pay
  (Mobile Money + card, collections + disbursements), Supabase Auth, the guest-buyer
  paywall, the bet-code worker (booking-code entry validation), and the formal
  `supabase/migrations/` toolchain.
- **`main`** is the **colleague's branch and the production DATA baseline.** Its live
  Supabase DB (project ref `sooutpsbdgqelnnnfezp`, hardcoded in `src/lib/supabase.ts`)
  holds real tipsters, slips, purchases, payments and earnings. `main` also owns the
  **football-API result settlement** path (`src/lib/footballApi.ts`, `api/verify`) and
  the screenshot/manual slip-entry flow (`api/parse-slip`, Claude Vision).

### Fixed owner decisions (do not relitigate)

1. **`main`'s DB holds REAL data → additive, non-destructive migrations only.** Backfill
   existing `main` users into `dev/payments`' Supabase Auth — **no data loss**.
2. **Settlement is UNIFIED (hard requirement).** A booking-code slip must be settle-able
   by `main`'s football-API verifier through the *same* `betslips` / `betslip_legs`
   model that screenshot/manual slips use.
3. **Auth is `dev/payments`' Supabase Auth, and only that.** `main`'s shared-password
   admin is re-wired onto it. Auth-dependent tables (`profiles`) are created **inside
   `main`'s DB** (the production project).
4. **Keep BOTH input methods** (screenshot + booking code) **and BOTH verifiers**
   (bet-worker entry-validation + football-API result settlement). Never drop a feature.

---

## 2. Branch & data lineage

| Axis | Source | Notes |
|---|---|---|
| **Code base / merge target** | `stag` is branched from **`dev/payments`** | Working tree `==` `stag` `==` `dev/payments`. `main` objects are read via `git show main:PATH` — `main`-only files (`src/lib/footballApi.ts`, `api/parse-slip`, `api/verify*`, `src/lib/adminAuth.ts`, `src/lib/schema.sql`) are **not** in this tree. |
| **Database baseline** | **`main`'s live DB** | `main` has **no `supabase/migrations/` folder** — its schema is hand-applied from `src/lib/schema.sql` + `src/lib/rls.sql`, which **drift** from the live DB (e.g. the `tipster_stats` view exists only in the live DB). The real baseline is the live DB, not the file. |
| **Migrations layered on top** | `dev/payments`' `supabase/migrations/*` (11 files, `0001`→`0010`) | Applied as **additive, non-destructive** migrations over `main`'s baseline. On live DB: `0001` applied; **`0002`–`0010` still pending.** |
| **Auth** | `dev/payments`' Supabase Auth (only) | `main`'s admin re-wires onto it; `profiles` table created inside `main`'s DB. |
| **Direction** | `main` is merged **into** `stag` | Where both branches define the same-named object, the unified object is the **superset**; `dev/payments` wins for the payments/auth shape, `main` contributes settlement columns + the data baseline. |

---

## 3. Dossier index

Top-level docs in `merge/` (one line each):

| Doc | What it covers |
|---|---|
| [`README.md`](./README.md) | This index + merge objective, lineage, status, and how to run the combined app locally. |
| [`changes.md`](./changes.md) | Running log of manual tweaks made *while performing* the merge. **Empty by design** until code-merge step **e** runs. |
| [`db-harmonization.md`](./db-harmonization.md) | The database-layer merge plan: harmonizing `main`'s baseline with `dev/payments`' additive migrations; unified `betslips`/`betslip_legs` settlement model; superset-object rules. |
| [`environments.md`](./environments.md) | Per-service runtime + env/secret **name** inventory (web, worker, sync); build-arg vs runtime split; cross-service shared secrets; example-file map. **Source for the local-run env setup below.** |
| [`dev-payments-memory.md`](./dev-payments-memory.md) | Consolidated reference for how the `dev/payments` branch (the merge base) works — stack, flows, owning libs, migrations. |
| [`dev-payments-bugs.md`](./dev-payments-bugs.md) | Pre-existing bugs in `dev/payments` (flagged, not fixed), sorted P0→low — incl. the P0 legacy-tipster `profile_id = NULL` login dead-end. |
| [`main-memory.md`](./main-memory.md) | How the `main` branch works — the production DATA baseline + the colleague's side; schema-drift ledger; settlement/admin/ranking/channels behaviour. |
| [`main-bugs.md`](./main-bugs.md) | Bugs found in `main` (flagged, not fixed), sorted by severity — incl. critical admin-auth holes (`/api/admin/settle`, forgeable admin token, hardcoded admin password). |

### Provenance notes — `merge/.analysis/`

Raw analysis-phase notes the docs above are derived from (read these when verifying a claim):

| Note | Scope |
|---|---|
| `dev-stack.md` | Authoritative `dev/payments` stack & infrastructure (runtimes, topology, Supabase usage, migrations, env inventory, gotchas). |
| `dev-payments.md` | ioTec live-payments provenance — files dev/payments owns, deleted Flutterwave/AT files, the full pay flow, tables/columns. |
| `dev-auth.md` | `dev/payments` Supabase Auth + session/role model. |
| `dev-admin.md` | `dev/payments` admin routes (already fix several of `main`'s column bugs). |
| `dev-betworker.md` | Bet-code worker (Puppeteer scraper) + adapters. |
| `dev-codeparse.md` | Booking-code parsing / `verifyCode` path. |
| `dev-schema.md` | `dev/payments` schema/migration shape. |
| `dev-tests.md` | Playwright e2e suite (the merge gate). |
| `main-admin.md` / `main-channels.md` / `main-ranking.md` / `main-schema.md` / `main-settlement.md` | `main`-side analysis: admin auth, channel pages, ranking, schema/drift, football-API settlement. |

> **Planned but not yet written:** `slip-lifecycle.md` (unified slip lifecycle across both
> input methods + both verifiers) and `auth-integration.md` (Supabase Auth backfill of
> `main` users + admin re-wire). Add their rows here when they land.

---

## 4. Current status

**Analysis complete (steps a–d). Code merge (step e) is PENDING owner review.**

- All branch-comparison analysis is done; the docs in §3 are authored from the
  `merge/.analysis/` notes.
- `changes.md` is intentionally **empty** — it is populated only once the code merge
  actually runs on `stag`.
- The merge itself has **not** run. No `main` code has been folded into `stag` yet; the
  working tree is still pristine `dev/payments`.
- Live-DB migration state: `0001` applied; **`0002`–`0010` not yet applied** to the
  production DB. Until `0010` lands, `sync-codes` + the `record_failed_verify` RPC error
  out and the sync loop silently no-ops.
- Open blockers carried into the merge: P0 legacy-tipster `profile_id = NULL` login
  dead-end (`dev-payments-bugs.md`) and `main`'s critical admin-auth holes
  (`main-bugs.md`) — the latter are superseded by decision #3 (Supabase Auth admin).

---

## 5. Run the combined app locally

Derived from `merge/.analysis/dev-stack.md` and [`environments.md`](./environments.md).
The stack is **3 services** wired by `docker-compose.yml` (dev). It is entirely
Node/TypeScript — **no Python venv anywhere**; the only non-Node tool is the Supabase CLI
for migrations.

| Service | Runtime | Port | Role |
|---|---|---|---|
| **web** (Next.js 14.2.3, App Router) | Node 24 (`node:24-bookworm-slim`) | **3000** (published in dev) | Public/tipster/admin pages + all API routes. Holds the Supabase service-role key + ioTec + Anthropic + football-API keys. |
| **bet-code-worker** (Express + `puppeteer-core`) | Node ≥24, ESM | **8080** (internal only) | Stateless headless-Chrome scraper. `POST /verify`, `GET /health`, `GET /shots/<file>`. Uses Debian `/usr/bin/chromium` (no bundled Chromium). |
| **sync** (`curlimages/curl`) | curl only | — | Every `SYNC_INTERVAL`s curls `POST web:3000/api/slips/sync-codes` **and** `POST web:3000/api/payments/reconcile` with `x-sync-token`. |

### 5a. Prerequisites

- Docker + Docker Compose.
- Node 24 (only if running `web` outside Docker via `npm run dev`).
- Supabase CLI (for migrations / local Supabase): `npm run db:*` scripts wrap it.
- `npx playwright install chromium` (only to run the e2e merge gate).

### 5b. Env setup

Full env/secret **name** inventory and the build-arg-vs-runtime split live in
[`environments.md`](./environments.md). Do **not** read or print `.env` /
`bet-code-worker/.env`. Copy from the committed examples and fill values:

```bash
cp .env.local.example .env                       # web
cp bet-code-worker/.env.example bet-code-worker/.env   # worker
```

Key points (names only — see `environments.md` for the complete list):

- **Web `NEXT_PUBLIC_*` are inlined at build time** → passed as Docker **build args**
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`).
  All other web secrets are **runtime env** via `env_file: .env`
  (`SUPABASE_SERVICE_ROLE_KEY`, the `IOTEC_*` keys, `ANTHROPIC_API_KEY`, the football-API
  key, `BET_CODE_WORKER_URL`, `BET_CODE_WORKER_KEY`, `SYNC_TOKEN`, `PLATFORM_COMMISSION`).
- **`PORT` pinning:** `web` pins `PORT=3000` in compose to override any `PORT` leaking via
  `.env` (the worker uses 8080). **Do not put a shared `PORT` in `.env`.**
- **`IOTEC_CURRECY`** (sic — misspelled, no "N") is the collect currency env name. It must
  be set with the same typo or `collect` sends an empty currency.
- **ioTec demo mode:** leave `IOTEC_CLIENT_ID` empty or `demo` for local dev — no real
  charges; collect/status/disburse short-circuit to deterministic success.
- **Cross-service shared secrets must match:** web's `BET_CODE_WORKER_KEY` == worker's
  `WORKER_API_KEY`; `SYNC_TOKEN` is shared by the sync loop and both
  `sync-codes` + `payments/reconcile`.
- **Worker normalisation (optional):** set `GEMINI_API_KEY` / `GEMINI_MODEL` on the worker
  to enable LLM normalisation of scraped output; unset `GEMINI_API_KEY` to disable.

### 5c. Supabase migrations

`dev/payments` owns the formal toolchain (`supabase/config.toml` + `supabase/migrations/`,
11 files `0001`→`0010`). Against `main`'s real DB these are applied **additively**.

```bash
npm run db:push     # supabase db push (alias: migrate) — apply pending migrations
npm run db:new      # scaffold a new migration
npm run db:reset     # reset local DB and replay migrations (LOCAL only)
npm run db:diff      # diff schema
npm run db:link      # link the CLI to a Supabase project
```

> On the live DB only `0001` is applied — `0002`–`0010` are pending (see §4). Apply them
> additively (never destructively) so `main`'s real data is preserved.

### 5d. Run all three services (Docker — canonical)

```bash
docker compose up --build      # web :3000 + worker :8080 + sync (bind-mounted, hot reload)
```

`sync` waits on web's healthcheck (`/api/health`, a no-DB liveness probe) before starting.
Open http://localhost:3000.

**Docker SWC gotcha:** `node_modules` + `.next` live in **named volumes** (not host mounts)
to keep the container's own linux SWC binary and avoid the macOS↔linux clash. If `web`
boot-loops (prints "✓ Starting…" then exits, SIGBUS on SWC load), the volume holds a stale
native binary that `npm install` won't replace. Fix:

```bash
docker compose down -v && docker compose up
```

Do this on any base-image or host-arch change.

### 5e. Run web alone (without Docker)

```bash
npm run dev       # next dev → http://localhost:3000
npm run build     # production build (standalone output)
npm run start     # serve the build
npm run lint      # next lint
```

> Any API route that hits the DB **must** `export const dynamic = 'force-dynamic'` — else
> `next build` prerenders it without the service-role key and the build fails with
> "supabaseKey is required".

### 5f. Run the bet-code worker alone

The worker scrapes bookie sites and is **IP geo-blocked from datacenter/cloud IPs** — it
(and code-sync) must run from a **local/residential IP**. In prod, `SYNC_CODES_ENABLED=false`.
Payment `reconcile` is unaffected. Locally it runs fine inside `docker compose up`.

### 5g. e2e merge gate

```bash
npm run test:e2e   # Playwright — bash scripts/e2e.sh
```

Boots LOCAL Supabase (`http://localhost:54321`) + ioTec **demo** mode, applies schema,
promotes a test admin, then runs 7 serial specs (home, tipster signup/login, manual-slip
→ verified, coded-slip → pending, guest purchase → reveal, admin hide, rankings). This is
the **merge gate** — it must be green before step e merges land. Prereq:
`npx playwright install chromium`.
