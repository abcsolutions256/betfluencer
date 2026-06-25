# dev/payments — Bugs Found During Merge Analysis

Scope: bugs **pre-existing in `dev/payments`** (working tree `stag`), surfaced while
analyzing the branch for the additive merge of `main` into `stag`. **These are flagged,
not fixed.** They are sorted by severity (P0 → low). Each entry cites file/line, the
mechanism, and how the merge owner should handle it.

Note: bugs in `main`'s code (e.g. main's `slip_purchases.created_at` / `betslip_legs.created_at`
order-by mistakes, hardcoded `ADMIN_PASSWORD` default) are tracked in the admin/auth
analysis and the main-side dossier — they are **not** dev/payments bugs and are excluded
here. The dev/payments admin routes already *fix* main's column bugs (`stats` uses
`purchased_at`, `review` uses `match_time`).

---

## P0 / Critical

### P0-1 — Legacy + seeded tipsters have `tipsters.profile_id = NULL` → tipster login dead-ends
- **Location:** `supabase/migrations/20260612120000_auth_paywall_overhaul.sql:32` (adds
  the column, never backfills); `src/lib/auth/session.ts:46-52` (`getMyTipster()`, the
  `.eq('profile_id', user.id).single()` lookup); `src/app/api/tipster/me/route.ts`;
  `src/app/tipster/dashboard/page.tsx:85-87` (the redirect); seeded rows at
  `supabase/migrations/20260610000001_init.sql:186-191`.
- **Description:** Migration 0005 adds `tipsters.profile_id` but ships **no**
  `update tipsters set profile_id = …` backfill and **no** migration of the old
  phone+bcrypt credentials into Supabase Auth. So every pre-existing tipster — including
  the 4 seeded tipsters (`Enzo Kampala`, `Nairobi King`, `StatAttack`, `BetWise UG`) and
  all real legacy tipsters — has `profile_id = NULL` and **no `auth.users` row**. They
  cannot `signInWithPassword` at all; and if an admin re-creates one via Supabase signup,
  the **new** `auth.users.id` does not match the legacy `tipsters.profile_id` (NULL). After
  login, `/api/tipster/me` → `getMyTipster()` returns null → 401 → the dashboard
  (`dashboard/page.tsx:85-87`) does `router.push('/tipster/login')` → **infinite bounce to
  login**. Their slips/earnings/stats are orphaned. Compounding: `getMyTipster()` uses
  `.single()` (not `.maybeSingle()`), which **throws** on 0 rows rather than degrading.
  This is the P0 named in MEMORY.
- **Handling:** Ship a backfill/link migration (for each legacy tipster, create/locate the
  Supabase auth user and set `tipsters.profile_id = <auth uid>`; or an admin "claim/link"
  flow binding an existing `tipsters` row to the logged-in user's `profile_id`). Harden
  `getMyTipster()` to `.maybeSingle()`. For seeded tipsters: either mint real `auth.users`
  rows + backfill `profile_id` in a seed migration, or document them as display-only.
  Required before/with the merge since main's real tipster data is being backfilled into
  dev's Supabase Auth — those tipsters MUST get a matching `profile_id`.

---

## High

### H-1 — `transactions_service_only` RLS policy is `FOR ALL USING(true)` → financial data world-readable under RLS
- **Location:** `supabase/migrations/20260610000002_transactions.sql` (the
  `transactions_service_only` policy); reflected in `src/lib/schema.sql`.
- **Description:** RLS is enabled on `transactions`, but the only policy is
  `FOR ALL USING(true)`. Under RLS a `USING(true)` policy grants **every** role — including
  the anon key — full read/write of `transactions`, which holds financial records, buyer
  phone numbers, and emails. It is "safe" today only because the anon key is never used to
  query `transactions` in practice; the policy itself is permissive and directly
  contradicts the project's own RLS doctrine ("⚠️ Do NOT add `using(true)` policies" in
  `rls.sql`). Sibling financial tables (`payments`, `earnings`) correctly use **no policy
  (deny)**.
- **Handling:** Flag for security review during DB harmonization. Replace with no-policy
  (service-role-only deny), matching `payments`/`earnings`. Do not carry the permissive
  policy into the merged migration set unreviewed. Additive/non-destructive: tighten via a
  follow-up migration, do not weaken.

---

## Medium

### M-1 — Admin page only half-migrated to Supabase Auth: dead `x-admin-token` plumbing + dead `AdminLogin`
- **Location:** `src/app/admin/page.tsx:8-30, 691-711` (and ~lines 13-67 for `AdminLogin`);
  `SESSION_KEY = 'bf_admin_session'`; the `fetch('/api/admin/login')` call.
- **Description:** The page's top-level gate was migrated to `/api/admin/me` (Supabase Auth)
  ✅, but the rest of the migration was left half-done:
  1. Every tab is still rendered `<XTab token={localStorage.getItem(SESSION_KEY) ?? ''} />`
     and every child `fetch` still sends `headers: { 'x-admin-token': token }`. The dev API
     routes now use `requireRole` (cookie-based) and **ignore** that header — it works only
     because the Supabase session cookie rides along. The `token` prop is dead plumbing.
  2. The `AdminLogin` password-form component and its `fetch('/api/admin/login')` are dead
     code: nothing renders `AdminLogin` (the gate links to `/login`), and the
     `/api/admin/login` route was **deleted** in dev — so the dead component would 404 if
     ever reached.
  3. `SESSION_KEY = 'bf_admin_session'` is declared and read but never written, so tabs
     always receive `token = ''`. Harmless only because auth is cookie-based now.
- **Handling:** During the admin-area merge, finish the migration: drop `AdminLogin`, the
  `token` props, the `x-admin-token` headers, and the `SESSION_KEY` plumbing; keep the
  `/api/admin/me` gate. Behavior is already correct (cookie auth) — this is cleanup to
  prevent confusion and a latent 404, not a functional break.

### M-2 — Tipster dashboard "Sign out" does not actually sign out
- **Location:** `src/app/tipster/dashboard/page.tsx:404`.
- **Description:** The tipster "Sign out" handler only does
  `localStorage.removeItem('bf_tipster_id')` (a key from the *old*, now-defunct localStorage
  auth scheme) + `router.push('/tipster/login')`. It **never calls** `/api/auth/logout`
  (POST) or `supabaseBrowser().auth.signOut()`, so the Supabase **session cookie survives** —
  the user is still authenticated and can navigate straight back into the dashboard. The e2e
  spec `tests/e2e/02-tipster-auth.spec.ts` clicks this and "passes" only because the
  subsequent login overwrites the session, masking the bug. (Buyer logout and admin logout
  via `/api/auth/logout` are correct.)
- **Handling:** Fix to call `POST /api/auth/logout` (or `supabaseBrowser().auth.signOut()`)
  then redirect. Worth doing alongside the P0 tipster-auth work since both touch the tipster
  session lifecycle; note the e2e spec gives false confidence here.

---

## Low

### L-1 — `listTransactions` pagination off-by-one drops the first row / shortens the page
- **Location:** `src/lib/transactions.ts:86` (`.range(offset+1, offset+limit-1)`).
- **Description:** PostgREST `.range(a, b)` is inclusive on both ends. Using
  `(offset+1, offset+limit-1)` skips the row at `offset` and returns `limit-1` rows instead
  of `limit` — the first row of each page is dropped and the page is one short. Admin-only
  listing (the `/api/admin/transactions` route → `TransactionsTab`), so impact is limited to
  the admin transactions view; no money is mis-moved.
- **Handling:** Fix to `.range(offset, offset + limit - 1)`. Low-risk standalone fix; can ride
  along with the admin-area merge.

### L-2 — `IOTEC_CURRECY` env var name is misspelled (no "N")
- **Location:** `src/lib/iotec.ts` (read in `collect()` as the collection `currency`);
  documented in the env inventory.
- **Description:** The collect call reads the currency from an env var literally named
  **`IOTEC_CURRECY`** (sic). If the deployment `.env` sets the correctly-spelled
  `IOTEC_CURRENCY`, the code reads empty and ioTec receives an empty `currency` on the
  collect request. The misspelling must be matched exactly in `.env`, or the code fixed.
- **Handling:** Either rename the code reference to `IOTEC_CURRENCY` (preferred; update
  `.env`/`.env.local.example` in lockstep) or document the typo loudly so ops sets the env
  with the same misspelling. Verify the live `.env` currently matches the typo before merge
  so collections don't start sending empty currency.

### L-3 — `docs/PAYMENTS-IOTEC.md` describes an API that the shipped code does not implement (doc drift)
- **Location:** `docs/PAYMENTS-IOTEC.md`.
- **Description:** The spec doc is aspirational/older: it references `/api/subscribe` POST
  (collect/disburse), a `payments` table, `provider_ref`, and signature-header webhook
  verification. The shipped code instead uses `/api/payments/*`, the `transactions` table, a
  demo short-circuit, and a shared **callback-token** webhook auth (`x-iotec-callback-token` /
  Bearer) + status refetch (it never trusts the payload). Not a runtime bug, but it will
  mislead any engineer who treats the doc as the contract during the merge.
- **Handling:** Treat **code as source of truth**, not the doc. Update or delete
  `docs/PAYMENTS-IOTEC.md` post-merge. No code change required.

---

## Documentation / hygiene nits (non-blocking, not strictly bugs)

These are noted for completeness — they are doc gaps and stray artifacts, not behavioral
defects. Handle opportunistically during harmonization; none block the merge.

- **Empty dummy migration** `supabase/migrations/20260611075122_test.sql` (0 bytes, sorts
  5th, between 0004 and 0005). No-op but consumes a `schema_migrations` version slot. Decide
  to delete + `supabase migration repair` (deleting the file after the live DB recorded the
  version triggers a "missing migration" warning). See schema analysis §7.
- **Stale full-schema reference:** `src/lib/schema.sql` + `src/lib/rls.sql` only reflect
  migrations 0001–0003 and omit every object from 0004 onward (`slip_verifications`,
  `profiles`, `betslip_secrets`, `normalized`/`summary`/`total_odds`, `hidden`, `buyer_id`,
  `buyer_key`, `verify_attempts`, `record_failed_verify`, etc.). Migrations are the source of
  truth; regenerate or delete these files post-merge so a "schema.sql says X" argument can't
  override the migrations.
- **`GEMINI_API_KEY` missing from `bet-code-worker/.env.example`** (it lives only in root
  `.env.local.example`, the compose files, and `docker-compose.prod.yml`). Add it to the
  worker's own example post-merge.
- **Worker `README.md` predates `normalize.js`** (still describes the worker as
  raw-scrape-only; the "images/fonts blocked for speed" note is aspirational — they are not
  blocked). Update post-merge.
- **`normalize.js` `SYSTEM_INSTRUCTION` carries two stacked prompt specs** (original at
  `bet-code-worker/src/normalize.js:19` plus an "Additonally" second spec at line 69 with a
  different prose response schema); only `RESPONSE_SCHEMA` (line 163) actually governs
  output. Preserve as-is but flag for cleanup post-merge.
- **`supabase/README.md` documents only migrations 0001–0003** — undocuments 0004–0010.
  Update during harmonization.
- **`docs/ARCHITECTURE.md` is a 2026-06-12 snapshot and is stale** (claims no Supabase Auth,
  RLS `using(true)`, `entitlement.ts`, `api/subscribe`, 4 migrations). `CLAUDE.md` +
  migrations win. Refresh or annotate post-merge.

---

## Summary table

| Sev | ID | Title | Location |
|---|---|---|---|
| P0 | P0-1 | Legacy/seeded tipster `profile_id = NULL` → login dead-ends | `…auth_paywall_overhaul.sql:32`, `auth/session.ts:46-52`, `tipster/dashboard/page.tsx:85-87` |
| High | H-1 | `transactions_service_only` RLS `USING(true)` exposes financial data | `…_transactions.sql` |
| Med | M-1 | Admin page half-migrated: dead `x-admin-token` plumbing + dead `AdminLogin` | `admin/page.tsx:8-30,691-711` |
| Med | M-2 | Tipster "Sign out" doesn't clear the Supabase session | `tipster/dashboard/page.tsx:404` |
| Low | L-1 | `listTransactions` `.range()` off-by-one | `transactions.ts:86` |
| Low | L-2 | `IOTEC_CURRECY` env var misspelled | `iotec.ts` |
| Low | L-3 | `docs/PAYMENTS-IOTEC.md` doc drift vs shipped code | `docs/PAYMENTS-IOTEC.md` |
