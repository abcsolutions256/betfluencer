# main-bugs.md — Bugs found in `main` during merge analysis

Scope: bugs discovered in the `main` branch while preparing the `main → stag` merge
(`stag == dev/payments`). This document **flags, does not fix**. Each entry cites
file:line (paths read via `git show main:PATH`), severity, description, and a suggested
handling: **fix-during-merge** (trivial and/or blocking the agreed merge decisions) or
**defer** (pre-existing, non-blocking, fix in a follow-up).

Source provenance notes: `merge/.analysis/main-admin.md`, `main-channels.md`,
`main-ranking.md`, `main-schema.md`, `main-settlement.md`.

Severity legend: **critical** (security/data-loss or blocks a hard merge decision) ·
**high** (feature breaks for users or settlement/auth correctness) · **medium** (wrong
data shown / latent failure under common paths) · **low** (cosmetic, copy, dead code).

---

## Summary table (sorted by severity)

| # | Sev | Title | Location |
|---|-----|-------|----------|
| 1 | critical | `/api/admin/settle` open when `ADMIN_SETTLE_KEY` unset — unauthenticated slip settlement | `api/admin/settle/route.ts:14-17` |
| 2 | critical | `/api/admin/pending-slips` has no auth guard — leaks unsettled slips | `api/admin/pending-slips/route.ts` |
| 3 | critical | Forgeable admin token: `isValidAdminToken` accepts any `base64("admin:…")` | `src/lib/adminAuth.ts:20` |
| 4 | critical | Hardcoded admin password fallback `'Betfluencer@Admin2026'` in repo | `src/lib/adminAuth.ts:18` |
| 5 | high | `void` settlement violates `result` CHECK constraint — write fails | `api/admin/settle/route.ts:19` vs `schema.sql:30,48` |
| 6 | high | App queries view `tipster_stats` that exists in no committed SQL | channels/rankings routes; `schema.sql` |
| 7 | high | `schema.sql` drifts from live DB (missing columns/CHECK/view) | `src/lib/schema.sql` §8 drift ledger |
| 8 | high | Unauthenticated cron/debug endpoints leak data / allow forced verify | `api/verify`, `verify-debug`, `fixturetest`, `apitest` |
| 9 | medium | `publicSignupsEnabled` stored in-memory — resets every deploy/instance | `api/admin/settings/route.ts` |
| 10 | medium | Rank discrepancy: page sorts `winRate×odds`, stats route ranks `wins×odds` | `rankings/page.tsx:91-95` vs `stats/route.ts:23-26` |
| 11 | medium | `__seed__` slips excluded from public list but still counted in ranking stats | `tipster_stats` view vs `slips/route.ts` filter |
| 12 | medium | Fuzzy team matching (5-char prefix) can mis-grade legs | `footballApi.ts:31-36` |
| 13 | medium | `supabaseServer()` hardcodes project URL, ignoring `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase.ts` |
| 14 | medium | Dead admin login form ships on dev page, POSTs deleted route | `src/app/admin/page.tsx` (dev) |
| 15 | low | Dead `fixture_id` settlement path — no column exists | `footballApi.ts:106-141` |
| 16 | low | Rankings explainer copy "28 days / 4 weeks" vs SQL 7-day window | `rankings/page.tsx:120,131` |
| 17 | low | Revenue rollup uses `tipster_id` as display name | `api/admin/revenue/route.ts` |
| 18 | low | Detail page reads `d.slips` from an endpoint that returns `{tips}` | `channel/[slug]/page.tsx:34` |
| 19 | low | Stale TS types (`Payment`, `TipsterPublic`, `Tip`, `Subscription`) disagree with tables | `src/types/index.ts`, `betslip.ts` |
| 20 | low | Generated admin token has no expiry / not signed | `src/lib/adminAuth.ts:19` |

---

## Critical

### 1. `/api/admin/settle` is unauthenticated when `ADMIN_SETTLE_KEY` is unset
- **Location:** `src/app/api/admin/settle/route.ts:14-17`
- **Description:** Settlement is gated only by the optional env `ADMIN_SETTLE_KEY`. If that
  env is not set, the check is skipped and the endpoint is **completely open** — any caller
  can `POST { slip_id, result }` and set any slip to win/loss/void/pending. Because writing
  `betslips.result` fires `tipster_tick_trigger` and feeds the ranking view, an anonymous
  caller can arbitrarily manipulate the leaderboard and tipster verification ticks.
- **Suggested handling:** **fix-during-merge.** This route is being ported into the unified
  admin (merge decision #4 keeps both verifiers; admin doc §5.2 ports settle). When ported,
  it MUST be re-guarded with `requireRole('admin')` (dev/payments Supabase Auth, decision #3).
  Remove the `admin_key`/`ADMIN_SETTLE_KEY` path entirely.

### 2. `/api/admin/pending-slips` has no auth guard at all
- **Location:** `src/app/api/admin/pending-slips/route.ts` (entire route; `main-admin.md` §2, §3)
- **Description:** Public `GET` returns all unsettled slips with legs and tipster name/username —
  no `verifyAdminToken`, no env gate. Leaks pre-settlement slip internals (booking codes,
  picks, prices) to any unauthenticated caller.
- **Suggested handling:** **fix-during-merge.** Ported into the unified admin Review tab;
  re-guard with `requireRole('admin')`.

### 3. Forgeable admin token — `isValidAdminToken` accepts any `base64("admin:…")`
- **Location:** `src/lib/adminAuth.ts:20` (`isValidAdminToken`), used by `verifyAdminToken` (`:21`)
- **Description:** Token validation only base64-decodes and checks the string
  `startsWith('admin:')`. There is no signature, secret, or expiry check — **any** attacker
  can mint a valid token as `base64("admin:anything")` and pass every `verifyAdminToken`-guarded
  admin route (review, settings POST, stats, tipsters CRUD, revenue).
- **Suggested handling:** **fix-during-merge** by deletion. `adminAuth.ts` is dropped wholesale
  per the auth rewire (merge decision #3; admin doc §5.1). All routes move to Supabase-session
  `requireRole('admin')`. Verify no route is left reading `x-admin-token`.

### 4. Hardcoded admin password fallback committed in repo
- **Location:** `src/lib/adminAuth.ts:18` — `checkAdminPassword` falls back to literal
  `'Betfluencer@Admin2026'` when `ADMIN_PASSWORD` env is unset.
- **Description:** A working admin credential is in source control (and is the active password
  whenever the env var is missing). Anyone with repo read access can authenticate.
- **Suggested handling:** **fix-during-merge** by deletion (same removal as #3). Confirm the
  string is purged from history-adjacent files; rotate any deployment that relied on it.

---

## High

### 5. `void` settlement violates the `result` CHECK constraint — the write fails
- **Location:** `src/app/api/admin/settle/route.ts:19` (accepts `result in ['win','loss','void','pending']`)
  vs CHECK `result in ('pending','win','loss')` on `betslips` (`schema.sql:30`) and
  `betslip_legs` (`schema.sql:48`). dev/payments init has the same narrow CHECK
  (`20260610000001_init.sql:30,50`).
- **Description:** The admin Review tab exposes a "void" button, but writing `'void'` to
  `betslips.result` violates the CHECK on both branches' schemas — the settlement fails. The
  void feature is latently broken on `main` today.
- **Suggested handling:** **fix-during-merge.** Merge decision #1 allows additive,
  non-destructive migrations; add `'void'` to the `betslips.result` and `betslip_legs.result`
  CHECK constraints in a new migration so the ported void-settlement works. Coordinate with
  the `tipster_stats`/`tipster_rankings` views (they key on `result='win'`; `'void'` is simply
  excluded from win/loss counts — confirm no view assumes a closed `win|loss|pending` set).

### 6. App queries a view (`tipster_stats`) that exists in no committed SQL
- **Location:** call-sites `api/tipster/route.ts:11`, `db.ts:17,31,40`,
  `tipster/[slug]/stats/route.ts:14,18`, `tipster/[slug]/slips/route.ts:13`,
  `rankings/page.tsx:6`. No `CREATE VIEW tipster_stats` in `main:src/lib/schema.sql` or in
  any `dev/payments` migration (`main-schema.md` §6, §8; `main-ranking.md` §2;
  `main-channels.md` risk #1).
- **Description:** Every channels and rankings code path reads `tipster_stats`, but the only
  view defined in tracked SQL is `tipster_rankings`. `tipster_stats` is a live-DB-only view
  (created out-of-band via the Supabase SQL Editor) and is a **superset** of `tipster_rankings`:
  it must also expose `losses`, `slips_posted`, `roi`, `last5`, `slug`, `created_at`. If the
  merged DB does not provide it, every channels/rankings page 500s or silently degrades (all
  the `?? 0` fallbacks fire; ROI/Streak/Last5 blank; win% collapses).
- **Suggested handling:** **fix-during-merge.** Dump the live `tipster_stats` DDL from the
  production DB (project ref `sooutpsbdgqelnnnfezp`, `supabase.ts`) and capture it in the
  baseline migration `0000_main_baseline.sql` (merge decision #1, non-destructive). This is the
  single most fragile undocumented dependency of the channels + ranking features.

### 7. `schema.sql` drifts from the live production DB
- **Location:** `src/lib/schema.sql` (drift enumerated in `main-schema.md` §8)
- **Description:** The committed DDL does not match the running DB — manual `ALTER`s were
  applied directly to production and never written back. Missing from the file but present
  live: the `tipster_stats` view (see #6); `betslips.booking_code` and `betslips.betting_site`
  columns (inserted at `api/tips/route.ts:29-30`); the `posting_mode` CHECK widened to allow
  `'booking_code'`; and possibly the `result` CHECK widened to allow `'void'` (see #5). Because
  `main` has **no `supabase/migrations/` history**, ordering against dev/payments migrations is
  undefined.
- **Suggested handling:** **fix-during-merge.** Reconstruct the **live** schema (not `schema.sql`)
  as baseline migration `0000_main_baseline.sql` so it composes with dev/payments' formal
  migrations. Include the drift additions, both views, all indexes, the `update_tipster_tick()`
  trigger, and RLS. Non-destructive per merge decision #1.

### 8. Unauthenticated cron/debug endpoints (forced verify + data leak)
- **Location:** `api/verify/route.ts` (POST, no auth — cron-by-convention only),
  `api/verify-debug/route.ts`, `api/fixturetest/route.ts`, `api/apitest/route.ts`
  (`main-settlement.md` §5, §9, §12)
- **Description:** `POST /api/verify` (the football-API settlement orchestrator, Vercel cron
  `0 2 * * *`) has no auth — any caller can trigger a full settlement pass. The three debug
  routes are open and leak pending-slip internals (team names, leagues, picks, fixture
  resolution) and confirm presence of `FOOTBALL_API_KEY`. All are `force-dynamic`, `no-store`.
- **Suggested handling:** **defer** for the debug routes (consider gating or removing in prod —
  not merge-blocking). For `/api/verify`: **fix-during-merge** to reconcile cron auth with
  dev/payments (decision #2 keeps unified settlement) — at minimum add a cron-secret header
  check so the settlement entrypoint is not openly callable.

---

## Medium

### 9. `publicSignupsEnabled` is stored in-memory — resets on every deploy/instance
- **Location:** `src/app/api/admin/settings/route.ts` — `let settings = { publicSignupsEnabled:false }`
  (`main-admin.md` §3; a code comment admits "store in Supabase settings table")
- **Description:** The public-signups toggle lives in a module-level variable, so it resets on
  every deploy and is not shared across serverless instances. An admin toggling it sees
  inconsistent behavior; signup pages (which read the public GET) get nondeterministic state.
- **Suggested handling:** **fix-during-merge** if cheap (per admin doc §5.5 rewiring checklist):
  persist to a `settings` table in the merged DB (additive). Otherwise **defer** — latent, not
  a merge blocker.

### 10. Rank discrepancy: page orders by `winRate×odds`, stats route ranks by `wins×odds`
- **Location:** `rankings/page.tsx:91-95` (`score = winRate × (avg_odds||1)`) vs
  `tipster/[slug]/stats/route.ts:23-26` (`score = wins_last_10 × (avg_odds||1)`); SQL view
  also uses `wins×odds` (`schema.sql:148-174`) (`main-ranking.md` §3)
- **Description:** Three layers compute "score" two different ways. The rankings table position
  (winRate×odds) can disagree with the rank shown on a tipster's own profile (wins×odds). Users
  see contradictory rank numbers.
- **Suggested handling:** **defer** — pre-existing on `main`; preserve as-is unless owners want
  it unified. Flag so the merge does not accidentally "fix" one side and silently change behavior.

### 11. `__seed__` slips hidden from public lists but still counted in ranking stats
- **Location:** filter in `api/tipster/[slug]/slips/route.ts` (`s.note !== '__seed__'`,
  commit e469cea) vs the `tipster_stats`/`tipster_rankings` view, which does **not** exclude
  `note='__seed__'` (`main-ranking.md` §4c; `main-schema.md` §6)
- **Description:** Seeded historical slips are filtered out of the public slip feed but are
  still aggregated into `wins_last_10`, `avg_odds`, and `score`. Ranking numbers include seeded
  data that users cannot see in the feed — inflated/inconsistent stats.
- **Suggested handling:** **defer** — behavioral, pre-existing. If owners want consistency, the
  `tipster_stats` view should also exclude `note='__seed__'`; decide explicitly rather than
  during conflict resolution.

### 12. Fuzzy team matching can mis-grade legs
- **Location:** `src/lib/footballApi.ts:31-36` (`teamsMatch`) + `:22-29` (`normalize`)
  (`main-settlement.md` §2, §12)
- **Description:** Fixture resolution matches teams by substring (either direction) OR first-5-char
  prefix after stripping tokens (`fc|sc|afc|women|u\d+|…`). The 5-char prefix is loose and can
  match the wrong fixture, producing an incorrect win/loss settlement that then feeds ranking and
  ticks. Combined with the free-tier date window (-1..+2 days), older slips become `unverifiable`.
- **Suggested handling:** **defer** — settlement-accuracy improvement, not merge-blocking. Note as
  a known limitation. The high-value structural fix is adding `fixture_id` (see #15), tracked
  separately.

### 13. `supabaseServer()` hardcodes the project URL, ignoring `NEXT_PUBLIC_SUPABASE_URL`
- **Location:** `src/lib/supabase.ts` — `supabaseServer()` pins
  `https://sooutpsbdgqelnnnfezp.supabase.co` and only the service-role key comes from env
  (`main-schema.md` §10)
- **Description:** The server client ignores the env URL and always points at main's production
  project. After the merge onto dev/payments' Supabase (decision #3, single auth/DB), this hardcoded
  ref would silently point server writes at the **wrong** project unless updated — a data-routing
  hazard.
- **Suggested handling:** **fix-during-merge.** Replace the hardcoded URL with the env-driven
  client so the merged service uses dev/payments' project. Confirm which project becomes the merged
  DATA baseline before flipping.

### 14. Dead admin login form ships on dev page and POSTs a deleted route
- **Location:** `src/app/admin/page.tsx` on dev/payments (`main-admin.md` §1 dev-replacement note)
- **Description:** The dev admin page still carries legacy cruft: `SESSION_KEY='bf_admin_session'`,
  an `AdminLogin` component that POSTs `/api/admin/login` (a route deleted on dev), and `x-admin-token`
  headers on every fetch (ignored by the now-Supabase-guarded routes). The login form is effectively
  dead/broken; real auth is the Supabase session + `/api/admin/me`.
- **Suggested handling:** **fix-during-merge** (cleanup): remove `AdminLogin`, `SESSION_KEY`/localStorage,
  and all `x-admin-token`/`admin_key` headers; gate the page via the `/api/admin/me` probe and
  `POST /api/auth/logout`. Not a feature loss.

---

## Low

### 15. Dead `fixture_id` settlement path — no column exists to populate it
- **Location:** `src/lib/footballApi.ts:106-141` (`verifyLeg` preferred path via `getFixtureById`,
  `:38-46`) — no `fixture_id` column on `betslip_legs` in either branch
  (`main:schema.sql:41-49`; `dev:20260610000001_init.sql:42-50`) (`main-settlement.md` §2, §12)
- **Description:** The preferred, reliable fixture-id resolution path can never run because
  `leg.fixture_id` is always `undefined` (no column). Latent code waiting for a column.
- **Suggested handling:** **defer** (high-value enhancement, not a bug-fix blocker). Adding
  `fixture_id` to `betslip_legs` is additive (decision #1) and would make code-entered-slip
  settlement far more reliable (supports the unified-settlement goal, decision #2). Track as a
  follow-up enhancement, not part of the mechanical merge.

### 16. Rankings explainer copy says "28 days / 4 weeks" but SQL window is 7 days
- **Location:** `rankings/page.tsx:120` ("Last 28 days" pill) and `:131`
  ("Score = win rate × avg winning odds · rolling 4 weeks only") vs the view's `avg_odds`
  7-day window (`schema.sql` / init migration) (`main-ranking.md` §6)
- **Description:** UI copy claims a 28-day/4-week window; the actual `avg_odds` computation uses a
  7-day window. Misleading but cosmetic.
- **Suggested handling:** **defer** — copy fix; reconcile copy vs logic in a follow-up.

### 17. Revenue rollup uses `tipster_id` where a display name belongs
- **Location:** `src/app/api/admin/revenue/route.ts` (groups commission by `tipster_id`, surfaced
  as the display label) (`main-admin.md` §3)
- **Description:** The revenue-by-tipster grouping shows the raw `tipster_id` UUID instead of the
  tipster name — cosmetic display bug in the admin Revenue tab.
- **Suggested handling:** **defer** — join `tipsters(name)` for display in a follow-up.

### 18. Channel detail page reads `d.slips` from an endpoint that returns `{tips}`
- **Location:** `src/app/channel/[slug]/page.tsx:34` (`main-channels.md` §"Detail page")
- **Description:** The detail page does two fetches; `…/[slug]/route.ts` returns `{ tipster, tips }`
  (key `tips`), while the slips come from `…/[slug]/slips/route.ts` (`{ slips }`). The note flags
  that the page relies on the **slips** endpoint for `d.slips` — confirm the `tipster` fetch is not
  also being read for a non-existent `slips` key. Latent key mismatch worth verifying.
- **Suggested handling:** **defer** — verify the key wiring during merge; the feature currently
  works via the separate slips endpoint, so non-blocking.

### 19. Stale TS types disagree with the live tables
- **Location:** `src/types/index.ts` (`Payment` names `subscription_id`/`at_transaction_id` vs
  table `purchase_id`/`flw_ref`; `TipsterPublic` narrower than the real `tipster_stats` contract;
  `Tip`/`Subscription` reference superseded tables) and `src/types/betslip.ts`
  (`market` field exists only in TS) (`main-schema.md` §3, §9; `main-ranking.md` §4b)
- **Description:** Several TS interfaces are legacy and contradict the authoritative tables/views.
  Risk of a developer trusting a stale type during the merge.
- **Suggested handling:** **defer** — type cleanup; align interfaces to the merged schema in a
  follow-up. Treat the tables/`tipster_stats` view as authoritative, not these types.

### 20. Generated admin token has no expiry and is not signed
- **Location:** `src/lib/adminAuth.ts:19` (`generateAdminToken` = `base64("admin:<Date.now()>:<Math.random()>")`)
- **Description:** Tokens never expire and carry no integrity. (Subsumed by #3/#4 — the whole module
  is being removed — but listed for completeness of the `main` security surface.)
- **Suggested handling:** **fix-during-merge** by deletion alongside #3/#4 (auth rewire, decision #3).

---

## Notes for the merge team

- Items #1–#4 and #20 all live in `src/lib/adminAuth.ts` / `api/admin/login` / `api/admin/settle`
  and are resolved by the **same** action: drop the legacy token scheme and re-guard ported routes
  with `requireRole('admin')` (Supabase Auth). Do this as one coherent rewire, not piecemeal.
- Items #5, #6, #7, #15 are all **schema/migration** work and belong in the baseline migration
  `0000_main_baseline.sql` + an additive CHECK-widening migration. Keep them non-destructive
  (merge decision #1).
- Items #10, #11, #16 are **pre-existing behavioral inconsistencies** — flagged so the mechanical
  merge does not silently alter behavior. Get explicit owner sign-off before "fixing" any of them.
