# dev/payments — AUTHENTICATION (authoritative for the merged app)

**Merge rule:** dev/payments auth WINS. This is the one non-additive area. Wherever
main and dev disagree on *how a request is authenticated / authorized*, dev's model
replaces main's. main's admin/tipster features must be **re-wired onto dev's Supabase
Auth guards** — not the reverse.

Working tree == branch `stag` (== dev/payments), so dev files are read directly;
main files cited via `git show main:PATH`.

---

## 1. The Supabase Auth model (dev = authoritative)

Auth is **Supabase Auth** (the `auth.users` table + `@supabase/ssr` cookie sessions).
Identity = email + password. There is **no custom session token / JWT** for end users.

### Tables & roles
- `auth.users` — Supabase-managed (email, password, email-confirm). Source of identity.
- `public.profiles` — one row per auth user, carries the **role**.
  `supabase/migrations/20260612120000_auth_paywall_overhaul.sql:8-14`
  ```
  profiles(
    id uuid PK -> auth.users(id) on delete cascade,
    role text not null default 'user' check (role in ('user','tipster','admin')),
    email text, display_name text default '', created_at)
  ```
- Role enum (TS mirror): `Role = 'user' | 'tipster' | 'admin'` — `src/lib/auth/session.ts:9`.
- **Auto-provision trigger**: `handle_new_user()` (SECURITY DEFINER) fires
  `after insert on auth.users`, inserting a `profiles` row with `role='user'` and
  `display_name` taken from `raw_user_meta_data->>'display_name'`.
  Migration lines `18-29`. So every signup → a `profiles` row at role `user`.
- **Role elevation**:
  - `user → tipster`: `POST /api/tipster/register` runs
    `profiles.update({role:'tipster'})` then inserts the `tipsters` row
    (`src/app/api/tipster/register/route.ts:33-47`). Service-role write.
  - `* → admin`: **no code path exists.** No migration seeds an admin; no API sets
    role `admin`. An admin must be promoted manually in the DB
    (`update profiles set role='admin' where id=…`). Confirmed: the only `'admin'`
    references are *reads* (`requireRole('admin')`, `/api/admin/me`). **Merge note:**
    document this provisioning step; main had a shared password instead (§4).

### No claims/JWT customization
Roles are **not** in the JWT — they live in `profiles.role` and are read server-side
with the **service-role** client (bypasses RLS) so the check is reliable regardless of
RLS state (`getProfile()`, `src/lib/auth/session.ts:24-34`).

---

## 2. Session handling (cookies / SSR)

Three Supabase clients, deliberately separated:

| Helper | File | Key | Auth context | Use |
|---|---|---|---|---|
| `supabaseBrowser()` | `src/lib/supabase/client.ts` | anon | user session (browser cookies) | client components; login/signup call `.auth.signInWithPassword` / `.signUp` here |
| `supabaseSession()` | `src/lib/supabase/server.ts` | anon | user session (SSR cookies via `next/headers`) | "act AS the logged-in user", RLS applies. Used by `getSessionUser()` and logout |
| `supabaseServer()` | `src/lib/supabase/index.ts` | **service-role** | none (`persistSession:false`) | privileged reads/writes; **bypasses RLS**. Used for role lookups + all admin/tipster data |

- **Session source of truth = cookies.** `supabaseSession()` reads/writes the auth
  cookies through the `cookies()` store; writes are wrapped in try/catch because
  setting cookies throws during an RSC render — the **middleware** does the actual
  refresh (`src/lib/supabase/server.ts:18-25`).
- `getSessionUser()` → `supabaseSession().auth.getUser()` → the `User` or null
  (`src/lib/auth/session.ts:18-22`).
- **service-role caveat (carried over):** `supabaseServer()` forces
  `cache:'no-store'` on its fetch — required so Next's Data Cache doesn't serve stale
  reads (`src/lib/supabase/index.ts`). Not auth per se but every role lookup rides on it.

### Middleware
`src/middleware.ts` — runs on **every** non-static request (matcher excludes
`_next/static`, images, favicon). It builds a `createServerClient` over
`req.cookies`, calls `supabase.auth.getUser()` to **refresh the session + rotate
cookies**, and returns the response carrying the rotated cookies.
- **Middleware does NOT protect routes.** Its own comment + lines `1-3` say route
  protection lives in handlers/pages via `requireRole`. There is **no redirect / 401
  in middleware** — an unauthenticated user can reach any page; gating is per-handler.
  **Merge implication:** any main route that assumed "if I'm rendered, I'm allowed"
  must add its own `requireRole`/`getSessionUser` guard; the middleware won't catch it.

---

## 3. Route protection — the guard primitives

All in `src/lib/auth/session.ts`:
- `getSessionUser(): User|null` — the auth user.
- `getProfile(): Profile|null` — service-role read of `profiles` by `user.id`;
  falls back to a synthesized `{role:'user'}` if the row is missing
  (`session.ts:33`).
- `requireRole(role): Profile|null` — returns the profile if `role==='admin'`
  (admins pass everything) **or** `profile.role===role`, else null
  (`session.ts:38-43`). This is the gate handlers call.
- `getMyTipster()` — `tipsters` row where `profile_id = user.id`
  (`session.ts:46-52`). **This is the locus of the P0 bug — see §6.**

Guard usage (representative):
- `GET /api/admin/me` → `requireRole('admin')` → 401 `{error:'Not admin'}`
  (`src/app/api/admin/me/route.ts`).
- `GET /api/admin/stats|tipsters|…` → `requireRole('admin')` → 401 `Unauthorized`
  (`src/app/api/admin/stats/route.ts:6`, `tipsters/route.ts:11`, etc. — **all** dev
  admin routes use this).
- `GET /api/tipster/me` → `getMyTipster()` → 401 if not a tipster
  (`src/app/api/tipster/me/route.ts`).
- `POST /api/tipster/register` → `getSessionUser()` → 401 if not signed in
  (`register/route.ts:21-22`).
- `POST /api/auth/logout` → `supabaseSession().auth.signOut()`
  (`src/app/api/auth/logout/route.ts`).
- Ownership checks elsewhere reuse `profile_id === user.id`, e.g.
  `src/app/api/slips/[id]/reveal/route.ts:37`,
  `src/app/api/tipster/[slug]/slips/route.ts:21-27`.

### Client auth pages (dev)
- `/login` (`src/app/login/page.tsx`) and `/tipster/login`
  (`src/app/tipster/login/page.tsx`): identical — email+password →
  `supabaseBrowser().auth.signInWithPassword`; on success `/login` → `/`,
  `/tipster/login` → `/tipster/dashboard`. **The two login pages are
  interchangeable** (same Supabase session); the tipster one just redirects to the
  dashboard.
- `/signup` (buyer) and `/tipster/signup`: `auth.signUp` with
  `options.data.display_name`. If `!data.session` → "confirm your email" (email
  confirmation is ON). Tipster signup additionally POSTs `/api/tipster/register`
  after signup to elevate role + create the tipsters row
  (`src/app/tipster/signup/page.tsx:20-34`).

---

## 4. Admin: dev model vs main model — the re-wiring rule (CRITICAL)

**The two branches authenticate admin completely differently. dev's model wins; main's
admin UI + the main-only admin routes must be ported onto it.**

### dev (authoritative)
- Admin = a Supabase auth user whose `profiles.role='admin'`.
- Page `src/app/admin/page.tsx` (dev/stag): on mount calls `GET /api/admin/me`;
  if ok → `authed=true`; if not → renders an "Log in with an admin account" screen
  linking to `/login` (lines `583-620`). Logout = `POST /api/auth/logout` →
  `window.location='/login'`.
- Every dev admin API route guards with `requireRole('admin')` (server-side,
  service-role profile read). No header token is consulted.
- **`src/lib/adminAuth.ts` is DELETED in dev** (confirmed absent from the stag tree).
- **Dead leftovers in dev's `admin/page.tsx`:** the top of the file still contains an
  `AdminLogin` component, `SESSION_KEY='bf_admin_session'`, a `fetch('/api/admin/login')`,
  and `token={localStorage.getItem(SESSION_KEY)}` props passed to tab components
  (`admin/page.tsx:8-30,691-711`). **These are vestigial** — `/api/admin/login` does
  **not exist** in dev, and the dev API routes ignore the `token` prop entirely (they
  use `requireRole`). The real entrypoint is the `/api/admin/me` flow at line 583+.
  Flag for cleanup during merge, but they don't affect behavior.

### main (to be replaced)
- `src/lib/adminAuth.ts`: shared **`ADMIN_PASSWORD`** env (default hardcoded
  `'Betfluencer@Admin2026'`!) → `checkAdminPassword()`; `generateAdminToken()` =
  base64 `admin:<ts>:<rand>`; `verifyAdminToken(req)` reads `x-admin-token` header and
  accepts a valid base64 admin token *or the raw password*.
- `POST /api/admin/login` (`git show main:src/app/api/admin/login/route.ts`) →
  returns `{token}` for a correct password.
- main `admin/page.tsx`: `AdminLogin` posts the password, stores token in
  `localStorage['bf_admin_session']`, and **every** admin fetch sends
  `headers:{'x-admin-token': token}` (lines 94,176,227,232,244,258,264,391,…).
- main admin API routes guard with `verifyAdminToken(req)`
  (`git show main:src/app/api/admin/stats/route.ts:6`).

### Re-wiring checklist for the merge (NO admin feature may be lost)
main-only admin routes — `api/admin/pending-slips`, `api/admin/settle`, and main's
versions of `revenue/review/settings/tipsters/stats/ads` — must:
1. **Drop** `verifyAdminToken(req)` and the `x-admin-token` header contract; replace
   with `if (!(await requireRole('admin'))) return 401`.
2. **Stop sending** `x-admin-token` from the client; the Supabase session cookie
   authenticates automatically (these routes become session-based).
3. main's admin **settlement/verification** entrypoints (`/api/admin/settle`,
   `/api/verify` called from main's admin page line 104/115) must sit behind
   `requireRole('admin')` too.
4. Delete `src/lib/adminAuth.ts`, `ADMIN_PASSWORD`, and `/api/admin/login` (dev
   already removed them). Provision the real admin via `profiles.role='admin'`.
5. Reconcile the merged `admin/page.tsx`: keep dev's `/api/admin/me` gate; graft
   main's extra tabs (pending-slips / settle / settings toggle) on top, dropping the
   token plumbing.

> Column drift to watch (not auth, but in the same routes): dev's stats route reads
> `slip_purchases.purchased_at`; main's reads `created_at`. Whichever schema wins, the
> admin route's column must match — see schema analysis.

---

## 5. RLS posture (auth-adjacent)

From the auth migration (`…auth_paywall_overhaul.sql:90-117`):
- `profiles` RLS ON: `profiles_self_read`/`_self_update` → `id = auth.uid()`. Admin
  access is via the **service-role** client (no policy needed).
- `betslip_secrets` RLS ON with **no policy** → service-role only. Secrets (booking
  code, site, screenshot URL) are reachable ONLY through the purchase-checked API.
- `betslips`: `betslips_verified_public` → public can read `verification_status='verified'`
  or finished (`result in win/loss`).
- `slip_purchases`: `purchases_owner_read` → `buyer_id = auth.uid()` (own purchases
  across devices). Writes service-role only. `buyer_id` added (FK `auth.users`,
  `on delete set null`), unique `(betslip_id, buyer_id)` (legacy NULL buyers stay
  distinct under NULLS DISTINCT).

These policies assume `auth.uid()` — i.e. the Supabase session. main's RLS baseline
(`src/lib/rls.sql`) predates roles; the merged RLS must keep these dev policies.

---

## 6. P0 BUG — legacy tipster `profile_id` is NULL → login dead-ends

**Severity: critical (a tipster who logs in cannot reach their dashboard).**

### Mechanism
- The migration **adds** `tipsters.profile_id` but **never backfills it**:
  `alter table tipsters add column if not exists profile_id uuid …`
  (`…auth_paywall_overhaul.sql:32`). There is **no** `update tipsters set profile_id=…`
  anywhere (grep confirms only the `add column` + unique index — lines 32-34).
- Therefore every **pre-existing tipster** has `profile_id = NULL`. This includes the
  4 **seeded** tipsters (`Enzo Kampala`, `Nairobi King`, `StatAttack`, `BetWise UG`)
  inserted by `20260610000001_init.sql:186-191` with a `password_hash` and **no**
  `profile_id`, and any real tipster created before this migration.
- These legacy tipsters have **no `auth.users` row at all** (they authenticated via the
  old phone+bcrypt scheme in `src/lib/auth.ts`, now defunct). The migration drops the
  NOT NULL on `password_hash` (line 36) but provides **no migration of those
  credentials into Supabase Auth**.

### The dead-end
`getMyTipster()` does `tipsters.select('*').eq('profile_id', user.id).single()`
(`src/lib/auth/session.ts:50`). For a legacy tipster:
1. They can't even log in — there's no `auth.users` row for their identity, so
   `signInWithPassword` fails outright. If an admin re-creates them via Supabase
   signup, that mint a **new** `auth.users`+`profiles` row whose `id` does **not**
   match the legacy `tipsters.profile_id` (NULL).
2. After login, `/api/tipster/me` → `getMyTipster()` → `profile_id = user.id` matches
   **no row** → returns null → 401.
3. The dashboard (`src/app/tipster/dashboard/page.tsx:85-87`) sees `!d?.tipster` and
   `router.push('/tipster/login')` → **infinite bounce back to login**. Their slips,
   earnings, and stats are orphaned under the old tipsters row.

Also `.single()` (vs `.maybeSingle()`) **throws** if 0 rows — and if a legacy tipster
were ever signed up twice it could match 0 or error rather than degrade gracefully.

### Fix directions (for the merge owner)
- **Backfill migration**: for each legacy tipster, create/locate the Supabase auth user
  and set `tipsters.profile_id = <that auth uid>`; or provide an admin "claim/link"
  flow that binds an existing `tipsters` row to the logged-in user's `profile_id`.
- Harden `getMyTipster()` to `.maybeSingle()` so a missing/duplicate row degrades to
  null instead of throwing.
- For the **seeded** tipsters specifically: either give them real `auth.users` rows in
  a seed migration and backfill `profile_id`, or accept they're display-only and never
  log in (document it). Today they silently break tipster login if anyone tries.

---

## 7. Secondary auth findings (lower severity, don't lose at merge)

- **Tipster dashboard "Sign out" doesn't sign out.**
  `src/app/tipster/dashboard/page.tsx:404` only does
  `localStorage.removeItem('bf_tipster_id')` (a key from the *old* localStorage auth
  scheme, now unused) + `router.push('/tipster/login')`. It **never calls**
  `/api/auth/logout` or `supabaseBrowser().auth.signOut()`, so the Supabase session
  cookie survives — the user is still logged in and can navigate straight back. The
  e2e spec (`tests/e2e/02-tipster-auth.spec.ts`) clicks this and expects a real logout;
  it "passes" only because the next login overwrites the session. Fix: call
  `/api/auth/logout` (POST) then redirect. (Buyer logout via `/api/auth/logout` is
  correct; admin logout is correct.)
- **Email confirmation is ON.** Both signup flows handle `!data.session` →
  "check your email". For tipster signup this means `/api/tipster/register` is **not**
  called until after confirmation+login, so an unconfirmed tipster has a `profiles`
  row at role `user` and **no tipsters row** until they come back. Any merge that
  wires "post a tip right after signup" must account for this two-step.
- **Hardcoded admin password default in main** (`ADMIN_PASSWORD ?? 'Betfluencer@Admin2026'`)
  — eliminated by adopting dev's role-based admin (§4). Make sure the merge actually
  deletes `adminAuth.ts` rather than leaving the fallback reachable.
- **No password strength enforcement on the live path.** `isStrongPassword()` exists in
  `src/lib/auth.ts:31` (≥8 chars + a digit) but is **not used** — signup UIs only
  enforce `password.length >= 6` client-side; Supabase's own min applies server-side.
- `src/lib/auth.ts` (dev) is now **legacy/partial**: `hashPassword/verifyPassword/
  generateSessionToken` are dead (Supabase Auth replaced them); only `normalisePhone()`
  is still used (by `/api/tipster/register` + `/api/admin/tipsters`). Don't delete the
  file wholesale at merge — keep `normalisePhone`.

---

## 8. One-paragraph merge summary

dev/payments authentication is **Supabase Auth**: `auth.users` for identity (email +
password, email-confirm ON), `profiles(role in user|tipster|admin)` for authorization,
roles read server-side via the **service-role** client (`requireRole`). Sessions are
cookie-based via `@supabase/ssr`; `middleware.ts` only **refreshes** the session
(no route protection) and every protected handler/page must call
`getSessionUser`/`requireRole` itself. Admin is a `profiles.role='admin'` user gated by
`requireRole('admin')` + `/api/admin/me` — **main's shared-password `x-admin-token`
admin (`adminAuth.ts`, `/api/admin/login`) is replaced**, and all main-only admin
routes (`pending-slips`, `settle`, etc.) must be re-wired onto `requireRole('admin')`
with the header-token contract removed. **P0 to fix before/with merge:** legacy +
seeded tipsters have `tipsters.profile_id = NULL` (migration adds the column, never
backfills, and supplies no Supabase-Auth users for them), so `getMyTipster()` finds
nothing and the dashboard infinitely redirects to login — needs a backfill/link
migration and a `.maybeSingle()` hardening, plus a real tipster logout.
