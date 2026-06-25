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
