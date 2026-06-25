# main — ADMIN slip-review + auth-adjacent code (provenance for additive merge onto dev/payments)

Scope: main's admin section (`src/app/admin/page.tsx` + all `src/app/api/admin/*`) and the
auth helpers it depends on (`src/lib/adminAuth.ts`, `src/lib/auth.ts`). dev/payments REPLACES
admin auth with Supabase Auth + `requireRole('admin')`. The high-stakes risk here is that
main's **slip settlement** UX (win/loss/void → drives ranking) does NOT exist on dev/payments
and must not be lost.

All main paths below were read via `git show main:PATH`. dev/payments paths via `git show dev/payments:PATH`.

---

## 1. How admin auth works on main (TO BE REPLACED)

### `src/lib/adminAuth.ts` (DELETED on dev/payments)
Single shared-password scheme, no users table:
- `ADMIN_SESSION_KEY = 'bf_admin_session'` — localStorage key on the client.
- `checkAdminPassword(password)` — compares to `process.env.ADMIN_PASSWORD`, **hardcoded fallback `'Betfluencer@Admin2026'`** (security smell; plaintext in repo).
- `generateAdminToken()` — `base64("admin:<Date.now()>:<Math.random()>")`. Not signed, not verifiable, no expiry.
- `isValidAdminToken(token)` — only checks the decoded string `startsWith('admin:')`. **Any base64 of a string starting `admin:` passes.** No cryptographic validation.
- `verifyAdminToken(req)` — reads header `x-admin-token`; passes if `isValidAdminToken` OR the raw token equals `ADMIN_PASSWORD`.

### `src/app/api/admin/login/route.ts` (DELETED on dev/payments)
`POST { password }` → `checkAdminPassword` → returns `{ token: generateAdminToken() }`.
Client stores token in `localStorage['bf_admin_session']`.

### Guard pattern on main (per-route, in-handler — NO middleware)
There is **no `src/middleware.ts`** gating admin; every route self-guards. Two guard styles coexist:
- Most routes: `if (!verifyAdminToken(req)) return 401` (reads `x-admin-token`). Used by: review, settings(POST), stats, tipsters(all verbs), revenue.
- `ads/route.ts`: local `checkAuth()` → `isValidAdminToken(token)` only (no password fallback).
- `settle/route.ts`: **does NOT use adminAuth at all.** Gated by optional `process.env.ADMIN_SETTLE_KEY`; if that env is unset it is **completely open** (any caller can settle any slip). The client passes the localStorage token as `admin_key`, but it is only checked when `ADMIN_SETTLE_KEY` is set.
- `pending-slips/route.ts`: **no auth guard at all** (public GET).

The admin **page** (`src/app/admin/page.tsx`) gates purely client-side: on mount reads
`localStorage[SESSION_KEY]`; if present → `setAuthed(true)`. No server check of the token's
validity for rendering. `logout()` just removes the localStorage key.

### dev/payments replacement (rewiring target)
- `src/lib/auth/session.ts`: `requireRole(role)` → `getProfile()` (reads `profiles.role` via service-role client, `getSessionUser()` via `supabaseSession()` cookie) → passes if role is `'admin'` or matches. Roles: `'user' | 'tipster' | 'admin'`.
- `src/app/api/admin/me/route.ts` (NEW): `GET` → `requireRole('admin')` → `{ admin, email }`. The dev admin page calls this on mount to decide `authed`.
- All dev admin routes guard with `if (!(await requireRole('admin'))) return 401`.
- dev admin page logout = `POST /api/auth/logout` (not localStorage removal).
- NOTE: dev admin page **still ships legacy cruft** — `SESSION_KEY='bf_admin_session'`, an `AdminLogin` that POSTs `/api/admin/login` (a route DELETED on dev), and `x-admin-token` headers on every fetch. These headers are now ignored (routes read the Supabase cookie). So dev's `AdminLogin` form is effectively dead/broken; real auth is the Supabase session + `/api/admin/me`. Merge cleanup item, not a feature.

### `src/lib/auth.ts` — IDENTICAL on both branches (`git diff main dev/payments` empty)
Tipster auth helpers, NOT admin: `hashPassword`/`verifyPassword` (salted sha256, `salt:hash`),
`generateSessionToken`, `isStrongPassword`, `normalisePhone` (→ `+256…`). main's
`api/admin/tipsters` POST uses `hashPassword` + `normalisePhone` from here. No merge conflict expected.

---

## 2. Admin slip-review / manual-verification UX on main

main has FOUR tabs: Overview, Tipsters, Revenue, **Review**. (Plus a dead 'ads' tab body.)
`AdminTab = 'overview' | 'ads' | 'tipsters' | 'revenue' | 'review'`.

### `ReviewTab` (main, page.tsx ~line 100) — THE LOAD-BEARING FEATURE AT RISK
This is **slip SETTLEMENT**, distinct from dev/payments' moderation. Flow:
1. `load()` → `GET /api/admin/pending-slips?t=<ts>` (cache:'no-store') → lists slips whose `result` is `pending`/null, with legs + tipster name.
2. Renders each slip: betting_site, leg_count, total_odds, tipster_name, booking_code/posting_mode, slip_price, and each leg (`match`, `pick`, per-leg `result` tick/cross).
3. Three settle buttons per slip → `settle(slipId, 'win'|'loss'|'void')` → `POST /api/admin/settle { slip_id, result, admin_key: token }`. On success the slip is removed from the local list.
4. "Run auto-verification" button → `POST /api/verify` (the football-API settlement job, exists on BOTH branches), then reloads.

**This win/loss/void settlement is what decides slip outcome and feeds the ranking. dev/payments has NO equivalent admin UI or route — it only has hide-toggle + verification_status override. If not ported, manual settlement is lost.**

### Supporting routes for ReviewTab (both DELETED on dev/payments)
- `api/admin/pending-slips/route.ts`: `force-dynamic`, no-store. `db.from('betslips').select('*, betslip_legs(*), tipsters(name, username)')`, `.order('posted_at')`, limit 200; filters in JS to `result ∈ {pending, null}`. Returns `{slips:[{id, betting_site, booking_code, posting_mode, total_odds, leg_count, slip_price, posted_at, tipster_name, legs}]}`. **No auth guard.**
- `api/admin/settle/route.ts`: `POST { slip_id, result, admin_key }`. Valid results `['win','loss','void','pending']`. Updates `betslips.result` + `betslips.result_proof_pending=false`; if win/loss also updates all `betslip_legs.result`. Auth: only via optional `ADMIN_SETTLE_KEY`.

### `api/admin/review/route.ts` (KEPT on dev, but DIFFERENT auth + same purpose)
Manual leg review for **unverifiable** legs (separate from settle):
- main: `GET` (verifyAdminToken) → `betslip_legs` where `result='unverifiable'`, joined to `betslips→tipsters(name)`; returns `{legs:[{id,match,pick,odds,tipster_name}]}`.
- main: `POST { legId, result }` → updates that leg's `result`.
- dev/payments keeps this file but swaps guard to `requireRole('admin')`. Client still passes `x-admin-token` (ignored). Body shape identical. **Low conflict — additive auth swap.**

### dev/payments admin slip UX (what EXISTS there instead)
- `SlipsTab` + `api/admin/slips`: GET lists recent betslips (incl. hidden) with `verification_status, result, total_odds, game_count, markets, earliest_kickoff, hidden`; POST toggles `betslips.hidden` (pull stale slip off marketplace). NOT settlement.
- `api/admin/verify-slip` (NEW): POST `{betslip_id, status∈[verified,failed,rejected,pending]}` (zod) → sets `betslips.verification_status` + `verified_at`. This is verification-status override, NOT win/loss settlement.
- dev also adds `TransactionsTab` + `api/admin/transactions` (payments — out of this area's scope, owned by dev).

**Merge takeaway:** main's Review tab (settle) and dev's Slips/verify-slip tabs are
COMPLEMENTARY, not duplicates. To lose no feature, the merged admin page needs BOTH:
settlement (win/loss/void) AND moderation (hide + verification_status), all re-guarded behind
`requireRole('admin')` instead of localStorage token.

---

## 3. Other main admin routes (status on dev/payments)

| Route | main behavior | main guard | dev/payments |
|---|---|---|---|
| `login` | issue base64 token | none | **DELETED** (Supabase Auth) |
| `pending-slips` | list unsettled slips | **none** | **DELETED** (no settle flow) |
| `settle` | win/loss/void settlement | `ADMIN_SETTLE_KEY` opt | **DELETED** ← FEATURE LOSS RISK |
| `review` | unverifiable-leg manual result | verifyAdminToken | KEPT, guard→requireRole |
| `settings` | `publicSignupsEnabled` toggle | GET public / POST verifyAdminToken | KEPT, guard→requireRole |
| `stats` | counts + recent activity | verifyAdminToken | KEPT, guard→requireRole |
| `tipsters` | CRUD tipster accounts | verifyAdminToken | KEPT, guard→requireRole |
| `ads` | stub (empty list, console.log) | isValidAdminToken | KEPT |
| `revenue` | earnings rollup by tipster | verifyAdminToken | KEPT, guard→requireRole |
| `me` | — | — | **NEW** (Supabase admin check) |
| `slips` | — | — | **NEW** (hide toggle) |
| `verify-slip` | — | — | **NEW** (verification_status override) |
| `transactions` | — | — | **NEW** (payments) |

### Detail on KEPT-but-auth-swapped routes (main versions)
- `settings/route.ts`: **in-memory** `let settings = { publicSignupsEnabled:false }` (resets per deploy/instance — not persisted; comment admits "store in Supabase settings table"). GET is **public** (signup pages read it). POST verifyAdminToken. dev keeps shape, guard→requireRole. *Merge note: still in-memory unless dev changed it — verify; statelessness is a latent bug, not a merge blocker.*
- `stats/route.ts`: parallel counts — `tipsters` count, `slip_purchases` count, `earnings.commission` sum (last 100); recent activity from `slip_purchases` join `tipsters(name)`. Tables touched: `tipsters`, `slip_purchases`, `earnings`.
- `tipsters/route.ts`: GET list (`id,name,username,phone,sport,description,verified,created_at`). POST create → `normalisePhone`, dup-phone check, insert `{name, username:slugify(name), phone, password_hash:hashPassword(password), sport, description}`, returns **plaintext password once** for admin to copy. PATCH `{id,verified}`. DELETE `{id}`. Tables: `tipsters`.
- `revenue/route.ts`: sums `earnings.gross` (total) + `earnings.commission`; `slip_purchases` count; groups commission by `tipster_id` (note: uses tipster_id as display name — cosmetic bug). Tables: `earnings`, `slip_purchases`.
- `ads/route.ts`: pure stub, returns `{ads:[]}`, POST/PATCH only `console.log`. No DB.

### Client (main page.tsx) data flow
- `SESSION_KEY='bf_admin_session'`; token read from localStorage and sent as `x-admin-token` on every admin fetch; also as `admin_key` in settle body.
- Tabs render: Overview (StatCards from `/api/admin/stats`), Tipsters (`TipstersTab`: list + create + verify-toggle + delete + public-signups toggle via `/api/admin/settings`, copies credentials incl. plaintext password), Revenue (`RevenueTab`), Review (`ReviewTab`). 'ads' tab body is a static "contact us" placeholder.

---

## 4. DB columns/tables this area depends on (settlement-critical for merge)

- `betslips`: `result` ('win'|'loss'|'void'|'pending'), `result_proof_pending` (settle clears it), `betting_site`, `booking_code`, `posting_mode`, `total_odds`, `leg_count`, `slip_price`, `posted_at`, `tipster_id`. (dev/payments also relies on `hidden`, `verification_status`, `verified_at`, `game_count`, `markets`, `earliest_kickoff` — confirm column-set union exists in merged schema.)
- `betslip_legs`: `betslip_id`, `result` (incl. value `'unverifiable'`), `match`, `pick`, `odds`, `created_at`.
- `tipsters`: `id,name,username,phone,password_hash,sport,description,verified,created_at`.
- `slip_purchases`, `earnings(gross,commission,tipster_id,created_at)`.
- dev/payments adds `profiles(id, role∈{user,tipster,admin}, email, display_name)` + `tipsters.profile_id` — the basis of the new admin gate.

---

## 5. Rewiring checklist (admin → dev/payments auth)
1. DROP: `src/lib/adminAuth.ts`, `api/admin/login`, the client `AdminLogin` form + `SESSION_KEY`/localStorage + all `x-admin-token`/`admin_key` headers.
2. PORT (do not lose): main's `ReviewTab` settlement UI + `api/admin/pending-slips` + `api/admin/settle`, re-guarded with `requireRole('admin')` (and proper input validation — settle is currently effectively unauthenticated). Replace `admin_key` gate with the session check.
3. KEEP dev's `me`, `slips`, `verify-slip`, `transactions` tabs/routes alongside the ported Review tab — they are additive, not replacements for settlement.
4. Re-guard main's review/settings/stats/tipsters/revenue with `requireRole('admin')` (dev already did this for its copies — reconcile to one version per file).
5. Persist `settings.publicSignupsEnabled` in DB (currently in-memory on main) — latent bug to fix during merge.
6. Page-level: replace client-side `localStorage` auth check with the `/api/admin/me` probe (dev pattern) and `POST /api/auth/logout`.
