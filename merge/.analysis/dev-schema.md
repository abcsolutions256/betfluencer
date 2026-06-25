# dev/payments — DB Migrations / Schema Object Inventory

Provenance analysis for the additive merge of `dev/payments` onto `main`'s DB baseline.
Scope: everything under `supabase/`, plus dev's `src/lib/schema.sql` + `src/lib/rls.sql`.
**No schema object may be lost in the merge.** Every object below is referenced by dev code (verified via `git grep` against `dev/payments`).

---

## 0. CRITICAL ORIENTATION — two parallel sources of schema truth

dev/payments ships TWO descriptions of the DB that are **NOT in sync with each other**:

1. **`supabase/migrations/*.sql`** — the authoritative, versioned source of truth. 11 files. Contains the FULL evolution: ioTec transactions, Supabase Auth (`profiles`), `betslip_secrets`, `slip_verifications`, normalized verification, admin hide flag, guest buyers, skip-verified sync.
2. **`src/lib/schema.sql` + `src/lib/rls.sql`** — a "single full-schema reference" (per `supabase/README.md` line 11). It is **STALE**: it only reflects migrations 0001–0003 (init + transactions + lock-pending RLS). It is **missing** every object introduced by 0004 onward: `slip_verifications`, `profiles`, `betslip_secrets`, the auth columns, normalized columns, `hidden`, `buyer_id`, `buyer_key`, `verify_attempts`, `record_failed_verify`, the auth/guest indexes, and the post-0003 RLS rewrites.

> **Merge implication:** The migrations are the source of truth. `src/lib/schema.sql`/`rls.sql` must NOT be trusted as the schema during harmonization — if anything, after merge they should be regenerated or deleted to avoid drift. Do not let a "schema.sql says X" argument override the migrations.

### main vs dev baseline divergence (from `git diff main dev/payments -- src/lib/schema.sql src/lib/rls.sql`)
main has NO `supabase/migrations/` directory at all (confirmed: `git ls-tree -r --name-only main -- supabase/migrations` is empty). The migrations are entirely a dev/payments contribution. The shared baseline files diverge as follows:

**schema.sql — dev adds on top of main:**
- `betslips.posting_mode` check gains `'booking_code'` (main: only `'manual','screenshot'`).
- `betslips.total_odds` made nullable (main: `not null`); `betslips.leg_count` made nullable, default dropped (main: `not null default 1`).
- `betslips.betting_site` + `betslips.booking_code` columns ADDED.
- `slip_purchases.status` gains `'pending'` and default flips `active`→`pending` (main: `default 'active' check (active,refunded)`).
- `platform_settings` table ADDED.
- `transactions` table + 4 indexes + `set_updated_at()` fn + trigger + RLS ADDED.

**rls.sql — dev rewrites main's permissive policies:** main shipped `using(true)`/`with check(true)` open policies (`tipsters_public_read`, `betslips_pending_service`, `betslips_service_insert/update`, `legs_public_read`, `legs_service_write/update`, `purchases_own_read`, `purchases_service_insert/update`, `payments_service_only`, `earnings_service_only`). dev REMOVES all of them, leaving only `betslips_finished_public` + `legs_finished_public` (parent-finished), enabling RLS on `platform_settings`, and making everything else service-role-only (no policy = deny). This is migration 0003's hardening reflected back into the reference file.

> **Merge conflict risk:** main's `betslips` NOT NULL constraints on `total_odds`/`leg_count` are INCOMPATIBLE with booking-code slips (which have no odds/legs until scraped). dev's nullable version MUST win. Likewise main's permissive RLS MUST be dropped — keeping it re-leaks pending booking codes / password_hash to the anon key.

---

## 1. Migration file roster (timestamp order = apply order)

| # | File | Net new objects |
|---|---|---|
| 0001 | `20260610000001_init.sql` | baseline: 7 tables, 5 indexes, `update_tipster_tick()` fn + trigger, `tipster_rankings` view, seed |
| 0002 | `20260610000002_transactions.sql` | `transactions` table + 4 idx + `set_updated_at()` + trigger + RLS; loosens `slip_purchases.status` |
| 0003 | `20260610000003_lock_pending_content.sql` | RLS hardening (drops open policies, adds finished-only reads) |
| 0004 | `20260610000004_slip_verifications.sql` | `slip_verifications` table + 2 idx + RLS |
| — | `20260611075122_test.sql` | **EMPTY (0 bytes) — DUMMY. See §7.** |
| 0005 | `20260612120000_auth_paywall_overhaul.sql` | `profiles`, `betslip_secrets`, `handle_new_user()`+auth trigger, tipster/betslip/slip_purchases columns, RLS rewrite |
| 0006 | `20260622120000_normalized_verification.sql` | `slip_verifications.normalized/summary/total_odds` cols |
| 0007 | `20260622130000_admin_hide_flag.sql` | `betslips.hidden` col + partial idx |
| 0008 | `20260623090000_fix_slip_purchases_buyer.sql` | re-applies 0005's `buyer_id` col + indexes (idempotent backfill) |
| 0009 | `20260623100000_guest_buyer_key.sql` | `slip_purchases.buyer_key` col + 2 idx |
| 0010 | `20260625120000_skip_verified_sync.sql` | `betslips.verify_attempts` col + idx + `record_failed_verify()` fn |

> Note: filename timestamps make `20260611075122_test.sql` sort AFTER 0004 but BEFORE 0005. It is the 5th file applied. The README only documents 0001–0003 (its table stops there) — 0004–0010 are undocumented in README.

---

## 2. TABLES — complete column inventory (by feature)

### 2A. CORE (main baseline, migration 0001) — dev depends on these but does not own them
- **`tipsters`** (id, name, username UNIQUE, phone UNIQUE, password_hash, description, sport, verified, tick_type CHECK(earned/paid/null), created_at). dev MODIFIES (see 2E): adds `profile_id`, `commission_rate`; drops `password_hash` NOT NULL.
- **`betslips`** (id, tipster_id FK→tipsters CASCADE, posting_mode CHECK, total_odds, leg_count, result CHECK(pending/win/loss), slip_price, note, slip_image_url, result_image_url, result_proof_pending, posted_at). dev MODIFIES heavily (see 2E).
- **`betslip_legs`** (id, betslip_id FK→betslips CASCADE, match, league, pick, odds, match_time, result CHECK). Unchanged by dev. (RLS-gated: public only when parent finished.)
- **`slip_purchases`** (id, betslip_id FK CASCADE, tipster_id FK, user_phone, user_name, amount_paid, status, purchased_at). dev MODIFIES (see 2E).
- **`payments`** (id, purchase_id FK→slip_purchases, user_phone, tipster_id FK, gross_amount, commission_amount, tipster_amount, status CHECK(pending/confirmed/failed/refunded), flw_ref, payout_attempts, created_at). Unchanged by dev migrations. NOTE `flw_ref` = legacy Flutterwave field name; ioTec uses `transactions` instead.
- **`earnings`** (id, tipster_id FK CASCADE, betslip_id FK, amount, gross, commission, plan, user_phone, created_at). Unchanged.
- **`platform_settings`** (key PK, value). Present in dev's schema.sql (main lacks it). Seeded with `platform_commission='0.10'` by 0005.

### 2B. PAYMENTS / ioTec (migration 0002) — `transactions`
`transactions` ( id PK, **iotec_id** text UNIQUE (= ioTec collection id / status requestId), **external_id** text UNIQUE NOT NULL (our reconciliation ref), **type** default 'collection' CHECK(collection/disbursement), **method** CHECK(momo/card), **category** default 'MobileMoney', **purpose** default 'slip_purchase', betslip_id FK→betslips SET NULL, tipster_id FK→tipsters SET NULL, slip_purchase_id FK→slip_purchases SET NULL, user_phone, user_email, payer, amount NOT NULL, currency default 'UGX', **status** default 'pending' CHECK(pending/processing/success/failed/cancelled), iotec_status, status_message, card_redirect_url, transaction_charge numeric(12,2), raw jsonb, created_at, updated_at ).
- Indexes: `idx_transactions_external`, `idx_transactions_iotec`, `idx_transactions_status` (status, created_at desc), `idx_transactions_betslip`.
- Referenced by ioTec collection/disbursement, reconcile, webhook flows.

### 2C. BET WORKER / CODE VERIFICATION (migrations 0004 + 0006) — `slip_verifications`
`slip_verifications` ( id PK, betslip_id FK→betslips CASCADE (optional link), betting_site, **booking_code** NOT NULL, **matches** jsonb default '[]' ([{teams,league,market,pick,kickoff}]), raw_text, screenshot_url, match_count int, **found** bool, **status** default 'scraped' CHECK(scraped/failed/verified), error, scraped_at ).
- **0006 adds:** `normalized` jsonb default '[]' (Gemini-normalised legs — the secret picks), `summary` text, `total_odds` numeric.
- Indexes: `uniq_slip_verif_betslip` UNIQUE on (betslip_id) — one current verification per slip, upserted; `idx_slip_verif_code` on (booking_code).
- RLS enabled, **no policy → service-role only** (never read by anon). Code: `src/lib/verifyCode.ts`, `src/app/api/slips/{sync-codes,verify-code,[id]/reveal}/route.ts`, `src/app/api/tipster/[slug]/slips/route.ts`.

### 2D. AUTH (migration 0005) — `profiles` + `betslip_secrets`
- **`profiles`** ( id uuid PK **references auth.users(id) CASCADE**, **role** text default 'user' CHECK(user/tipster/admin), email, display_name, created_at ). One row per Supabase Auth user; carries the role. Code: `src/lib/auth/session.ts` (`getProfile`, `requireRole` — admin always passes), `src/app/api/admin/me/route.ts`, `src/app/api/tipster/register/route.ts`.
  - **DEPENDS ON the `auth` schema (Supabase Auth).** FK to `auth.users`. This is a hard dependency — migration 0005 fails if Auth isn't provisioned.
- **`betslip_secrets`** ( betslip_id uuid PK references betslips CASCADE, booking_code, betting_site, slip_image_url ). Post-purchase content isolated into its own table so secrets never sit as columns on `betslips` (can't leak via a betslips select). RLS enabled, **no policy → service-role only**. 0005 MIGRATES existing secrets out of `betslips` then NULLs `betslips.{booking_code,betting_site,slip_image_url}`. Code: `src/app/api/slips/{reveal,route,sync-codes}`, `src/app/api/tips/route.ts`, `src/app/api/tipster/[slug]/slips/route.ts`.

### 2E. COLUMN ADDITIONS to existing tables (migrations 0005, 0007, 0008, 0009, 0010)

**`tipsters`** (0005):
- `profile_id` uuid references profiles(id) SET NULL; UNIQUE idx `uniq_tipsters_profile`.
- `commission_rate` numeric(4,3) (null = use global default). Code: `src/app/api/admin/tipsters/route.ts`, `src/lib/fulfillment.ts`.
- `password_hash` **NOT NULL dropped** (auth moved to Supabase Auth).

**`betslips`** (0005 unless noted):
- `verification_status` text NOT NULL default 'pending' CHECK(pending/verified/failed/rejected). Widely used (admin, slips, payments, subscribe, tips, tipster dashboard).
- `verified_at` timestamptz.
- `game_count` int; `leagues` jsonb default '[]'; `markets` jsonb default '[]'; `earliest_kickoff` timestamptz — PUBLIC PROOF (no secret). Derived from `slip_verifications.normalized`.
- 0005 backfill: manual/screenshot slips set `verification_status='verified'` (no code to scrape → trusted).
- `hidden` boolean NOT NULL default false (0007) + partial idx `idx_betslips_hidden ... where hidden`. Admin manual-hide. Code: `src/lib/slipStatus.ts`, `src/app/api/{admin/slips,slips,tipster/[slug]/slips}/route.ts`.
- `verify_attempts` int NOT NULL default 0 (0010) + idx `idx_betslips_verify_retry (verification_status, verify_attempts) where result='pending'`. Poller retry budget. Code: `src/app/api/slips/sync-codes/route.ts`, `src/lib/verifyCode.ts`.

**`slip_purchases`** (0005, re-applied 0008, extended 0009):
- `buyer_id` uuid references **auth.users(id)** SET NULL (0005); idx `idx_slip_purchases_buyer`; UNIQUE `uniq_purchase_betslip_buyer` on (betslip_id, buyer_id) — upsert target for the purchase flow.
- `buyer_key` text (0009) — guest/localStorage identity ("bf_guest" → x-buyer-key header); idx `idx_slip_purchases_buyer_key`; UNIQUE `uniq_purchase_betslip_buyerkey` on (betslip_id, buyer_key). Code: `src/app/api/payments/initiate/route.ts`, `src/app/api/slips/[id]/reveal/route.ts`, `src/app/api/subscribe/route.ts`.
- **AUTH EVOLUTION NOTE:** buyer identity moved auth.users (`buyer_id`, 0005) → guest localStorage key (`buyer_key`, 0009). Both columns coexist; `buyer_id` kept nullable for legacy logged-in purchases. Aligns with MEMORY's "guest buyers" + "P0 tipster-login (legacy profile_id NULL)".

---

## 3. ENUMS (all are CHECK constraints — no native PG enum types)
- `tipsters.tick_type` ∈ {earned, paid, null}
- `betslips.posting_mode` ∈ {manual, screenshot, **booking_code**} (booking_code is dev-only)
- `betslips.result` ∈ {pending, win, loss}
- `betslips.verification_status` ∈ {pending, verified, failed, rejected} (0005, dev-only)
- `betslip_legs.result` ∈ {pending, win, loss}
- `slip_purchases.status` ∈ {**pending**, active, refunded} (pending is dev-only; default flipped active→pending in 0002)
- `payments.status` ∈ {pending, confirmed, failed, refunded}
- `transactions.type` ∈ {collection, disbursement}; `.method` ∈ {momo, card}; `.status` ∈ {pending, processing, success, failed, cancelled} (0002, dev-only)
- `slip_verifications.status` ∈ {scraped, failed, verified} (0004, dev-only)
- `profiles.role` ∈ {user, tipster, admin} (0005, dev-only)

---

## 4. FUNCTIONS & TRIGGERS
| Object | Migration | Notes |
|---|---|---|
| `update_tipster_tick()` + trigger `tipster_tick_trigger` (AFTER UPDATE OF result ON betslips) | 0001 (main baseline) | auto-tick earned/paid logic |
| `set_updated_at()` + trigger `transactions_set_updated_at` (BEFORE UPDATE ON transactions) | 0002 | keeps updated_at fresh |
| `handle_new_user()` (SECURITY DEFINER, search_path=public) + trigger `on_auth_user_created` (AFTER INSERT ON **auth.users**) | 0005 | auto-creates `profiles` row on signup; reads `raw_user_meta_data->>'display_name'` |
| `record_failed_verify(p_betslip_id uuid) returns int` (LANGUAGE sql) | 0010 | atomically bumps `verify_attempts` + flips pending→failed (never touches verified/rejected); returns new count. Code: `src/lib/verifyCode.ts` |

> `handle_new_user` triggers on `auth.users` — a cross-schema dependency on Supabase Auth.

---

## 5. VIEWS
- **`tipster_rankings`** (0001, main baseline) — id, name, username, description, sport, verified, tick_type, subscriber_count (count active slip_purchases), wins_last_10, avg_odds (7-day win avg), score (wins×avg). `order by score desc`. dev does NOT modify it. (Public tipster info is exposed via this view, never the raw `tipsters` table.)

---

## 6. RLS POLICIES — final state after all migrations (by table)
| Table | RLS | Policies (final) |
|---|---|---|
| `tipsters` | ON | none → service-role only (holds password_hash) |
| `betslips` | ON | `betslips_verified_public` SELECT using `verification_status='verified' OR result IN (win,loss)` (0005 replaces 0003's `betslips_finished_public`). No write policies. |
| `betslip_legs` | ON | `legs_finished_public` SELECT — parent slip finished (win/loss) |
| `slip_purchases` | ON | `purchases_owner_read` SELECT using `buyer_id = auth.uid()` (0005 replaces `purchases_own_read`). No write policies. |
| `payments` | ON | none → service-role only |
| `earnings` | ON | none → service-role only |
| `platform_settings` | ON (rls.sql) | none → service-role only |
| `transactions` | ON (0002) | `transactions_service_only` FOR ALL using(true). **⚠️ See risk below.** |
| `slip_verifications` | ON (0004) | none → service-role only |
| `profiles` | ON (0005) | `profiles_self_read` SELECT using `id=auth.uid()`; `profiles_self_update` UPDATE using `id=auth.uid()` |
| `betslip_secrets` | ON (0005) | none → service-role only |

**RLS evolution / conflict notes for harmonization:**
- 0003 dropped main's permissive `using(true)` policies on betslips/legs/purchases/payments/earnings/tipsters and added finished-only reads. dev's `rls.sql` mirrors this end-state. main's `rls.sql` still has the OPEN policies — **main's rls.sql must NOT win the merge.**
- 0005 supersedes 0003's `betslips_finished_public` with `betslips_verified_public` (broadens public reads to verified slips, which carry only proof columns — secrets are in `betslip_secrets`). The migration drops both old policy names defensively.
- `transactions_service_only` uses `for all using(true)` — under RLS this grants ALL roles (incl. anon) full access to `transactions` (financial data + buyer phones). It works as "service-role only" ONLY because the anon key is never used to query `transactions` in practice, but the policy itself is permissive. **FLAG for security review during harmonization** — contradicts the rls.sql doctrine ("⚠️ Do NOT add using(true) policies"). Likely should be no-policy (deny) like payments/earnings.

---

## 7. ⚠️ DUMMY MIGRATION — `20260611075122_test.sql`
- **0 bytes, empty.** Originally named `a` (per task brief — renamed to `_test`).
- Sorts as the 5th migration (between 0004 and 0005) by timestamp.
- No-op: applies nothing, but Supabase records it in `schema_migrations` so the version slot is consumed.
- **Recommendation for harmonization:** DELETE it (it is a stray test artifact, contributes no schema). If the live/linked DB has already recorded version `20260611075122`, deleting the file may cause a "missing migration" warning on the next `supabase db push`/`diff` — handle with `supabase migration repair` rather than silently removing. Do NOT carry it into the merged migration set as-is without a decision.

---

## 8. CROSS-FEATURE DEPENDENCIES & MERGE RISKS (summary for db-harmonization)
1. **Supabase Auth (`auth` schema) is a hard prerequisite** for 0005+: `profiles.id`→auth.users, `handle_new_user` trigger on auth.users, `slip_purchases.buyer_id`→auth.users, RLS `auth.uid()` in profiles/slip_purchases policies. Merge must ensure Auth is enabled (config.toml `[auth] enabled=true`, lines 63–64).
2. **`betslips` NOT NULL on `total_odds`/`leg_count` (main) is incompatible** with booking-code slips — dev's nullable version must win.
3. **`betslips` secret columns** (`booking_code`, `betting_site`, `slip_image_url`) are NULLed by 0005 and moved to `betslip_secrets`. Any main code/feature still reading these off `betslips` will get NULL post-merge — verify main's slip-review/settlement reads go through `betslip_secrets`.
4. **main has no migrations dir** — the entire `supabase/migrations/` tree is an additive dev contribution. No file-level conflict, but the migrations must layer cleanly onto main's baseline (which equals 0001 = `src/lib/schema.sql`).
5. **`src/lib/schema.sql` + `src/lib/rls.sql` are stale** (only reflect 0001–0003). After merge they should be regenerated from the full migration set or dropped, NOT used as schema truth.
6. **`transactions_service_only` permissive policy** — flag for security follow-up (§6).
7. **Empty `20260611075122_test.sql`** — decide delete + `migration repair` (§7).
8. **README undocuments 0004–0010** — its migration table stops at 0003. Update during harmonization so the doc matches the file set.

## 9. config.toml highlights (supabase/config.toml)
- project_id `betfluencer`; db major_version 15; API schemas `public, graphql_public`.
- `[auth] enabled=true`, `enable_signup=true`, `[auth.email] enable_confirmations=false` (no email confirm needed to sign in) — consistent with the auth-paywall flow.
- site_url `http://127.0.0.1:3000`. Storage enabled (50MiB). Realtime enabled.
