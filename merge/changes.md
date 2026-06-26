# changes.md — manual tweaks during the merge (step e)

> **Status: MERGE EXECUTED.** `main` merged into `stag` (base `dev/payments`).
> Commits: `1b5f531` (merge resolution), `ef3fd50` (migrations). Code typechecks
> clean (`tsc --noEmit`, 0 errors). DB migrations authored but **not yet applied**
> (pending main-DB credentials). e2e/runtime smoke pending (needs DB + services).

## Lineage recap
- `stag` branched from **`dev/payments`** (code base); `main` merged *into* it.
- DB baseline = **`main`'s prod DB**; dev/payments schema layered on as appended
  additive, non-destructive migrations (real data preserved).
- Auth: **`dev/payments`' Supabase Auth only**; main's admin re-wired onto it.
- Settlement: **unified** — code-entered slips also settle via main's football API.

---

## A. Conflict resolutions (15 content conflicts + 2 audited auto-merges)

| File | Resolution | Why |
|---|---|---|
| `src/lib/payments.ts` | dev wholesale | ioTec barrel; no Flutterwave code may return |
| `src/lib/supabase.ts` | dev wholesale | env URL + `no-store` + the `supabase/{client,server,index}` trio for Auth |
| `src/app/api/subscribe/route.ts` | dev wholesale | GET-only "my purchases"; main's mock collect/disburse POST dropped |
| `src/lib/db.ts` | integrate | kept main's `tipster_stats` reads; **dropped dead `tips`/`subscriptions` helpers** (superseded by betslips/slip_purchases) |
| `src/app/api/tips/route.ts` | integrate | **all 3 input methods** (booking_code→screenshot→manual); secrets→`betslip_secrets`; dev `verifyAndRecord` auto-trigger; coded slips start `verification_status='pending'`, others `'verified'` |
| `src/app/api/slips/route.ts` | integrate (dev payload wins) | proof-only, secret-free SELECT; `no-store`; `hidden` filter; no `betslip_legs` join |
| `src/app/api/tipster/[slug]/slips/route.ts` | integrate | main's `note!=='__seed__'` seed-hide **and** dev secret isolation |
| `src/app/api/tipster/route.ts`, `[slug]/stats/route.ts` | integrate | main's `tipster_stats` reads + score recompute |
| `src/app/channel/[slug]/page.tsx` | integrate | main channel UI + dev reveal/paywall + verification badges; two-endpoint fetch; seed-hide |
| `src/app/mine/page.tsx`, `src/components/ui/BetslipFeed.tsx`, `src/app/slips/page.tsx` | integrate (dev model wins) | guest-buyer (`x-buyer-key`) + proof-only + `SlipReveal`/`PaymentSheet`; never expose secrets for unpurchased pending slips |
| `src/app/tipster/dashboard/page.tsx` | dev auth + main rendering | Supabase session via `getMyTipster()`; **logout bug fixed** (now `POST /api/auth/logout`) |
| `src/app/admin/page.tsx` (auto-merge audit) | integrate | dev `/api/admin/me` gate; **grafted main's settlement Review/Settle tab** (the auto-merge had silently dropped it); stripped dead `AdminLogin`/`x-admin-token`/`bf_admin_session` plumbing |
| `src/types/betslip.ts` (auto-merge audit) | union (correct as-merged) | `SlipResult` incl `'void'` + dev `verification_status`/proof fields + `booking_code` mode |

**Dropped (accept deletion):** `api/apitest`, `api/fixturetest`, `api/verify-debug` —
unauthenticated diagnostic routes that leak pending-slip internals (main-bugs #8).
**Stayed deleted (dev wins):** `adminAuth.ts`, `api/admin/login`, `api/tipster/auth`,
`webhooks/flutterwave`, `flutterwave.d.ts`, `africastalking.d.ts`, `TipFeed.tsx`.

### Cross-file reconciliation
- `db.ts` dropped `getTipsByTipster`, but `api/tipster/[slug]/route.ts` still imported
  it (parallel-resolver inconsistency). **Fixed:** trimmed the route to return
  `{ tipster }` only — slips come from `/api/tipster/[slug]/slips`; the channel page
  reads only `d.tipster` from this endpoint, so nothing breaks.

---

## B. New seam code (makes the merge feature-complete)

### B1. Unified settlement seam — `src/lib/verifyCode.ts` (hard requirement, decision #2)
- Added `pickForLeg(NormalizedLeg)`: maps canonical market codes
  (`OU/BTTS/1X2/DC/AH/EH/CS`) into pick strings main's `determineResult`
  (`footballApi.ts`) actually grades (`"over 2.5"`, `"btts yes"`, `"home win"`,
  `"home or draw"`, `"<team> -1"`, `"<team> clean sheet"`). Unsupported markets
  (DNB/OTHER) → best-effort label → settler returns `unverifiable` → admin review.
- In `recordVerification()`, after a slip goes `verification_status='verified'`,
  **project the scraped legs into `betslip_legs`** (replace-then-insert keyed on
  `betslip_id`), mapping `match="Home vs Away"`, `pick`, `odds` (best-effort, NOT
  NULL → fallback 1), `match_time`, `league` (from raw). Filters to well-formed
  legs (needs `match` + `pick`). **This is the single change that lets booking-code
  slips be settled by main's football API** — `verify/route.ts` already grades all
  3 posting modes and its empty-leg guard now passes for code slips.

### B2. Admin re-guard onto Supabase Auth — `api/admin/settle` + `api/admin/pending-slips`
- Both now gate on `requireRole('admin')` (from `@/lib/auth/session`); removed
  `settle`'s legacy `ADMIN_SETTLE_KEY`/`admin_key` open gate and the unauthenticated
  `pending-slips` GET.
- `settle`: cascade now includes `'void'` (valid once migration 0003 widens the
  CHECK); writes `result` + `result_proof_pending=false`.
- `pending-slips`: joins `betslip_secrets(booking_code, betting_site)` since 0005
  moves those off `betslips`; runs under service role so it can read them (admin-only).

### B3. Import fix — `src/app/tipster/dashboard/page.tsx`
- `supabaseBrowser` imported from `@/lib/supabase/client` (was `@/lib/supabase`,
  which doesn't export it) — caught by typecheck.

---

## C. Migration tweaks (post adversarial review)

- **`20260626000000_merge_tipster_stats_view.sql`** — changed from bare
  `create or replace view` (would ERROR on prod: can't change an existing view's
  column set) to an **existence-guarded** `DO/EXECUTE`: creates the reconstruction
  only if the view is absent. On prod the authoritative live view is preserved
  untouched; fresh/e2e DBs get the reconstruction. (Reviewer BLOCKER.)
- **`20260626000001_merge_devpayments_schema.sql`** — `transactions` RLS hardened:
  dropped dev's permissive `for all using(true)` (anon could read financial data),
  left RLS-enabled **default-deny** like `payments`/`earnings`; service-role access
  unaffected. (Reviewer MEDIUM.)
- Reviewer HIGH (nulling `slip_image_url` breaks the public feed) was **verified
  stale** — the merged feed is proof-only and reads images via `betslip_secrets`/
  reveal, never off `betslips`. No change needed.

---

## D. Known follow-ups (tracked, not blocking the code merge)

- **Apply migrations to main's prod** — deferred pending credentials (owner chose
  direct-to-prod). See `merge/db-apply-runbook.md`.
- **`tipster_stats` DDL** — dump `pg_get_viewdef` from prod and replace the
  reconstruction for an exact match.
- **P0 auth backfill (`0005` file)** — needs real per-tipster Supabase Auth users +
  admin UID; the migration is a guarded no-op until those values are supplied.
- **`getMyTipster()`** uses `.single()` (throws on 0 rows) — harden to `.maybeSingle()`
  so unlinked legacy tipsters degrade gracefully (pairs with the backfill).
- **Stray `20260611075122_test.sql`** (0 bytes) — delete + `supabase migration repair`
  if the linked DB recorded that version.
- **Pick-string fidelity** — `pickForLeg` covers the common markets; refine the
  mapping against real Gemini `normalized` output during verification.

---

## E. Prod migration apply — EXECUTED 2026-06-25 (direct-to-prod, `sooutpsbdgqelnnnfezp`)

Owner supplied main-DB creds (`.env`: `DATABASE_URL`, `SUPABASE_DB_PASSWORD`,
`SUPABASE_SERVICE_ROLE_KEY`; CLI linked to `sooutpsbdgqelnnnfezp`). Applied
`20260626000000`–`05` via `supabase db push`. Direct DB host is IPv6-only / unresolved
here → all CLI ops used the **session pooler** (`aws-1-ap-south-1.pooler.supabase.com:5432`,
password URL-encoded).

**Pre-flight.**
- Backups (git-ignored, in `merge/backup/`): `prod_schema_*`, `prod_data_*` (real data:
  29 tipsters, 536 betslips, 25 purchases, + storage), `prod_auth_schema_*`
  (confirmed `auth.users` exists → `profiles` FK resolves).
- Remote migration history was **empty** (main was hand-applied, never used the toolchain)
  → `supabase migration repair --status applied` marked dev `20260610*`–`20260625*` (11
  versions incl. the 0-byte `_test`) so `db push` applied **only** the 6 merge migrations.

**Two fixes made before push (driven by the authoritative prod dump, not `schema.sql`):**
1. **`000001` §11 — drop leftover permissive policy.** The live `tipsters` table carried a
   dashboard-created `"service role full access"` policy (`USING(true)`, no `TO` → PUBLIC,
   incl. anon) that the migration's name-list did **not** drop → anon could still read
   `tipsters` (password_hash + phones) after "hardening". Added
   `drop policy if exists "service role full access" on tipsters;`. Post-apply: **zero**
   policies remain on `tipsters` (service-role-only). Not in `main:schema.sql` (drift) —
   only the live dump revealed it.
2. **`000001` top — `set search_path = public, extensions;`.** uuid-ossp lives in the
   `extensions` schema on prod; the migration's `uuid_generate_v4()` defaults are
   unqualified. Pinned the path so the new-table defaults resolve under `db push` (which
   may not inherit the SQL-Editor path main was built with).

   > Note: `posting_mode` did **NOT** need widening — the live `betslips_posting_mode_check`
   > already includes `booking_code` (prod had drifted ahead of `main:schema.sql`).

**Apply result (exit 0, all NOTICEs benign):** `platform_settings` already exists → skipped;
`betslip_legs.fixture_id` already exists → skipped (`000004` no-op); `000005` ran as the
guarded no-op (backfill placeholders unfilled).

**Post-apply live verification (REST, service role + fresh schema dump
`prod_schema_POSTAPPLY.sql`):**
- New tables present: `profiles`, `transactions`, `slip_verifications`, `betslip_secrets`
  (all 7 pre-existing tables + data preserved).
- `betslip_secrets` = **56** (1 booking_code + 55 slip_image_url) = exactly the betslips
  that held secrets; betslips secret cols now **0** non-empty → COPY-THEN-NULL lossless.
- `verification_status`: 56 verified (= all 56 screenshot slips, via §7 guarded update) /
  480 pending (= all booking_code slips, await worker) / 0 failed.
- `result` CHECK now allows `void` on betslips + betslip_legs.
- `platform_settings`: prod's pre-existing `public_signups_enabled` **not** clobbered
  (seed was `on conflict (key) do nothing`); `platform_commission` added.
- Idempotency audit: every `create table`/`add column`/`create index` is `if not exists`;
  every seed `insert` is `on conflict do nothing`; constraints are drop-if-exists→widen
  (never narrow); data UPDATEs are guarded (`verification_status='pending'` / column-guards).

**Still NOT done (needs owner inputs / further steps):**
- `000005` backfill — all 29 tipsters have `profile_id = NULL` (P0 login dead-end persists
  until per-tipster Auth users created + UIDs filled). Admin promotion likewise pending UID.
- Runtime validation (`next build`, `npm run test:e2e`, live both-inputs→both-verifiers).
- `getMyTipster()` `.maybeSingle()` hardening.

---

## F. Made the WHOLE migration set replay-safe (idempotent) — 2026-06-25

Owner hit `ERROR: relation "tipsters" already exists` running `supabase db push` against a
DB that has the base tables but an **empty** migration history (so push tried to replay the
dev migrations, which used bare `create table`). Fix: made every dev migration idempotent so
a replay skips existing objects / upserts data (no `migration repair` needed anymore).

Edits (the `0626*` merge set was already idempotent):
- **`0001_init`** — all 7 `create table` → `if not exists`; 5 indexes → `if not exists`;
  `tipster_tick_trigger` → `drop trigger if exists` first; `tipster_rankings` view →
  existence-guarded do-block (won't error if a drifted view already exists); seed
  `insert into tipsters` → `on conflict do nothing`.
- **`0002_transactions`** — `create table` → `if not exists`; 4 indexes → `if not exists`;
  `transactions_set_updated_at` trigger + `transactions_service_only` policy → drop-first.
- **`0003_lock_pending_content`** — added the missing `drop policy if exists
  "legs_finished_public"` before its create.
- **`0004_slip_verifications`** — `create table` + 2 indexes → `if not exists`.

Static sweep: 0 bare `create table`/`create index`/`add column`; every policy create has a
matching drop-if-exists; every trigger create has a preceding drop; every seed insert is
`on conflict`.

**Proven** with `merge/backup/test_idempotency.sh` (throwaway `supabase/postgres`,
applies the full set TWICE): PASS 1 (fresh) CLEAN + **PASS 2 (replay onto a populated DB)
CLEAN** — reproduces and clears the owner's error. (Script lives under the git-ignored
`merge/backup/`.)

---

## G. Auth reverted to PHONE identity + screenshots-on-purchase — 2026-06-26

Owner decision (supersedes the merge's "Supabase Auth is the only auth"): **revert logins
to phone numbers, scrap email.** Phone is the identity for tipsters, admins, and buyers.
Buyers stay no-login. A buyer who purchases must see the slip **screenshot + match details**.
**Code-only — no DB migration; no Supabase Auth objects dropped** (profiles / auth trigger /
RLS left dormant). Plan: `~/.claude/plans/iterative-frolicking-matsumoto.md`.

Why it's clean: the 29 prod tipsters' `password_hash` is the sha256 `salt:hash` that
`src/lib/auth.ts#verifyPassword` already validates → they log in with existing passwords (P0
login dead-end resolved, no email backfill — `20260626000005` abandoned). The 25 prod
purchases are already keyed by `user_phone`.

What changed:
- **Session core** — new `src/lib/auth/cookie.ts` (HMAC-signed httpOnly `bf_session`
  `{sub,role,exp}`; key = `SESSION_SECRET` ?? service-role key). `src/lib/auth/session.ts`
  rewritten to back `getSessionUser/getMyTipster/requireRole` + `createSession/clearSession`
  with the cookie. `src/middleware.ts` reduced to a no-op (no Supabase refresh).
- **Tipster** — `POST /api/tipster/auth` (login/signup, phone+password → cookie); removed
  `/api/tipster/register`; login/signup pages rewritten phone-only.
- **Admin** — `POST /api/admin/login` (phone ∈ `ADMIN_PHONES` + `ADMIN_PASSWORD` → admin
  cookie, server-validated, not forgeable). Inline login gate on `src/app/admin/page.tsx`.
  All `/api/admin/*` keep `requireRole('admin')`.
- **Buyer = phone** — `src/lib/buyer.ts` (`buyerIdentity`/`buyerFromRequest`); entitlement
  keyed on `slip_purchases.user_phone` in `payments/initiate`, `slips/[id]/reveal`,
  `subscribe`. `src/lib/guestId.ts` → `bf_buyer_phone` + `x-buyer-phone`. Mine page = phone
  lookup. Owner check = `session.sub === tipster.id`.
- **Screenshots** — upload moved server-side (`POST /api/tipster/upload`, service role) so it
  doesn't need a Supabase session; stored in `betslip_secrets.slip_image_url` by `/api/tips`;
  `SlipReveal` now shows the image **+ parsed match-detail legs**; dashboard requires the file
  and aborts on upload failure (no more silent imageless "screenshot" slips). Live audit: of
  71 screenshot slips, 56 have images; the 15 without are all finished/free (not sellable).
- **Email/Supabase scrapped** — deleted `/login` + `/signup` pages, removed the TopBar
  account button; `auth/logout` clears the cookie; anon/session supabase clients now unused
  (files left in place). Card `user_email` kept (an ioTec card detail, not a login).
- **Env** — add `ADMIN_PHONES` (comma list); `SESSION_SECRET` optional. Documented in
  `.env.local.example`. **CLAUDE.md updated.**
- **e2e** — fixtures/specs/`scripts/e2e.sh`/`global-setup` switched to phone auth
  (tipster phone signup/login, admin phone login, buyer reveal by `x-buyer-phone`).

Verification: **`npm run build` green (twice)**. The `npm run test:e2e` merge gate could not
complete in this environment — `supabase start` failed on flaky-network truncated image pulls
+ an unhealthy Logflare analytics container (Playwright never ran). Re-run on a stable network
(or with analytics excluded) to close the gate.
