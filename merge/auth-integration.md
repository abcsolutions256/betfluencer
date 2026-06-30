# Auth Integration — re-wiring main's admin onto dev/payments Supabase Auth

**Doc scope:** how main's admin section gets re-authenticated against dev/payments'
Supabase Auth, route-by-route, and how the auth tables land **inside main's real
production DB** non-destructively.

**Merge invariants (fixed by owners):**
- Auth is **dev/payments' Supabase Auth ONLY**. main's `adminAuth.ts` / `x-admin-token`
  scheme is replaced. This is the one **non-additive** area — where the two branches
  disagree on *how a request is authenticated*, dev wins.
- DB migrations are **additive, non-destructive**. main's DB holds real data; existing
  main users/admins are backfilled into Supabase Auth, no data loss.
- **No admin feature is dropped.** Settlement (`pending-slips` + `settle`, main-only)
  and dev's moderation (`slips` + `verify-slip`) both survive, both re-guarded onto the
  same `requireRole('admin')`.

> Provenance: working tree == `stag` (== `dev/payments`); dev paths read directly.
> main paths read via `git show main:PATH`. Sources: `merge/.analysis/dev-auth.md`,
> `main-admin.md`, `dev-admin.md`, `main-schema.md`, `dev-schema.md`.

---

## 1. dev/payments' auth model (the target every admin route is re-wired onto)

### 1.1 Identity, roles, tables
Auth is **Supabase Auth** — `auth.users` (Supabase-managed: email + password) is the
source of identity. There is **no custom session token / JWT** for end users; roles are
**not** in the JWT.

- **`auth.users`** — Supabase-managed identity (email, password, confirm state).
- **`public.profiles`** — one row per auth user, carries authorization.
  Created by `supabase/migrations/20260612120000_auth_paywall_overhaul.sql:8-14`:
  ```
  profiles(
    id           uuid PK references auth.users(id) on delete cascade,
    role         text not null default 'user' check (role in ('user','tipster','admin')),
    email        text,
    display_name text default '',
    created_at   timestamptz)
  ```
- Role enum (TS mirror): `Role = 'user' | 'tipster' | 'admin'` — `src/lib/auth/session.ts:9`.
- **Auto-provision trigger** `handle_new_user()` (SECURITY DEFINER, `search_path=public`)
  fires `after insert on auth.users` → inserts a `profiles` row at `role='user'`,
  `display_name = raw_user_meta_data->>'display_name'` (migration lines 18-29). Every
  signup yields a `profiles` row at role `user`.

### 1.2 Role elevation paths
- `user → tipster`: `POST /api/tipster/register` sets `profiles.update({role:'tipster'})`
  then inserts the `tipsters` row (`src/app/api/tipster/register/route.ts:33-47`,
  service-role write).
- `* → admin`: **no code path exists.** No migration seeds an admin; no API sets
  `role='admin'`. The only `'admin'` references are *reads* (`requireRole('admin')`,
  `/api/admin/me`). **Admins are provisioned manually in the DB** —
  `update profiles set role='admin' where id=…`. This replaces main's shared-password
  admin; the merge must document this provisioning step (see §4 and §6).

### 1.3 Sessions (cookies / SSR)
Three deliberately-separated Supabase clients:

| Helper | File | Key | Auth context |
|---|---|---|---|
| `supabaseBrowser()` | `src/lib/supabase/client.ts` | anon | browser cookie session (login/signup call `signInWithPassword`/`signUp` here) |
| `supabaseSession()` | `src/lib/supabase/server.ts` | anon | SSR cookie session via `next/headers`; "act AS the logged-in user", RLS applies |
| `supabaseServer()` | `src/lib/supabase/index.ts` | **service-role** | none (`persistSession:false`); privileged reads/writes, **bypasses RLS** |

- **Session source of truth = cookies** (`@supabase/ssr`). `supabaseSession()`
  reads/writes the auth cookies through `cookies()`; cookie writes are try/catch-wrapped
  because setting a cookie throws during an RSC render — the **middleware** does the real
  refresh (`src/lib/supabase/server.ts:18-25`).
- `supabaseServer()` forces `cache:'no-store'` so Next's Data Cache can't serve stale
  role reads — every `requireRole` lookup rides on this.

### 1.4 Middleware — refresh only, NOT route protection
`src/middleware.ts` (dev-only — **main has no `src/middleware.ts`**, confirmed) runs on
every non-static request (matcher excludes `_next/static`, images, favicon). It builds a
`createServerClient` over `req.cookies`, calls `supabase.auth.getUser()` to **refresh the
session + rotate cookies**, and returns the response carrying them.

- **The middleware does NOT redirect or 401.** Route protection lives **per-handler** via
  `requireRole` / `getSessionUser`. An unauthenticated user can *reach* any page; gating is
  each handler's job.
- **Merge implication:** every ported main admin route MUST add its own
  `requireRole('admin')` guard. The middleware will not catch an unguarded route — and
  several main admin routes ship with **no guard at all** (§3), so this is load-bearing.

### 1.5 Guard primitives (`src/lib/auth/session.ts`)
- `getSessionUser(): User|null` — the auth user (`session.ts:18-22`).
- `getProfile(): Profile|null` — service-role read of `profiles` by `user.id`; falls back
  to a synthesized `{role:'user'}` if the row is missing (`session.ts:24-34`).
- `requireRole(role): Profile|null` — returns the profile if `role==='admin'` (**admins
  pass every check**) or `profile.role===role`, else null (`session.ts:38-43`). This is the
  gate handlers call.
- `getMyTipster()` — `tipsters` row where `profile_id = user.id` (`session.ts:46-52`).
  (Locus of the P0 legacy-tipster bug — out of admin scope, see dev-auth.md §6.)

`GET /api/admin/me` (`src/app/api/admin/me/route.ts`): `requireRole('admin')` → 401
`{error:'Not admin'}` or `{admin:true, email}`. This is the admin page's mount-time gate.

---

## 2. main's admin auth (the scheme being removed)

main authenticates admin with a **single shared password + an unsigned header token** —
no users table, no per-user identity.

### `src/lib/adminAuth.ts` (DELETED on dev/payments; still present + used on main)
- `ADMIN_SESSION_KEY = 'bf_admin_session'` — localStorage key on the client.
- `checkAdminPassword(pw)` — compares to env `ADMIN_PASSWORD`, **hardcoded fallback
  `'Betfluencer@Admin2026'`** (plaintext in repo — security smell).
- `generateAdminToken()` — `base64("admin:<Date.now()>:<Math.random()>")`. Not signed, not
  verifiable, no expiry.
- `isValidAdminToken(token)` — only checks the decoded string `startsWith('admin:')`.
  **Any base64 of a string starting `admin:` passes.**
- `verifyAdminToken(req)` — reads header `x-admin-token`; passes if `isValidAdminToken` OR
  the raw token equals `ADMIN_PASSWORD`.

### `src/app/api/admin/login/route.ts` (DELETED on dev/payments)
`POST {password}` → `checkAdminPassword` → `{token: generateAdminToken()}`; client stores
it in `localStorage['bf_admin_session']` and sends it as `x-admin-token` on every admin
fetch (and as `admin_key` in the settle body).

### main's guard styles (per-route, in-handler — no middleware)
main's admin routes self-guard, **inconsistently** — three of the most sensitive routes are
effectively open:

| Style | Routes |
|---|---|
| `verifyAdminToken(req)` (header) | `review`, `settings` (POST), `stats`, `tipsters` (all verbs), `revenue` |
| local `checkAuth()` → `isValidAdminToken` (no password fallback) | `ads` |
| `ADMIN_SETTLE_KEY` env, **open if env unset** | `settle` ← effectively unauthenticated by default |
| **no guard at all** | `pending-slips` (public GET) |

The admin **page** (`src/app/admin/page.tsx` on main) gates purely client-side: on mount
reads `localStorage[SESSION_KEY]`; if present → `setAuthed(true)`. No server check of the
token. `logout()` just removes the localStorage key.

> Env vars in play: `ADMIN_PASSWORD` (obsolete under dev model), `ADMIN_SETTLE_KEY`
> (only meaningful while `settle` stays env-gated — dropped once ported to `requireRole`).

---

## 3. Route-by-route re-wire map (admin)

Legend — **Action**: `swap-guard` = same route both branches, replace main's token guard
with `requireRole('admin')` and reconcile to one file; `port` = main-only route to bring
over and re-guard; `add` = dev-only route, bring wholesale; `cleanup` = remove.

| Route | main guard | dev/payments | Merged guard | Action |
|---|---|---|---|---|
| `api/admin/login` | none (token issuer) | **deleted** | — | **cleanup** (delete; admins via `profiles.role`) |
| `api/admin/me` | — | NEW `requireRole('admin')` | `requireRole('admin')` | **add** (keep — page mount gate) |
| `api/admin/pending-slips` | **none** (public GET) | **dropped** | `requireRole('admin')` | **port** — DO NOT LOSE (settlement feed) |
| `api/admin/settle` | `ADMIN_SETTLE_KEY` (open if unset) | **dropped** | `requireRole('admin')` | **port** — DO NOT LOSE (win/loss/void) |
| `api/admin/review` | `verifyAdminToken` | KEPT, `requireRole` | `requireRole('admin')` | **swap-guard** (dev already swapped; leg-level review) |
| `api/admin/settings` | GET public / POST `verifyAdminToken` | KEPT, `requireRole`, now DB-backed | GET public / POST `requireRole('admin')` | **swap-guard** + persist (§5) |
| `api/admin/stats` | `verifyAdminToken` | KEPT, `requireRole` | `requireRole('admin')` | **swap-guard** (col fix `purchased_at`) |
| `api/admin/tipsters` | `verifyAdminToken` (all verbs) | KEPT, `requireRole` | `requireRole('admin')` | **swap-guard** (+`commission_rate` PATCH) |
| `api/admin/revenue` | `verifyAdminToken` | KEPT, `requireRole` | `requireRole('admin')` | **swap-guard** |
| `api/admin/ads` | `isValidAdminToken` | KEPT, `requireRole`, `force-dynamic` | `requireRole('admin')` | **swap-guard** (stub) |
| `api/admin/slips` | — | NEW (hide toggle) | `requireRole('admin')` | **add** |
| `api/admin/verify-slip` | — | NEW (verification_status override) | `requireRole('admin')` | **add** |
| `api/admin/transactions` | — | NEW (payments) | `requireRole('admin')` | **add** |

### 3.1 The two complementary admin features (neither is a duplicate)
- **main `ReviewTab` → settlement** (`pending-slips` + `settle`): lists slips whose
  `result ∈ {pending,null}` with legs + tipster; per-slip **win / loss / void** buttons
  (`POST /api/admin/settle {slip_id, result}`). This **decides slip outcome and feeds the
  ranking** via the `tipster_tick_trigger` on `betslips.result`. dev/payments has **no
  equivalent** — if not ported, manual settlement is lost.
- **dev `SlipsTab`/`verify-slip` → moderation**: `betslips.hidden` toggle (pull stale slip
  off marketplace) + `verification_status` override (`verified|failed|rejected|pending`).
  This is **not** win/loss settlement.
- **dev `ReviewTab` → leg-level** `api/admin/review` (resolve `'unverifiable'` legs) — a
  third, distinct feature that exists on both branches (dev only swapped its auth +
  fixed an order-by column).

All three live on in the merged panel (likely distinct tabs, e.g. "Settle" + "Review legs"
+ "Slips"), every one behind `requireRole('admin')`.

### 3.2 Per-route guard transform (the actual edit shape)
For every `swap-guard` and `port` route:
```diff
- import { verifyAdminToken } from '@/lib/adminAuth'
- if (!verifyAdminToken(req)) return NextResponse.json({error:'Unauthorized'},{status:401})
+ import { requireRole } from '@/lib/auth/session'
+ if (!(await requireRole('admin'))) return NextResponse.json({error:'Unauthorized'},{status:401})
```
For `settle`: additionally **drop the `admin_key` body field + `ADMIN_SETTLE_KEY` env
check** and add input validation (it is currently unauthenticated by default). For
`pending-slips`: it had **no guard** — adding `requireRole('admin')` is a net security gain.

> **Column drift to honor while editing these routes** (schema decides, not auth): dev's
> `stats` reads `slip_purchases.purchased_at` (main read non-existent `created_at`); dev's
> `review` orders by `betslip_legs.match_time` (main used non-existent `created_at`). The
> merged routes must use the dev columns. See `main-schema.md` / `dev-schema.md`.

---

## 4. Admin role / permission mapping (main → dev)

main has exactly **one** privilege level (holder of the shared password = full admin).
dev's model is per-user role with `admin` as a superset. The mapping is therefore flat:

| main concept | dev/payments equivalent |
|---|---|
| Knows `ADMIN_PASSWORD` / holds a valid `x-admin-token` | `profiles.role = 'admin'` |
| `verifyAdminToken(req) === true` | `await requireRole('admin') !== null` |
| (no main equivalent) tipster-scoped access | `profiles.role = 'tipster'` + ownership `profile_id === user.id` |
| (no main equivalent) buyer/end-user | `profiles.role = 'user'` (default) |

- **No granular permissions exist on either side** — admin is all-or-nothing on both. So
  the mapping is 1:1: every place main asked "valid admin token?" becomes "is
  `requireRole('admin')` non-null?". No permission matrix to design.
- `requireRole('admin')` semantics: an `admin` profile **passes every** `requireRole(x)`
  check (admins are a superset of tipster/user), matching main's "admin can do anything".

---

## 5. `settings.publicSignupsEnabled` — persistence (auth-adjacent, fix on the way through)
main's `api/admin/settings` stored `let settings = {publicSignupsEnabled:false}` **in
memory** (resets per deploy/instance; GET is public, read by signup pages; POST behind
`verifyAdminToken`). dev/payments already fixed this: the route now reads/writes the
**`platform_settings`** key/value table (keys `public_signups_enabled`,
`platform_commission`), GET public / POST `requireRole('admin')`. **Take dev's DB-backed
version**; do not carry main's in-memory `let settings` forward.

---

## 6. Auth tables in main's DB — non-destructive reconciliation + backfill

main's DB is the **real-data baseline** and has **no `supabase/migrations/` directory** at
all (confirmed: `git ls-tree -r --name-only main -- supabase/migrations` is empty; main's
schema is hand-applied `src/lib/schema.sql` + `src/lib/rls.sql`). The entire migration tree
is a dev/payments contribution. So the auth schema must be **created inside main's DB** by
layering dev's migrations on top of main's baseline.

### 6.1 What must exist in main's DB for auth to work
1. **Supabase Auth (`auth` schema) enabled** — hard prerequisite for migration 0005+:
   - `profiles.id → auth.users(id)` FK;
   - `handle_new_user()` trigger `on_auth_user_created` fires `after insert on auth.users`;
   - `slip_purchases.buyer_id → auth.users(id)`;
   - RLS policies reference `auth.uid()` (`profiles_self_read/_self_update`,
     `purchases_owner_read`).
   Confirm `[auth] enabled=true` for main's project (dev config.toml lines 63-64). **If
   main's production Supabase project never had Auth turned on, enabling it is step zero** —
   migration 0005 fails otherwise.
2. **`public.profiles`** (0005) — role table, `handle_new_user()` + `on_auth_user_created`
   trigger.
3. **`betslip_secrets`** (0005) — secrets moved off `betslips`; service-role-only.
4. **Auth-related column additions** (additive `add column if not exists`): `tipsters.profile_id`
   (+ unique `uniq_tipsters_profile`), `tipsters.commission_rate`, `slip_purchases.buyer_id`
   (+ unique `uniq_purchase_betslip_buyer`), `slip_purchases.buyer_key` (0009).
5. **`platform_settings`** (key/value; seeded `platform_commission='0.10'` by 0005) — for the
   §5 settings route.

### 6.2 Ordering — layer dev migrations onto a main baseline
Reconstruct main's **live** schema as a baseline migration `0000_main_baseline.sql`
(per `main-schema.md` §11 — includes the live-DB drift: `tipster_stats` view,
`betslips.booking_code`/`betting_site`, the `booking_code` posting_mode value, etc.), then
apply dev's `20260610000001_init.sql … 20260625120000_skip_verified_sync.sql` on top.
Migration 0005 (`auth_paywall_overhaul`) is where the auth schema lands. All auth DDL is
**additive** (`add column if not exists`, `create table … `, `create or replace function`),
so it composes onto main's populated tables without dropping data.

> Stray artifact: `supabase/migrations/20260611075122_test.sql` is **empty (0 bytes)** —
> delete it (use `supabase migration repair` if a linked DB already recorded the version).
> Not auth-specific but it sits between 0004 and 0005 in apply order.

### 6.3 Backfilling existing main users/admins into Supabase Auth (NON-DESTRUCTIVE)
main has **no `auth.users` rows today** — its tipsters authenticated via the old
phone+bcrypt scheme (`tipsters.password_hash`), and its admin was a shared password (no
user row at all). Migration 0005 **adds** `tipsters.profile_id` but **never backfills it**
and supplies **no `auth.users` rows** for legacy identities. So a one-time backfill is
required so existing data links to the new auth tables without loss:

- **Admin(s):** there is no main admin user to migrate (it was a shared password). After
  Auth is enabled, **provision the real admin manually**: create a Supabase Auth user for
  the operator (Supabase signup / dashboard / Admin API), then
  `update profiles set role='admin' where id = '<that auth uid>'`. This is the *only* way to
  mint an admin (no code path sets `role='admin'`). Delete `ADMIN_PASSWORD` /
  `adminAuth.ts` only after this admin exists, so the panel is never locked out.
- **Tipsters:** for each existing `tipsters` row, create/locate the matching Supabase Auth
  user and set `tipsters.profile_id = <that auth uid>` (backfill migration or an admin
  "claim/link" flow). `handle_new_user()` auto-creates the `profiles` row at role `user`
  on insert into `auth.users`; the backfill then elevates `profiles.role='tipster'` and
  links `profile_id`. Without this, legacy tipsters log in but `getMyTipster()` matches no
  row (the documented **P0** — out of admin scope but the same backfill resolves it).
- **Buyers:** existing `slip_purchases` rows keep `buyer_id = NULL` (column is nullable,
  `on delete set null`); guest identity is carried by `buyer_key` (0009). No buyer backfill
  is required — legacy purchases remain valid and distinct under `NULLS DISTINCT` unique
  indexes. Purely additive.

All of the above are **add/insert/update** operations — no drop of `tipsters.password_hash`
data (0005 only drops its NOT NULL constraint), no row deletion.

### 6.4 RLS reconciliation (auth-dependent)
dev's auth migrations install policies keyed on `auth.uid()`:
`profiles_self_read`/`_self_update` (`id = auth.uid()`), `purchases_owner_read`
(`buyer_id = auth.uid()`), plus `betslips_verified_public` and `legs_finished_public`;
`betslip_secrets`, `tipsters`, `payments`, `earnings`, `slip_verifications`,
`platform_settings` are **service-role only** (no policy = deny to anon). main's `rls.sql`
ships **permissive `using(true)`** policies on those same tables — **main's `rls.sql` must
NOT win the merge** (keeping it re-leaks `password_hash` / pending booking codes to the
anon key). The merged RLS = dev's end-state. (Flag for security review:
`transactions_service_only` uses `for all using(true)` — should likely be no-policy/deny,
per `dev-schema.md` §6; not auth-blocking.)

### 6.5 config reconciliation note (verify before cutover)
dev's `supabase/config.toml` sets `[auth.email] enable_confirmations = false` (line 87) —
no email confirmation needed to sign in. The provenance note `dev-auth.md` §7 describes the
signup flows as if confirmation is **ON** (they branch on `!data.session →` "check your
email"). These describe the **hosted project setting**, not config.toml. **Decide and align
the hosted main project's Auth email-confirmation setting** before cutover, because it
changes the tipster-register timing: with confirmation ON, `/api/tipster/register` only runs
after confirm+login, so a freshly-signed-up tipster transiently has `role='user'` and no
`tipsters` row. Admin provisioning (§6.3) is unaffected either way (done directly in DB).

---

## 7. Concrete re-wire steps the merge will perform (the plan; edits happen in step e)

**A. Remove main's admin-auth scheme**
1. Delete `src/lib/adminAuth.ts` and `src/app/api/admin/login/route.ts` (dev already
   removed both). Remove env `ADMIN_PASSWORD` (and `ADMIN_SETTLE_KEY` once `settle` is
   ported off it).
2. In the admin client (`src/app/admin/page.tsx`): remove the `AdminLogin` password form,
   `SESSION_KEY='bf_admin_session'`, all `localStorage` token read/writes, every
   `headers:{'x-admin-token': token}` fetch, the `token={…}` tab props, and the `admin_key`
   field in the settle body. (These are already **dead plumbing** on dev — the routes read
   the Supabase cookie — so removal is behavior-neutral cleanup.)

**B. Make the page gate on Supabase Auth**
3. Keep dev's mount-time gate: `GET /api/admin/me` → if 401, render "Log in with an admin
   account" linking to `/login`; if ok, `authed=true`. `logout()` = `POST /api/auth/logout`
   then redirect `/login`. (Buyer + admin logout are correct on dev; the tipster-dashboard
   "sign out" is broken — separate finding, out of admin scope.)

**C. Re-guard / port every admin route onto `requireRole('admin')`** (per §3 table)
4. **swap-guard** `review`, `settings`(POST), `stats`, `tipsters`, `revenue`, `ads`: replace
   `verifyAdminToken(req)`/`isValidAdminToken` with
   `if (!(await requireRole('admin'))) return 401` (reconcile to one file each; dev already
   did its copies). Keep `settings` GET public.
5. **port** main's `pending-slips` and `settle` back in (dev dropped them), each behind
   `requireRole('admin')`; drop `settle`'s `admin_key`/`ADMIN_SETTLE_KEY` gate and add input
   validation. This preserves manual win/loss/void settlement.
6. **add** dev-only `me`, `slips`, `verify-slip`, `transactions` wholesale (already
   `requireRole`-guarded) — complementary moderation/payments tabs, not replacements.
7. Reconcile the merged `admin/page.tsx`: keep dev's `/api/admin/me` gate + new tabs
   (Transactions, Slips, commission editor), graft main's settlement **ReviewTab/Settle** +
   leg-review tab on top, all token-free.

**D. Create the auth schema inside main's DB (non-destructive)**
8. Reconstruct main's live schema as baseline `0000_main_baseline.sql`; layer dev migrations
   0001→0010 on top (drop empty `…_test.sql`). Ensure **Supabase Auth is enabled** on main's
   project before 0005 runs.
9. Verify 0005 lands `profiles`, `betslip_secrets`, `handle_new_user()` +
   `on_auth_user_created`, and the additive auth columns
   (`tipsters.profile_id`/`commission_rate`, `slip_purchases.buyer_id`/`buyer_key`,
   `platform_settings`) onto main's populated tables.

**E. Backfill existing identities (no data loss)**
10. Provision the real admin: create a Supabase Auth user, then
    `update profiles set role='admin' where id='<uid>'` (do this **before** deleting
    `ADMIN_PASSWORD`, so the panel isn't locked out).
11. Backfill tipsters: create/locate each `tipsters` row's Supabase Auth user, set
    `tipsters.profile_id` and elevate `profiles.role='tipster'` (also resolves the P0
    legacy-tipster dead-end). Buyers need no backfill (`buyer_id` nullable, `buyer_key`
    carries guest identity).

**F. Lock down RLS + settings persistence**
12. Adopt dev's RLS end-state (drop main's permissive `using(true)` policies; keep
    `auth.uid()`-keyed + service-role-only policies). Flag `transactions_service_only` for
    security review.
13. Use dev's DB-backed `api/admin/settings` (`platform_settings` table); drop main's
    in-memory `let settings`.

**G. Verify (post-merge auth smoke)**
14. Non-admin session → every `api/admin/*` returns 401 (middleware does not gate — each
    route must self-guard; `pending-slips`/`settle` previously did not).
15. Provisioned admin → `/api/admin/me` ok; settlement (`settle` win/loss/void), moderation
    (`slips` hide + `verify-slip`), leg-review, tipster CRUD, stats/revenue all succeed with
    **no `x-admin-token` header sent**.
16. Confirm a settled slip still fires `tipster_tick_trigger` (ranking recompute) — the
    ported `settle` writes `betslips.result`, so the trigger path is preserved.

---

## 8. One-paragraph summary
dev/payments' Supabase Auth is the sole auth: `auth.users` for identity, `public.profiles`
(`role ∈ user|tipster|admin`) for authorization read server-side via the service-role
client (`requireRole`), cookie sessions via `@supabase/ssr`, and a refresh-only
`middleware.ts` (no route protection — every handler self-guards). main's shared-password
`x-admin-token` admin (`adminAuth.ts` + `/api/admin/login`) is **deleted**; all main admin
routes are re-wired onto `requireRole('admin')` — `review/settings/stats/tipsters/revenue/ads`
swap their guard, the main-only **settlement** routes `pending-slips` + `settle` are **ported
back** (do-not-lose) and re-guarded, and dev's `me/slips/verify-slip/transactions` are added
alongside. The auth tables land in main's real DB additively: enable Supabase Auth, layer
dev's migrations (0005 creates `profiles`, `betslip_secrets`, `handle_new_user` trigger, and
the additive `profile_id`/`buyer_id`/`buyer_key`/`platform_settings` columns) onto a
`0000_main_baseline.sql`, then backfill — provision the admin via `profiles.role='admin'`
and link existing tipsters' `profile_id` to new `auth.users` — with **no row dropped** and
main's permissive RLS replaced by dev's `auth.uid()`/service-role end-state.
