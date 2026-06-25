# main — Database Schema Baseline (DATA baseline for merge)

**Branch:** `main` (colleague's work). Source of truth read via `git show main:PATH`.
**Authoritative DDL files:** `src/lib/schema.sql` (182 lines), `src/lib/rls.sql` (88 lines).
**App-layer types:** `src/types/index.ts`, `src/types/betslip.ts`, `src/types/ads.ts`.
**Client config:** `src/lib/supabase.ts`, query layer `src/lib/db.ts`.

> **CRITICAL — NO MIGRATION HISTORY.** main has **no `supabase/migrations/` folder** and no other `.sql` files (only `src/lib/schema.sql` + `src/lib/rls.sql`). The schema is applied by manually pasting these files into the Supabase SQL Editor (see header comments). **There is no captured baseline migration.** For the merge, main's schema must be reconstructed as a **baseline migration `0000_main_baseline.sql`** so it composes with dev/payments' formal `supabase/migrations/*`. Until then, ordering against dev/payments migrations is undefined.

> **CRITICAL — schema.sql DRIFTS FROM THE LIVE PRODUCTION DB.** The committed `schema.sql` does **not** match what the running app queries. Several columns, CHECK values, and an entire view exposed by the live DB are absent from the DDL file. These were applied directly to production via SQL Editor (manual `ALTER`s never written back to `schema.sql`). The drift list is enumerated in §8 — **the live DB, not `schema.sql`, is the real DATA baseline to preserve.** Recent commits (`40ba53c` wins-out-of-settled, `bdbcc43` rank by win-rate×odds, `e469cea` seeded-slip hiding) confirm ongoing live-DB evolution beyond the file.

---

## 1. Extensions
`schema.sql:6-7`
- `uuid-ossp` — for `uuid_generate_v4()`
- `pgcrypto` — for `crypt()` / `gen_salt('bf')` (tipster password hashing, seed data)

## 2. Enums
**No native Postgres `CREATE TYPE` enums.** All "enums" are `text` columns with `CHECK (x in (...))` constraints, plus TS string-literal union types. Enumerated value sets:

| Domain | Values | Source |
|---|---|---|
| betslips.posting_mode | `'manual'`, `'screenshot'` *(file)* — live DB also allows `'booking_code'` | schema.sql:27; betslip.ts:2; api/tips/route.ts:28 |
| betslips.result / betslip_legs.result | `'pending'`, `'win'`, `'loss'` *(file)* — TS adds `'void'` | schema.sql:30,48; betslip.ts:1 |
| tipsters.tick_type | `'earned'`, `'paid'`, `null` | schema.sql:19; index.ts TickType |
| slip_purchases.status | `'active'`, `'refunded'` | schema.sql:60 |
| payments.status | `'pending'`, `'confirmed'`, `'failed'`, `'refunded'` | schema.sql:73-74 |
| (TS only) SubStatus | `'active'`, `'expired'`, `'refunded'` | index.ts |
| (TS only, ads — no table) AdFormat/AdModel/AdStatus/AdPlacement | see ads.ts | ads.ts |

## 3. Tables (committed schema.sql)

### tipsters — `schema.sql:10-21`
| column | type | constraints / default |
|---|---|---|
| id | uuid | PK, default `uuid_generate_v4()` |
| name | text | not null |
| username | text | **unique**, not null |
| phone | text | **unique**, not null |
| password_hash | text | not null |
| description | text | default `''` |
| sport | text | default `''` |
| verified | boolean | default `false` |
| tick_type | text | default null, CHECK in (`earned`,`paid`,null) |
| created_at | timestamptz | default `now()` |

### betslips — `schema.sql:24-37`  (the SLIP entity)
| column | type | constraints / default |
|---|---|---|
| id | uuid | PK |
| tipster_id | uuid | FK → tipsters(id) **ON DELETE CASCADE** |
| posting_mode | text | not null, CHECK in (`manual`,`screenshot`) *(live: + `booking_code`)* |
| total_odds | numeric(8,2) | not null |
| leg_count | integer | not null default 1 |
| result | text | default `'pending'`, CHECK in (`pending`,`win`,`loss`) |
| slip_price | integer | not null default 1000 (UGX) |
| note | text | default `''` — **overloaded as seed marker `'__seed__'`** (see §6) |
| slip_image_url | text | default `''` |
| result_image_url | text | default `''` |
| result_proof_pending | boolean | default `false` |
| posted_at | timestamptz | default `now()` |
| **booking_code** | *(live-DB only — NOT in schema.sql)* | inserted at api/tips/route.ts:29 |
| **betting_site** | *(live-DB only — NOT in schema.sql)* | inserted at api/tips/route.ts:30 |

### betslip_legs — `schema.sql:40-49`  (the LEG/MATCH entity)
| column | type | constraints / default |
|---|---|---|
| id | uuid | PK |
| betslip_id | uuid | FK → betslips(id) **ON DELETE CASCADE** |
| match | text | not null (free-text "Home vs Away") |
| league | text | default `''` |
| pick | text | not null |
| odds | numeric(5,2) | not null |
| match_time | timestamptz | nullable |
| result | text | default `'pending'`, CHECK in (`pending`,`win`,`loss`) |

> **Slip/match/leg representation (KEY for merge):** main models a slip as `betslips` (1) → `betslip_legs` (N). A "match" is **NOT a normalized entity** — it is a free-text `betslip_legs.match` string plus `league` text; there is no `matches` / `fixtures` table and no football-API fixture FK on main's schema baseline. (The football-API *settlement logic* lives in app code on main, but it does not introduce a fixtures table in schema.sql.) `betslip_legs.market` exists only in TS (`betslip.ts:13`), not in the DDL. This is the principal harmonization point vs dev/payments' worker, which fetches structured legs.

### slip_purchases — `schema.sql:53-62`  (per-slip purchase, replaces subscriptions)
| column | type | constraints / default |
|---|---|---|
| id | uuid | PK |
| betslip_id | uuid | FK → betslips(id) ON DELETE CASCADE |
| tipster_id | uuid | FK → tipsters(id) |
| user_phone | text | not null (buyer identity — guest, no auth row) |
| user_name | text | default `''` |
| amount_paid | integer | not null (UGX) |
| status | text | default `'active'`, CHECK in (`active`,`refunded`) |
| purchased_at | timestamptz | default `now()` |

### payments — `schema.sql:65-78`
| column | type | constraints / default |
|---|---|---|
| id | uuid | PK |
| purchase_id | uuid | FK → slip_purchases(id) |
| user_phone | text | not null |
| tipster_id | uuid | FK → tipsters(id) |
| gross_amount | integer | not null |
| commission_amount | integer | not null |
| tipster_amount | integer | not null |
| status | text | default `'pending'`, CHECK in (`pending`,`confirmed`,`failed`,`refunded`) |
| flw_ref | text | default `''` (Flutterwave ref — **note: main is Flutterwave-era; dev/payments is ioTec**) |
| payout_attempts | integer | default 0 |
| created_at | timestamptz | default `now()` |

> TS `Payment` (index.ts) drifts from this table: it names `subscription_id` (table = `purchase_id`) and `at_transaction_id` (table = `flw_ref`). The TS interface is stale/legacy; the table is authoritative.

### earnings — `schema.sql:81-91`
| column | type | constraints / default |
|---|---|---|
| id | uuid | PK |
| tipster_id | uuid | FK → tipsters(id) ON DELETE CASCADE |
| betslip_id | uuid | FK → betslips(id) |
| amount | integer | not null (net to tipster) |
| gross | integer | not null |
| commission | integer | not null |
| plan | text | not null default `'slip'` |
| user_phone | text | not null |
| created_at | timestamptz | default `now()` |

## 4. Indexes — `schema.sql:94-98`
- `idx_betslips_tipster` on `betslips(tipster_id, posted_at desc)`
- `idx_legs_betslip` on `betslip_legs(betslip_id)`
- `idx_purchases_phone` on `slip_purchases(user_phone)`
- `idx_purchases_tipster` on `slip_purchases(tipster_id)`
- `idx_earnings_tipster` on `earnings(tipster_id, created_at desc)`

## 5. Functions & Triggers

### `update_tipster_tick()` — `schema.sql:101-134` (plpgsql, returns trigger)
Auto-awards/revokes the "earned" verification tick. Logic:
- `wins_count` = count of `win` among tipster's **last 10** betslips (by `posted_at desc`).
- `avg_o` = `round(avg(total_odds),1)` over `win` slips in **last 7 days**.
- **Award:** if `wins_count >= 7 AND avg_o >= 2.0 AND tick_type IS NULL` → set `verified=true, tick_type='earned'`.
- **Revoke:** if `wins_count <= 4 AND tick_type='earned'` → set `verified=false, tick_type=null`.
- Never touches `tick_type='paid'` (manual/paid ticks are preserved).

### Trigger `tipster_tick_trigger` — `schema.sql:136-138`
`AFTER UPDATE OF result ON betslips FOR EACH ROW EXECUTE update_tipster_tick()`. Fires whenever a slip's `result` column is updated (i.e., on settlement). **Merge note:** dev/payments' settlement path must keep updating `betslips.result` for ticks to recompute; bulk/seed updates to `result` will also fire this trigger.

## 6. Views

### `tipster_rankings` — `schema.sql:141-174` (committed) — **LIKELY SUPERSEDED IN LIVE DB**
Per-tipster aggregate view. Committed columns: `id, name, username, description, sport, verified, tick_type, subscriber_count` (count of active slip_purchases), `wins_last_10` (wins in last 10 slips), `avg_odds` (avg total_odds of last-7-day wins, default 1.0), `score` (= `wins_last_10 * avg_odds`). Ordered by `score desc`.
Referenced in code only by `db.ts:getSubscriptionsByPhone` (legacy path, joins `tipster:tipster_rankings(*)`).

### `tipster_stats` — **LIVE-DB VIEW, NOT IN schema.sql** (the view the app actually uses)
The running app queries `tipster_stats` (7 `.from('tipster_stats')` call-sites on main), **not** `tipster_rankings`. This view is **undefined in any committed SQL file** — it exists only in the live DB. Its column set (reconstructed from consumers) is the real ranking contract:

| column | evidence |
|---|---|
| id | tipster/[slug]/stats/route.ts:14; rankings/page.tsx:6 |
| name, username, sport | rankings/page.tsx:7-9 |
| wins_last_10 | stats/route.ts:18,26,33; rankings/page.tsx:10 |
| **losses** | rankings/page.tsx:11 (`settled = wins_last_10 + losses` — commit 40ba53c) |
| **slips_posted** | rankings/page.tsx:12,198 |
| avg_odds | stats/route.ts:18,26; rankings/page.tsx:13 |
| **roi** | rankings/page.tsx:14,177,206 (percentage) |
| **last5** | rankings/page.tsx:15,176,211 (string of recent results, e.g. "WWLWP") |
| subscriber_count | rankings/page.tsx:16 |
| tick_type, verified | rankings/page.tsx:17-18 |

Score for ranking is computed **in app code** as `wins_last_10 * avg_odds` (stats/route.ts:26), and win-rate as `wins_last_10 / (wins_last_10 + losses)` (rankings/page.tsx:91-92). **Merge action:** the `tipster_stats` view DDL must be recovered from the live DB (it is not in the repo) and captured in the baseline migration, or rankings break.

### Seed/historical-slip marking (no column)
There is **no `seeded`/`is_seeded` column**. "Seeded historical slips" are flagged by `betslips.note = '__seed__'` and filtered in JS (api/tipster/[slug]/slips/route.ts, commit e469cea: `.filter(s => s.note !== '__seed__')`). Preserve this convention; do not assume a boolean flag exists.

## 7. RLS Policies — `rls.sql`
RLS **enabled** on all 6 tables (`rls.sql:7-12`). All policies are effectively **permissive `using(true)` / `with check(true)`** — real authorization is enforced in the API layer (service-role key), not in RLS. Policy inventory:

| table | policy | cmd | predicate |
|---|---|---|---|
| tipsters | tipsters_public_read | SELECT | `true` |
| tipsters | tipsters_service_write | INSERT | check `true` |
| tipsters | tipsters_service_update | UPDATE | `true` |
| betslips | betslips_finished_public | SELECT | `result in ('win','loss')` |
| betslips | betslips_pending_service | SELECT | `result = 'pending'` |
| betslips | betslips_service_insert | INSERT | check `true` |
| betslips | betslips_service_update | UPDATE | `true` |
| betslip_legs | legs_public_read | SELECT | `true` |
| betslip_legs | legs_service_write | INSERT | check `true` |
| betslip_legs | legs_service_update | UPDATE | `true` |
| slip_purchases | purchases_own_read | SELECT | `true` (phone filter in API) |
| slip_purchases | purchases_service_insert | INSERT | check `true` |
| slip_purchases | purchases_service_update | UPDATE | `true` |
| payments | payments_service_only | ALL | `true` |
| earnings | earnings_service_only | ALL | `true` |

> The only **non-trivial** RLS predicate is on `betslips` SELECT (finished slips public; pending gated). Everything else trusts the service-role API. dev/payments introduces Supabase Auth as authoritative — these `true` policies will need reconciliation but are non-destructive to keep for the additive merge.

## 8. DRIFT LEDGER — committed schema.sql vs live production DB
Items the **live DB has but `schema.sql` lacks** (must be preserved; capture in baseline migration `0000`):
1. **`tipster_stats` view** — entire view missing from repo; app depends on it (§6). DDL must be dumped from live DB.
2. **`betslips.booking_code`** column — inserted at api/tips/route.ts:29.
3. **`betslips.betting_site`** column — inserted at api/tips/route.ts:30.
4. **`betslips.posting_mode` CHECK** widened to include `'booking_code'` (file CHECK only has `manual`,`screenshot`) — api/tips/route.ts:28.
5. **`tipster_rankings`** view (committed) is **not used by the app** — superseded by `tipster_stats`. Likely deprecated; verify before dropping (non-destructive: keep).
6. Possible widening of `result` CHECK to allow `'void'` (TS `SlipResult` includes it; file CHECK does not) — confirm against live DB.

## 9. Stale / non-schema references in main (do NOT recreate as tables)
`src/lib/db.ts` is **legacy** and references tables/columns that **do not exist** in main's model:
- `.from('tips')` (create/list) — superseded by `betslips`/`betslip_legs`.
- `.from('subscriptions')` (getSubscriptionsByPhone, checkActiveSubscription, createSubscription) — superseded by `slip_purchases` (per-slip, no subscriptions; schema header line 1 says "no subscriptions").
- `.from('tipster_stats')` — **this one IS live** (§6); the rest of db.ts is dead.
- `src/types/ads.ts` defines `Ad`/`AdBooking` but there is **no ads table** in schema.sql or live DB (mock-only via `src/lib/mockAds.ts`).
- `src/types/index.ts` `Tip`/`Subscription`/`Payment` interfaces are stale and disagree with live tables (column-name mismatches noted in §3).

## 10. Supabase client wiring — `src/lib/supabase.ts`
- Browser client uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **`supabaseServer()` hardcodes project URL `https://sooutpsbdgqelnnnfezp.supabase.co`** (ignores the env URL) with `SUPABASE_SERVICE_ROLE_KEY`, `persistSession:false`. This pins main's production project ref — relevant for confirming which live DB is the DATA baseline.
- Env vars referenced: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## 11. Merge guidance (DATA baseline, non-destructive)
- Capture **live-DB schema** (not just schema.sql) as baseline migration `0000_main_baseline.sql`, including: 6 tables with the §8 drift additions, `update_tipster_tick()` + trigger, **both** views (`tipster_stats` recovered from live + `tipster_rankings`), all indexes, and all RLS policies.
- Preserve real production rows: tipsters, betslips/legs, slip_purchases, payments, earnings — all FK-cascaded under tipsters/betslips.
- The slip→leg model is free-text (no fixtures table). Harmonizing with dev/payments' structured worker legs is additive: add columns/tables, never drop `betslip_legs.match`/`league`.
- Keep the `note='__seed__'` seed convention and `posting_mode='booking_code'` value.
- Project ref to confirm as production: `sooutpsbdgqelnnnfezp` (supabase.ts).
