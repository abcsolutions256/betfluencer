# DB Harmonization — `main` baseline ← `dev/payments` (additive)

**Merge target:** `stag` (== `dev/payments`) merging `main`. This doc resolves the
database layer only. Audience: senior engineers executing the merge.

**Working tree == `stag` == `dev/payments`.** `main` objects cited via `git show main:PATH`.
`dev/payments` migrations are real files under `supabase/migrations/`.

## Fixed owner decisions (do not relitigate)

1. **`main`'s live DB holds REAL data.** Every migration is **additive / non-destructive**.
   Backfill existing `main` rows into `dev/payments`' Supabase Auth — **no data loss**.
2. **Settlement is UNIFIED.** A booking-code slip must be settle-able by `main`'s
   football-API verifier through the *same* `betslips` / `betslip_legs` model that
   screenshot/manual slips use.
3. **Auth is `dev/payments`' Supabase Auth, and only that.** `main`'s shared-password
   admin is re-wired onto it. Auth-dependent tables (`profiles`) are created **inside
   `main`'s DB** (the production project).
4. **Additive:** keep BOTH input methods (screenshot + booking code) and BOTH verifiers
   (bet-code worker entry-validation + football-API result settlement). Never drop a
   feature to dodge a conflict.

**Ownership rule applied throughout:** `dev/payments` owns the **payments/auth/verification
shape**; `main` owns the **schema baseline + result-settlement columns**. Where both
branches define the same-named object, the unified object is the **superset**.

---

## 1. Side-by-side schema map (main baseline vs dev/payments objects)

> Source of truth note: `main` has **NO `supabase/migrations/` directory** (confirmed:
> `git ls-tree -r --name-only main -- supabase/migrations` is empty). Its schema is the
> 182-line `main:src/lib/schema.sql` + `main:src/lib/rls.sql`, **plus undocumented live-DB
> drift** (`tipster_stats` view, `betslips.booking_code`/`betting_site`, widened
> `posting_mode` CHECK). `dev/payments`' authoritative source is `supabase/migrations/*`
> (11 files); its own `src/lib/schema.sql`/`rls.sql` are **stale** (reflect only 0001–0003)
> and must NOT be used as schema truth.

| Object | `main` baseline (schema.sql + live drift) | `dev/payments` (migrations) | Unified disposition |
|---|---|---|---|
| **tipsters** | id, name, username U, phone U, password_hash NOT NULL, description, sport, verified, tick_type CHECK, created_at | + `profile_id` FK→profiles, + `commission_rate` numeric(4,3), drops `password_hash` NOT NULL (0005) | **Superset.** dev columns appended; `password_hash` nullable. |
| **betslips** | + `result` CHECK(pending/win/loss), `result_proof_pending`, `result_image_url`; `total_odds`/`leg_count` **NOT NULL**; `posting_mode` CHECK(manual/screenshot[+booking_code live]); live `booking_code`/`betting_site` cols | nullable `total_odds`/`leg_count`; `posting_mode` CHECK incl. `booking_code`; + `verification_status`, `verified_at`, `game_count`, `leagues`, `markets`, `earliest_kickoff` (0005), `hidden` (0007), `verify_attempts` (0010); secret cols nulled + moved to `betslip_secrets` | **Superset, dev wins on constraints.** Keep `result*` (main settlement) AND `verification_status*`+proof (dev). NULLability from dev. |
| **betslip_legs** | id, betslip_id FK, match (free-text "Home vs Away"), league, pick, odds, match_time, result CHECK | **unchanged** by dev (0001 identical) | **Identical.** This is the UNIFIED leg model (see §2). |
| **slip_purchases** | status CHECK(active/refunded) default `active` | status CHECK(**pending**/active/refunded) default **pending** (0002); + `buyer_id` FK→auth.users (0005/0008), + `buyer_key` (0009) + unique indexes | **Superset, dev wins on status.** Keep both `buyer_id` + `buyer_key`. |
| **payments** | id, purchase_id, user_phone, tipster_id, gross/commission/tipster_amount, status CHECK, **flw_ref** (Flutterwave), payout_attempts, created_at | **unchanged** (still in 0001) but **UNUSED** by dev (superseded by `transactions`) | **Keep (non-destructive).** Holds real rows. `flw_ref` is legacy; do not resurrect Flutterwave code. |
| **earnings** | id, tipster_id, betslip_id, amount, gross, commission, plan, user_phone, created_at | **unchanged**; written by dev `logEarning` | **Identical.** |
| **platform_settings** | **absent** | key PK, value (0001); seeded `platform_commission='0.10'` (0005) | **Add (dev-only).** |
| **transactions** | **absent** (Flutterwave era) | full ioTec table + 4 idx + `set_updated_at` trigger + RLS (0002) | **Add (dev-only).** Replaces `payments` going forward. |
| **slip_verifications** | **absent** | worker scrape results + `normalized`/`summary`/`total_odds` (0004 + 0006) | **Add (dev-only).** |
| **betslip_secrets** | **absent** (secrets are live cols on betslips) | betslip_id PK, booking_code, betting_site, slip_image_url (0005); RLS service-role only | **Add (dev-only).** 0005 migrates secrets off `betslips`. |
| **profiles** | **absent** (no auth tables) | id PK→auth.users, role CHECK(user/tipster/admin), email, display_name (0005) | **Add (dev-only).** Requires `auth` schema (§4). |
| **tipster_rankings** (view) | defined in schema.sql; **not used by app** | identical (0001) | **Keep.** Superseded by `tipster_stats` but harmless. |
| **`tipster_stats`** (view) | **LIVE-DB ONLY — in NO tracked SQL on either branch.** App queries it (7 call-sites). Superset of `tipster_rankings`: adds `losses, slips_posted, roi, last5, slug, created_at` | absent from migrations too | **MUST recover live DDL into baseline 0000 (§5).** Rankings break without it. |
| **update_tipster_tick() + trigger** | schema.sql (AFTER UPDATE OF result ON betslips) | identical (0001) | **Keep.** Settlement writes to `betslips.result` fire it. |
| **6 RLS-enabled tables, permissive `using(true)`** | rls.sql (open policies) | **dev hardens** (0003): drops all open policies, finished-only public reads, service-role default-deny | **dev RLS wins** (see §3 collision). main's open policies leak `password_hash` + pending codes. |

---

## 2. The UNIFIED match/leg data model (serves BOTH inputs AND BOTH verifiers)

This is the crux requirement. The model must carry a slip authored by **screenshot**,
**manual**, or **booking_code**, and be gradable by **both** the bet-code worker
(verification) **and** the football-API settler (win/loss).

### 2.1 The seam

There are **two orthogonal status columns on `betslips`** — they must both survive and
never be conflated:

| Column | Owner | Domain | Meaning |
|---|---|---|---|
| `betslips.verification_status` | dev (0005) | `pending`/`verified`/`failed`/`rejected` | **Verifier 1 (entry validity).** Does the booking code resolve? Gates paywall visibility. |
| `betslips.result` | main settlement | `pending`/`win`/`loss` | **Verifier 2 (outcome).** Did the slip win? Drives ranking + ticks. |

A coded slip flows: posted → `verification_status='pending'` → worker confirms →
`verification_status='verified'` → (later, after kickoff) football-API → `result='win'|'loss'`.
Manual/screenshot slips are backfilled `verification_status='verified'` on the 0005 step
(no code to scrape → trusted) and settle the same way.

### 2.2 The shared leg table — `betslip_legs` (the single gradable leg model)

**`betslip_legs` is the unified leg model and is byte-identical on both branches.**
Football-API settlement (`main:src/lib/footballApi.ts` + `main:src/app/api/verify/route.ts`)
reads legs **only** from here. Exact shape (from `supabase/migrations/20260610000001_init.sql:42-50`,
identical to `main:src/lib/schema.sql`):

```
betslip_legs(
  id          uuid PK,
  betslip_id  uuid FK→betslips ON DELETE CASCADE,
  match       text NOT NULL,                 -- "Home vs Away" free-text (settler splits on /\s+vs\.?\s+/i)
  league      text default '',
  pick        text NOT NULL,                 -- settler's determineResult() parses this string
  odds        numeric(5,2) NOT NULL,
  match_time  timestamptz,                   -- drives the 2h/3h finish guards + free-tier date window
  result      text default 'pending' check (result in ('pending','win','loss'))
)
```

**How each input method lands legs here:**
- **manual / screenshot** → tipster (or admin) writes `betslip_legs` rows directly. Already works on `main`.
- **booking_code** → the bet-code worker scrapes selections into `slip_verifications.normalized`
  (`[{teams,homeTeam,awayTeam,market,marketLabel,pickSymbol,pickSide,pickTeam,line,odds,kickoff,kickoffRaw,summary}]`),
  and the **public proof** is reflected onto `betslips` (`game_count, markets, leagues, earliest_kickoff, total_odds`).

> **UNIFICATION ACTION (required for decision #2):** today, `recordVerification()`
> (`src/lib/verifyCode.ts:113`) writes scraped legs to `slip_verifications.normalized`
> **but does NOT populate `betslip_legs`.** The football-API settler skips slips with no
> `betslip_legs` rows (`main:.../verify/route.ts:30`). **So a code-entered slip currently
> cannot be settled.** To satisfy the hard requirement, the merge must add a projection
> step: after a successful scrape, **insert one `betslip_legs` row per normalized leg** with
> `match = "<homeTeam> vs <awayTeam>"`, `pick = <a string determineResult() understands>`
> (derive from `pickSymbol`/`marketLabel`), `odds = <leg odds>`, `match_time = <kickoff ISO>`.
> This is the single new join that makes both verifiers operate on one leg model. It is an
> **app-code change**, not a schema change — `betslip_legs` already has every column needed.

### 2.3 Optional high-value column: `betslip_legs.fixture_id`

`main:src/lib/footballApi.ts:110-114` has a **dead** preferred path (`getFixtureById` via
`leg.fixture_id`) that never runs because **no `fixture_id` column exists on either branch.**
Adding `betslip_legs.fixture_id bigint` (nullable) activates the reliable settlement path and
lets the worker pin the exact API-Football fixture. **Additive, non-destructive, optional** —
captured as migration **0013** below (off the critical path; safe to defer).

### 2.4 Enum widening for settlement: `'void'`

`main:src/app/api/admin/settle/route.ts` writes `result='void'`, but **neither branch's
CHECK allows it** (`('pending','win','loss')`) — a latent bug that fails the write. Since
admin manual settlement is being preserved (§ admin collision), the merge must widen the
CHECK on `betslips.result` AND `betslip_legs.result` to include `'void'`. Captured as
migration **0012** (additive — only widens a CHECK, never narrows).

### 2.5 Canonical enum inventory (post-merge, all CHECK constraints — no native PG enums)

| Column | Unified value set | Source / change |
|---|---|---|
| `tipsters.tick_type` | `earned`, `paid`, `null` | unchanged |
| `betslips.posting_mode` | `manual`, `screenshot`, `booking_code` | dev superset (main file lacked `booking_code`; live had it) |
| `betslips.result` | `pending`, `win`, `loss`, **`void`** | **widened by 0012** for admin/settle |
| `betslips.verification_status` | `pending`, `verified`, `failed`, `rejected` | dev-only (0005) |
| `betslip_legs.result` | `pending`, `win`, `loss`, **`void`** | **widened by 0012** |
| `slip_purchases.status` | `pending`, `active`, `refunded` | dev superset (default `pending`, 0002) |
| `payments.status` | `pending`, `confirmed`, `failed`, `refunded` | unchanged (legacy table) |
| `transactions.type` / `.method` / `.status` | `collection`/`disbursement` · `momo`/`card` · `pending`/`processing`/`success`/`failed`/`cancelled` | dev-only (0002) |
| `slip_verifications.status` | `scraped`, `failed`, `verified` | dev-only (0004) |
| `profiles.role` | `user`, `tipster`, `admin` | dev-only (0005) |

---

## 3. Collisions — same-named object, different shape

Each entry states the conflict and the resolution toward the unified model + ownership.

### C1 — `betslips`: NOT NULL vs nullable on `total_odds` / `leg_count`
- **Conflict:** `main` declares `total_odds`/`leg_count` **NOT NULL** (`main:src/lib/schema.sql:28-29`).
  `dev/payments` makes them **nullable, default dropped** (`20260610000001_init.sql:27-28`).
- **Why it matters:** a `booking_code` slip has no odds/legs until the worker scrapes it —
  NOT NULL is incompatible with the booking-code feature (decision #4).
- **Resolution:** **dev wins** (nullable). main owns the baseline, but dev owns the
  booking-code shape; the looser constraint is the superset and is non-destructive (existing
  non-null rows still satisfy it). Migration **0011** runs `ALTER COLUMN ... DROP NOT NULL`.

### C2 — `betslips`: secret columns location (`booking_code`/`betting_site`/`slip_image_url`)
- **Conflict:** on `main` (live DB) these are **columns on `betslips`** (the app inserts them
  at `api/tips/route.ts:29-30`). On `dev/payments` 0005 they are **moved into
  `betslip_secrets`** (service-role only) and the `betslips` copies are **NULLed**.
- **Why it matters:** keeping them on `betslips` re-leaks pending booking codes to the anon
  key (the whole point of the paywall hardening). Any `main` code reading these off `betslips`
  gets NULL post-merge.
- **Resolution:** **dev wins** (secrets live in `betslip_secrets`). The 0005 data-move step
  (`insert into betslip_secrets select ... from betslips where booking_code/slip_image_url present`)
  is the **non-destructive backfill** that preserves main's real secret data before nulling.
  Re-wire any preserved main reads (slip review/reveal) to read from `betslip_secrets`.

### C3 — `slip_purchases.status`: default + value set
- **Conflict:** `main` default `'active'`, CHECK `(active,refunded)`. `dev` default `'pending'`,
  CHECK `(pending,active,refunded)` (0002) — because a purchase row is created **before**
  payment confirms, then flipped to `active` on fulfillment.
- **Resolution:** **dev wins.** Superset value set + `pending` default. Existing `active`/`refunded`
  rows remain valid (non-destructive). Note: `slip_verifications`/`subscriber_count` consumers
  count `status='active'` — unchanged semantics for settled purchases.

### C4 — Identity: `tipsters.password_hash` + phone/bcrypt vs Supabase Auth `profiles`
- **Conflict:** `main` authenticates tipsters by `phone` + bcrypt `password_hash` (legacy
  `src/lib/auth.ts`). `dev` authenticates via Supabase Auth (`auth.users` + `profiles.role`)
  and links via `tipsters.profile_id`; it **drops `password_hash` NOT NULL** but **never
  backfills `profile_id`** → **P0 login dead-end** (`dev-auth.md §6`).
- **Resolution:** **dev auth wins** (decision #3). Keep `password_hash` as a nullable legacy
  column (non-destructive — preserves old hashes; don't drop the column). Add `profile_id`.
  **Backfill `profile_id` for every existing tipster** (§4) so `getMyTipster()` resolves.
  Domain ownership: dev owns auth shape; main's tipster *rows* (real data) are preserved and
  linked, not replaced.

### C5 — Admin tables / auth: shared-password token vs `profiles.role='admin'`
- **Conflict:** `main` admin = `ADMIN_PASSWORD` env + `x-admin-token` header
  (`main:src/lib/adminAuth.ts`, `/api/admin/login`); **no users table.** `dev` admin = a
  Supabase auth user with `profiles.role='admin'`, gated by `requireRole('admin')`.
- **DB resolution:** there is **no admin *table* collision** — `main` has no admin table at
  all; admin identity is just a `profiles` row at `role='admin'`. The collision is at the
  auth layer (handled in app code: drop `adminAuth.ts`, `/api/admin/login`, `ADMIN_PASSWORD`;
  re-wire main-only routes `pending-slips`/`settle` onto `requireRole('admin')`).
- **DB action:** none beyond `profiles` (already in 0005). **Provisioning:** no code path sets
  `role='admin'` — promote the real admin manually: `update profiles set role='admin' where id=<auth uid>`.
  Document this as a post-migration step (§4.4).

### C6 — Transactions / payments: `transactions` (ioTec) vs `payments` (Flutterwave)
- **Conflict:** `main`'s `payments` table (with `flw_ref`) is the live payment ledger.
  `dev` introduces `transactions` (ioTec) and **stops using `payments`** entirely.
- **Resolution:** **additive — keep BOTH tables.** `payments` holds real historical rows
  (non-destructive: do not drop). `transactions` is the new ledger (dev owns payments shape).
  Do **not** resurrect main's Flutterwave code (`webhooks/flutterwave`, `types/flutterwave.d.ts`,
  the old `payments.ts`) — those are app-layer deletions, not DB objects. `flw_ref` stays as a
  dormant legacy column.

### C7 — RLS posture: permissive `using(true)` vs hardened service-role-only
- **Conflict:** `main:src/lib/rls.sql` ships **open** policies (`using(true)`/`with check(true)`)
  on all 6 tables. `dev` 0003 **drops every open policy**, leaving only finished-slip public
  reads + service-role default-deny; 0005 adds `profiles`/`slip_purchases`/`betslips` auth
  policies.
- **Resolution:** **dev RLS wins.** main's open policies leak `password_hash` (tipsters) and
  pending booking codes (betslips) to the anon key. Dropping them is intentional and
  non-destructive to *data* (RLS governs access, not rows). The 0003 drops are written
  `drop policy if exists` so they no-op if the policy is absent — safe to replay on main's DB.

### C8 — Ranking view: `tipster_rankings` (tracked) vs `tipster_stats` (live-only)
- **Conflict:** both branches define `tipster_rankings` identically, but **the app actually
  queries `tipster_stats`**, a *superset* view that exists **only in the live DB** (in no
  tracked SQL on either branch). It adds `losses, slips_posted, roi, last5, slug, created_at`.
- **Resolution:** **recover the live `tipster_stats` DDL** and capture it in baseline **0000**
  (it is main's most fragile undocumented dependency). Keep `tipster_rankings` too (harmless).
  No shape conflict to resolve — just a recovery obligation.

### C9 — `slip_verifications.status` `'verified'` vs `betslips.verification_status` `'verified'`
- **Not a true collision, flagged to prevent one:** two different columns share the value
  `'verified'` but on different tables with different domains (`slip_verifications` = scrape
  lifecycle; `betslips` = entry validity). Keep both; do not merge them.

---

## 4. Auth-table reconciliation — Supabase Auth created INSIDE main's DB

Supabase Auth (`auth.users` + the `auth` schema) is a **hard prerequisite** for migration
0005 and everything after: `profiles.id` FKs `auth.users(id)`; `handle_new_user()` triggers
`after insert on auth.users`; `slip_purchases.buyer_id` FKs `auth.users(id)`; RLS uses
`auth.uid()`. Because the merged app runs against **main's production DB**, Supabase Auth
must be **enabled on main's project** (it already is in dev's `config.toml:63-64`
`[auth] enabled = true`). No `auth.*` tables are hand-created — they are provisioned by
Supabase when Auth is turned on for the project.

### 4.1 Order of operations (non-destructive)
1. **Enable Supabase Auth** on main's project (provisions the `auth` schema) **before**
   applying any migration that references `auth.users`. Without it, 0005 fails at the
   `profiles` FK.
2. Apply baseline **0000** (main's current live schema — §5), so all real rows exist.
3. Apply the appended dev migrations **0001→0010** in order (which create `profiles`,
   `betslip_secrets`, the auth columns, and the `handle_new_user` trigger).
4. Run the **backfill migration 0014** (below) to bind existing rows to auth.

### 4.2 Backfilling existing main users into the auth model (real data preserved)
The migrations **add** `tipsters.profile_id`/`slip_purchases.buyer_id` but **never backfill**
them — this is the documented **P0** (`dev-auth.md §6`). Approach:

- **Tipsters (must be linked or login dead-ends):** for each existing `tipsters` row
  (the 4 seeded `Enzo Kampala`/`Nairobi King`/`StatAttack`/`BetWise UG` plus any real
  tipster created on main), **create a Supabase auth user** (email-based; seeded tipsters
  have no email → synthesize `username@…` placeholders or mark display-only) and set
  `tipsters.profile_id = <that auth uid>`. `handle_new_user()` auto-creates the `profiles`
  row at `role='user'`; then `update profiles set role='tipster'` for each. This is the
  backfill the migration omitted. Provide it as an explicit data migration or an admin
  "claim/link" flow (bind an existing `tipsters` row to the logged-in user's `profile_id`).
- **Buyers:** `slip_purchases.buyer_id` is intentionally **nullable** and stays NULL for
  legacy/guest purchases — guests are now identified by `buyer_key` (0009), not auth. **No
  buyer backfill needed**; legacy NULL `buyer_id` rows remain valid under Postgres
  `NULLS DISTINCT` on the unique index.
- **Payments/earnings/transactions:** identity is `user_phone`/`buyer_key` — **no auth link**,
  nothing to backfill.

### 4.3 Hardening required alongside the backfill (app-code, not schema)
- `getMyTipster()` (`src/lib/auth/session.ts:50`) uses `.single()` → **throws** on 0 rows.
  Change to `.maybeSingle()` so an unlinked legacy tipster degrades to null instead of 500.
- Tipster dashboard "Sign out" only clears a stale localStorage key — wire it to
  `POST /api/auth/logout`. (Lower severity; from `dev-auth.md §7`.)

### 4.4 Admin provisioning (no code path exists)
After migrations, **manually** promote the real admin:
`update profiles set role='admin' where id = <admin auth uid>`. Document it; `main`'s shared
`ADMIN_PASSWORD` is deleted with `adminAuth.ts`.

---

## 5. Ordered additive migration plan (append to main's trunk)

**Principle:** do **NOT interleave** the two histories. Capture main's current state as a
single baseline `0000`, then re-express every `dev/payments` object as **fresh, sequentially
appended** migrations. Every migration below is **additive / non-destructive** (uses
`if not exists` / `if exists` / `drop policy if exists` so it is safe to replay against the
live DB).

> Numbering note: the existing dev files keep their `2026…` timestamps on disk; the `00NN`
> labels below are the **logical apply order** for this dossier. The two dev files internally
> titled out of sync (`20260622120000` says "0006") are noted but harmless.

| # | Migration | Purpose | Non-destructive? |
|---|---|---|---|
| **0000** | `0000_main_baseline.sql` | **Reconstruct main's CURRENT LIVE schema** — the real DATA baseline (main has no migration history). Must include: 6 core tables (tipsters, betslips, betslip_legs, slip_purchases, payments, earnings) **with the live drift**: `betslips.booking_code`/`betting_site` columns, `posting_mode` CHECK incl. `booking_code`; `update_tipster_tick()` + `tipster_tick_trigger`; **BOTH** views — `tipster_rankings` (tracked) **and the recovered live `tipster_stats`** (with `losses, slips_posted, roi, last5, slug, created_at`); all 5 indexes; all RLS policies. **`tipster_stats` DDL must be dumped from the live DB — it is in no repo file (§ C8).** | Yes — `create table if not exists`; describes existing objects only. |
| **0001** | `0001_platform_settings.sql` | Add `platform_settings(key PK, value)` (dev-only; main lacks it). | Yes |
| **0002** | `0002_transactions.sql` | Add `transactions` (ioTec) + 4 indexes + `set_updated_at()` + trigger + RLS; loosen `slip_purchases.status` to `(pending,active,refunded)` default `pending` (C3). | Yes — new table; CHECK widened, not narrowed. |
| **0003** | `0003_lock_pending_content.sql` | RLS hardening: drop main's permissive `using(true)` policies; add finished-only public reads on betslips/legs; enable RLS, default-deny elsewhere (C7). | Yes — `drop policy if exists` no-ops if absent; governs access, not rows. |
| **0004** | `0004_slip_verifications.sql` | Add `slip_verifications` (worker scrape results) + unique idx on `betslip_id` + idx on `booking_code` + RLS service-role-only. | Yes |
| **0005** | `0005_auth_paywall_overhaul.sql` | **Requires `auth` schema enabled first (§4.1).** Add `profiles` (→auth.users) + `handle_new_user()` trigger; `tipsters.profile_id`/`commission_rate`, drop `password_hash` NOT NULL; `betslips` proof cols (`verification_status`, `verified_at`, `game_count`, `leagues`, `markets`, `earliest_kickoff`); **add `betslip_secrets` and MOVE secrets off `betslips` then NULL them** (C2 backfill); `slip_purchases.buyer_id`; RLS rewrite (`betslips_verified_public`, `purchases_owner_read`, `profiles_self_*`); seed `platform_commission`. | Yes — data-move is copy-then-null (preserves data in `betslip_secrets`); all `add column if not exists`. |
| **0006** | `0006_normalized_verification.sql` | Add `slip_verifications.normalized jsonb`, `summary`, `total_odds`. | Yes |
| **0007** | `0007_admin_hide_flag.sql` | Add `betslips.hidden` + partial index `where hidden`. | Yes |
| **0008** | `0008_fix_slip_purchases_buyer.sql` | Idempotent re-apply of `buyer_id` + unique `(betslip_id,buyer_id)` (covers DBs where 0005 partially applied). | Yes |
| **0009** | `0009_guest_buyer_key.sql` | Add `slip_purchases.buyer_key` + index + unique `(betslip_id,buyer_key)` (guest buyers). | Yes |
| **0010** | `0010_skip_verified_sync.sql` | Add `betslips.verify_attempts` + partial retry index + `record_failed_verify()` SQL fn. | Yes |
| **0011** | `0011_betslips_nullable_odds_legs.sql` | **NEW (collision C1).** `ALTER betslips ALTER COLUMN total_odds DROP NOT NULL; ... leg_count DROP NOT NULL;` so booking-code slips (no odds/legs yet) are insertable. *Note: dev's `0001` already declares these nullable; this explicit migration is required only because baseline `0000` reconstructs main's NOT NULL live shape. If `0000` is authored to already match the nullable end-state, fold 0011 into it.* | Yes — loosens a constraint; existing rows still satisfy it. |
| **0012** | `0012_add_void_result.sql` | **NEW (§2.4, settlement).** Widen `betslips.result` and `betslip_legs.result` CHECK to include `'void'` so `POST /api/admin/settle` can write it. | Yes — CHECK widened only. |
| **0013** | `0013_legs_fixture_id.sql` | **NEW, OPTIONAL (§2.3).** Add `betslip_legs.fixture_id bigint` (nullable) to activate the football-API `getFixtureById` fast path. Defer if not wiring the worker→fixture link now. | Yes — nullable add. |
| **0014** | `0014_backfill_auth_links.sql` | **NEW (§4.2, the P0 fix).** Data migration: for each existing `tipsters` row create/locate a Supabase auth user, set `tipsters.profile_id`, and `update profiles set role='tipster'`. (Buyers need no backfill — guest `buyer_key`.) Provision the admin via `role='admin'` (or document as a manual step). | Yes — only writes `profile_id`/`role`; touches no other data. |

### Notes on the dummy migration
The stray `supabase/migrations/20260611075122_test.sql` is **0 bytes (a no-op test artifact)**.
**Do not carry it into the merged set.** If the linked DB already recorded version
`20260611075122`, delete the file then run `supabase migration repair` rather than silently
removing it (avoids a "missing migration" warning on the next push/diff).

### Post-merge cleanup (track, non-blocking)
- Regenerate or delete `src/lib/schema.sql` + `src/lib/rls.sql` on **both** branches — they
  are stale (dev's reflects only 0001–0003; main's lacks live drift). Treat migrations as the
  only schema truth post-merge.
- `transactions_service_only` uses `for all using(true)` — under RLS this is **permissive to
  all roles** (it works only because the anon key never queries `transactions` in practice).
  Flag for security review; likely should be no-policy (default-deny) like `payments`/`earnings`.
- `payments` table + `flw_ref` are dormant legacy — keep (real rows) but mark unused.

---

## 6. One-paragraph summary

main's live DB is the **data baseline**, captured as a reconstructed `0000` that **must**
include the undocumented live drift (`tipster_stats` view, `betslips.booking_code`/`betting_site`,
widened `posting_mode`). On top of it, `dev/payments`' eleven migrations are **re-appended in
order as 0001–0010** (platform_settings, ioTec `transactions`, RLS hardening, `slip_verifications`,
the Supabase-Auth/paywall overhaul with `profiles`+`betslip_secrets`, normalized verification,
admin hide flag, buyer-link fixes, guest `buyer_key`, skip-verified sync), then **four new
additive migrations** unique to the merge: **0011** (drop NOT NULL on `betslips.total_odds`/`leg_count`
for booking-code slips), **0012** (widen `result` CHECK to allow `'void'` so admin settlement
works), **0013** (optional `betslip_legs.fixture_id` for reliable football-API matching), and
**0014** (the P0 backfill binding existing tipsters to Supabase Auth `profiles`). The **unified
leg model is `betslip_legs`** — identical on both branches and the single table both verifiers
read — with the one required app-code addition of **projecting scraped/normalized legs into
`betslip_legs`** so code-entered slips become settle-able by the football-API verifier
exactly like screenshot/manual slips. Auth is `dev/payments`' Supabase Auth, created inside
main's DB by enabling the project's `auth` schema before 0005; existing tipster rows are
preserved and **linked** (not replaced) via the 0014 `profile_id` backfill, and the admin is
provisioned by setting `profiles.role='admin'`.
