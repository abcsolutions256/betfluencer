# dev/payments — ADMIN area analysis (for additive merge with `main`)

Scope: `src/app/admin/page.tsx` + `src/app/api/admin/*` on `dev/payments`, compared to `main`.
Provenance rule: `main` read only via `git show main:…`. dev/payments == working tree (branch `stag`).

## TL;DR — the one big thing: AUTH MODEL CHANGED

`main` admin auth = **password + `x-admin-token` header** (`src/lib/adminAuth.ts`).
`dev/payments` admin auth = **Supabase Auth profile role** (`requireRole('admin')` from `src/lib/auth/session.ts`).

Every dev/payments admin **API route** was converted from `verifyAdminToken(req)` /
`isValidAdminToken(token)` to `await requireRole('admin')`. `src/lib/adminAuth.ts` is
**deleted on dev/payments** (still present + used on `main`). `src/lib/auth/session.ts` and
`src/lib/transactions.ts` **exist only on dev/payments** (not on `main`).

Merge decision: take dev/payments' Supabase-Auth model as the authoritative admin auth.
But this collides with `main`'s `login` route and the **client** still being token-based (see
"Inconsistency / bug" below). Do NOT lose `main`'s settlement feature in the process.

---

## API routes inventory

| Route | main | dev/payments | Action for merge |
|---|---|---|---|
| `ads` | token (`isValidAdminToken` via `x-admin-token`) | **modified** → `requireRole`; `force-dynamic`; dropped "in production" comments | integrate auth swap |
| `me` | — | **NEW** | add. `GET` → `requireRole('admin')`, returns `{admin:true,email}` |
| `slips` | — | **NEW** | add. GET lists 80 recent betslips incl. `hidden`; POST toggles `betslips.hidden` |
| `verify-slip` | — | **NEW** | add. POST zod `{betslip_id uuid, status: verified\|failed\|rejected\|pending}` → updates `betslips.verification_status` + `verified_at` |
| `transactions` | — | **NEW** | add. GET `requireRole`, calls `listTransactions({status,limit,offset})` from `@/lib/transactions`; status filter + pagination |
| `review` | token, leg-level | **modified** | auth swap + **bug fix**: order by `match_time` not non-existent `created_at` on `betslip_legs` |
| `settings` | token; **in-memory** `let settings` | **modified** | auth swap + **persistence**: now reads/writes `platform_settings` table (`public_signups_enabled`, `platform_commission`). GET public, POST admin |
| `stats` | token | **modified** | auth swap + **bug fix**: `slip_purchases.purchased_at` not `created_at` |
| `tipsters` | token | **modified** | auth swap + **new field** `commission_rate` in PATCH (`tipsters.commission_rate`) |
| `revenue` | token | **modified** | auth swap only |
| `login` | **token issuer** (`checkAdminPassword`→`generateAdminToken`) | — (still referenced by dead client login) | see conflict below |
| `pending-slips` | **EXISTS** (settlement hub: pending betslips + legs + tipster) | — **DROPPED** | **DO NOT LOSE** — re-add, port auth to `requireRole` |
| `settle` | **EXISTS** (manual win/loss/void; gated by `ADMIN_SETTLE_KEY` env) | — **DROPPED** | **DO NOT LOSE** — re-add, port auth to `requireRole` |

### Auth helper provenance
- `src/lib/adminAuth.ts` — main only; deleted on dev/payments. Exports `checkAdminPassword`,
  `generateAdminToken`, `isValidAdminToken`, `verifyAdminToken`, `ADMIN_SESSION_KEY`. Default
  password hardcoded `'Betfluencer@Admin2026'` (env `ADMIN_PASSWORD`).
- `src/lib/auth/session.ts` — dev/payments only. `requireRole('admin')` returns the `profiles`
  row if `role==='admin'` (admins pass any role check); reads `profiles` with service role
  (bypasses RLS). Depends on `supabaseSession()` (`@/lib/supabase/server`) + `supabaseServer()`.
- `src/lib/transactions.ts` — dev/payments only; `listTransactions()` at line 74. Required by the
  `transactions` route + `TransactionsTab`.

---

## `src/app/admin/page.tsx` (489 → 716 lines, +312/−85)

New tabs added on dev/payments: `transactions` (TransactionsTab) and `slips` (SlipsTab).
`AdminTab` union: main = `overview|ads|tipsters|revenue|review`; dev adds `transactions|slips`.
TipstersTab gains a **platform commission** editor (`platform_commission` via settings).

### Auth flow change in the page
- main: `AdminLogin` posts to `/api/admin/login`, stores token in `localStorage[bf_admin_session]`,
  passes it as `x-admin-token` to every tab. Gate = presence of localStorage token; `stats`
  fetched with the header.
- dev/payments main component: gate = `fetch('/api/admin/me')` (Supabase Auth). If not ok →
  renders a "Log in with an admin account" screen linking to `/login` (NOT the password form).
  `logout()` → `POST /api/auth/logout` then redirect `/login`.

### ⚠️ Inconsistency / latent bug to flag during merge (dev/payments as-is)
The page was only **half**-migrated to Supabase Auth:
1. The top-level gate uses `/api/admin/me` (Supabase Auth) ✅, but every tab is still rendered as
   `<XTab token={localStorage.getItem(SESSION_KEY) ?? ''} />` and every child `fetch` still sends
   `headers: { 'x-admin-token': token }`. Since the routes now use `requireRole` (cookie-based),
   that header is **ignored** — it works only because the Supabase session cookie rides along.
   The `token` prop is now dead plumbing.
2. `AdminLogin` component (the password form, ~lines 13–67) and the `/api/admin/login` fetch are
   now **dead code** on dev/payments — nothing renders `AdminLogin` anymore (the gate links to
   `/login`). But `/api/admin/login` route was deleted, so the dead component would 404 if ever
   reached.
3. `SESSION_KEY = 'bf_admin_session'` is still declared and read, but never written (no login
   writes it) → tabs always get `token = ''`. Harmless only because auth is cookie-based now.

Recommendation: on merge, finish the migration — drop `AdminLogin`, the `token` props, and the
`x-admin-token` headers; keep the `/api/admin/me` gate. Or, if keeping a unified panel, rip the
legacy bits cleanly.

---

## Overlap map vs main (what to INTEGRATE vs ADD vs PRESERVE)

INTEGRATE (same route both branches — apply dev's auth swap + bugfixes onto main, keep both
sides' intent):
- `ads`, `review`, `settings`, `stats`, `tipsters`, `revenue` route.ts
- `src/app/admin/page.tsx` (merge dev's new tabs/auth-gate into main's structure)

ADD (dev-only, no main conflict — bring over wholesale, including their `requireRole` deps):
- routes: `me`, `slips`, `verify-slip`, `transactions`
- libs: `src/lib/auth/session.ts`, `src/lib/transactions.ts`
- page tabs: TransactionsTab, SlipsTab; commission editor in TipstersTab

PRESERVE FROM MAIN (dev dropped these — high-stakes, additive merge must NOT lose them):
- `src/app/api/admin/pending-slips/route.ts` — admin **settlement hub** feed (pending betslips +
  legs + tipster name; force-no-store cache headers).
- `src/app/api/admin/settle/route.ts` — admin **manual settlement** (win/loss/void/pending;
  updates `betslips.result` + `result_proof_pending` + cascades `betslip_legs.result`; gated by
  `ADMIN_SETTLE_KEY`). main's ReviewTab is built around these two.
- Port both to `requireRole('admin')` instead of token/`ADMIN_SETTLE_KEY` to match the new model.

⚠️ ReviewTab semantics differ between branches — they are TWO DIFFERENT FEATURES, not a conflict:
- main ReviewTab → `/api/admin/pending-slips` + `/api/admin/settle` = **slip-level settlement**.
- dev ReviewTab → `/api/admin/review` (GET/POST) = **leg-level "unverifiable" resolution**
  (the `review` route exists on both; dev only changed its auth + order-by column).
Both should survive the merge (likely as two distinct tabs, e.g. "Settle" + "Review legs").

## Schema/columns touched by dev admin
- `betslips`: `hidden` (toggle), `verification_status`, `verified_at`, `posting_mode`, `result`,
  `total_odds`, `game_count`, `markets`, `earliest_kickoff`, `posted_at`
- `betslip_legs`: `result`, `match_time` (order-by; **no `created_at`** — that was main's bug)
- `slip_purchases`: `purchased_at` (**no `created_at`** — main's bug)
- `tipsters`: `commission_rate` (new in PATCH), `verified`
- `platform_settings` (key/value): keys `public_signups_enabled`, `platform_commission`
- `profiles`: `role` (drives `requireRole`)

## Env vars referenced
- `ADMIN_PASSWORD` (main `adminAuth.ts`, default hardcoded) — obsolete under dev model
- `ADMIN_SETTLE_KEY` (main `settle` route) — preserve if `settle` is ported
