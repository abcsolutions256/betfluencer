# Merge Conflict Log — PRE-MERGE FORECAST

> **STATUS: PRE-MERGE PREDICTION (forecast only).** The actual merge has **not** run.
> This is the predicted conflict map + resolution plan for merging `main` **into** `stag`
> (where `stag == dev/payments`). The real `git merge` happens later (step *e*); this
> document is the plan engineers execute against. Re-confirm against the real conflict
> markers once the merge runs — git's textual conflict detection may differ from a
> file-level forecast (a file "modified on both sides" can still auto-merge if the hunks
> don't overlap, and vice-versa for rename/whitespace cases).

## Orientation

- **Merge base:** `b2b4f8b` (`git merge-base main dev/payments`).
- **Branch tips:** `main` = `40ba53c` (wins-out-of-settled ranking fix); `dev/payments` = `233cb9c` (Supabase-Auth migration).
- **Working tree = `stag` (== `dev/payments`).** dev files read directly; `main` read via `git show main:PATH`.
- **Diff size:** `git diff --name-status main dev/payments` → **144 entries** differ (incl. several spurious `D` lines like `p.user_phone)).size`, `r.id`, `since28)` that are diff-tool artifacts of multi-line deletions, not real files).
- **Direction matters:** we merge `main` INTO `stag`. So in `ours/theirs` terms, **`ours` = dev/payments**, **`theirs` = main**. "dev-wins" = keep `ours`; "main-wins" = take `theirs`; "integrate" = hand-resolve.

### Owner map (per §10 of the merge charter)

| Domain owner | Owns |
|---|---|
| **dev** (`ours`) | payments (ioTec), bet-code worker, code-parsing/verification, **auth (Supabase)**, infra/Docker/migrations, e2e suite |
| **main** (`theirs`) | ranking/leaderboard, screenshot entry + parse, channels, **football-API settlement**, slip-review (settle) admin, schema DATA baseline |
| **shared → integrate** | the match/leg model (`betslips`/`betslip_legs` + verification/settlement columns), the admin shell (`admin/page.tsx` + shared admin routes) |

### How to read the per-file verdicts

Computed with `git diff --quiet <base> <branch> -- <file>` on each side (exit 1 = changed, 0 = unchanged):

- **both sides changed** → real **textual conflict candidate** → resolution noted per file.
- **dev-only changed** (main untouched since base) → **auto-merges to dev's version**; no markers. Flagged only where it carries a *semantic* trap.
- **main-only changed** (dev untouched since base) → **auto-merges to main's version**; no markers. These are where main's owned features land cleanly — verify they still compile against dev's schema/types.
- **delete/modify** → git **does** raise a conflict when a file deleted on `ours` was modified on `theirs` since base.

---

## SUMMARY TABLE — predicted conflicts by file

| File | main chg? | dev chg? | Conflict type | Domain | Resolution |
|---|:--:|:--:|---|---|---|
| `src/lib/schema.sql` | no | yes | clean (dev) — but semantic | schema (shared) | **integrate** (regen from migrations; never let main's NOT NULLs/Flutterwave win) |
| `src/lib/rls.sql` | no | yes | clean (dev) — but semantic | schema (shared) | **dev-wins** (hardened RLS) |
| `src/lib/db.ts` | yes | yes | textual | shared/legacy | **integrate** (keep main's `tipster_stats` reads; drop dead `tips`/`subscriptions`) |
| `src/lib/footballApi.ts` | yes | no | clean (main) | settlement (main) | **main-wins** (auto) |
| `src/lib/payments.ts` | yes | yes | textual | payments (dev) | **dev-wins** (ioTec barrel; kill Flutterwave) |
| `src/lib/supabase.ts` | yes | yes | textual | infra/auth (dev) | **dev-wins** (env URL + no-store; +new `supabase/` clients) |
| `src/types/betslip.ts` | yes | yes | textual | shared model | **integrate** (union the type) |
| `src/types/index.ts` | no | yes | clean (dev) | shared model | **dev-wins** (verify ranking still reads its fields) |
| `src/app/admin/page.tsx` | yes | yes | textual | admin shell (shared) | **integrate** (dev gate + main's Review/Settle tab) |
| `src/app/rankings/page.tsx` | yes | no | clean (main) | ranking (main) | **main-wins** (auto) |
| `src/app/channel/[slug]/page.tsx` | yes | yes | textual | channels (main) | **integrate** (main UI + dev reveal/paywall) |
| `src/app/mine/page.tsx` | yes | yes | textual | shared page | **integrate** (dev guest-buyer model) |
| `src/app/slips/page.tsx` | yes | yes | textual | shared feed | **integrate** (dev paywall feed) |
| `src/components/layout/Navigation.tsx` | no | yes | clean (dev) | infra/auth (dev) | **dev-wins** |
| `src/components/ui/BetslipFeed.tsx` | yes | yes | textual | shared feed | **integrate** (dev proof-only + buy button) |
| `src/components/ui/ImageUpload.tsx` | yes | no | clean (main) | screenshot (main) | **main-wins** (auto) |
| `src/components/ui/WinHistory.tsx` | yes | no | clean (main) | ranking (main) | **main-wins** (auto) |
| `src/app/api/slips/route.ts` | yes | yes | textual | shared feed | **integrate** |
| `src/app/api/subscribe/route.ts` | yes | yes | textual | payments (dev) | **dev-wins** (GET-only purchases) |
| `src/app/api/tips/route.ts` | yes | yes | textual | shared entry | **integrate** (3 input methods + verify trigger) |
| `src/app/api/tipster/[slug]/route.ts` | yes | yes | textual | channels (main) | **integrate** |
| `src/app/api/tipster/[slug]/slips/route.ts` | yes | yes | textual | channels (main) | **integrate** (seed-hide + secret isolation) |
| `src/app/api/tipster/[slug]/stats/route.ts` | yes | yes | textual | ranking (main) | **integrate** |
| `src/app/api/tipster/route.ts` | yes | yes | textual | channels/ranking (main) | **integrate** |
| `src/app/api/verify/route.ts` | yes | no | clean (main) | settlement (main) | **main-wins** (auto) |
| `src/app/api/parse-slip/route.ts` | yes | no | clean (main) | screenshot (main) | **main-wins** (auto) |
| `src/app/api/admin/{ads,revenue,review,settings,stats,tipsters}/route.ts` | no | yes | clean (dev) — semantic trap | admin (shared) | **dev-wins** (requireRole), drop main's token client |
| `src/app/tipster/dashboard/page.tsx` | yes | yes | textual | auth (dev) | **dev-wins** (Supabase session; fix logout) |
| `src/app/tipster/login/page.tsx` | no | yes | clean (dev) | auth (dev) | **dev-wins** |
| `src/lib/adminAuth.ts` | unchanged | deleted | clean delete | auth (dev) | **dev-wins** (stays deleted) |
| `api/admin/login`, `api/tipster/auth`, `webhooks/flutterwave`, `flutterwave.d.ts`, `africastalking.d.ts`, `TipFeed.tsx` | unchanged | deleted | clean delete | auth/payments (dev) | **dev-wins** (stay deleted) |
| `api/admin/pending-slips/route.ts` | **modified** | deleted | **DELETE/MODIFY** | settlement-admin (main) | **resurrect main + re-guard** (do NOT lose) |
| `api/admin/settle/route.ts` | **modified** | deleted | **DELETE/MODIFY** | settlement-admin (main) | **resurrect main + re-guard** (do NOT lose) |
| `api/apitest/route.ts`, `api/fixturetest/route.ts`, `api/verify-debug/route.ts` | **modified** | deleted | **DELETE/MODIFY** | settlement diag (main) | **dev-wins** (accept deletion) or keep gated — decide |

---

## DOMAIN 1 — SCHEMA / MODEL (shared → integrate; dev migrations are source of truth)

### `src/lib/schema.sql` — *clean auto-merge to dev, but a semantic landmine*
- **Why it (almost) conflicts:** only **dev** changed it since base (`main=0 dev=1`), so git auto-takes dev's version with no markers. The danger is the opposite of a textual conflict: a clean auto-merge that **silently keeps the wrong file**. `schema.sql` is a *stale reference* on dev (reflects only migrations 0001–0003) and a *drifting manual baseline* on main (the live DB has columns/views — `tipster_stats`, `betslips.booking_code`/`betting_site`, widened `posting_mode` CHECK — that the file lacks).
- **Owner:** schema baseline (main owns the DATA; dev owns the formal migration set).
- **Resolution: INTEGRATE — do not trust `schema.sql` as truth.** The authoritative schema is `supabase/migrations/*` (dev) layered on a recovered **`0000_main_baseline.sql`** capturing main's *live* DB (see `merge/db-harmonization.md`). After merge, regenerate or delete `src/lib/schema.sql`/`rls.sql` rather than letting them drive harmonization.
- **Hard constraints that must survive (non-negotiable):**
  - `betslips.total_odds` / `leg_count` must be **nullable** (dev) — main's NOT NULL is incompatible with booking-code slips that have no odds until scraped.
  - `posting_mode` CHECK must be the **dev superset** `('manual','screenshot','booking_code')`.
  - `slip_purchases.status` must allow `('pending','active','refunded')` default `pending` (dev/0002).
  - Flutterwave `payments.flw_ref` may linger (additive/harmless) but no Flutterwave *code* may resurrect.

### `src/lib/rls.sql` — *clean auto-merge to dev*
- **Why:** `main=0 dev=1` → auto-takes dev. Correct outcome, flagged so nobody "restores" main's policies.
- **Resolution: DEV-WINS.** dev removed main's permissive `using(true)` policies and locked everything to service-role / finished-only public reads (migration 0003 + 0005). **main's open RLS must NOT win** — keeping it re-leaks pending booking codes, `betslip_secrets`, and `tipsters.password_hash` to the anon key.
- Carry the dev policies: `betslips_verified_public`, `legs_finished_public`, `purchases_owner_read` (`buyer_id=auth.uid()`), `profiles_self_read/_update`, service-role-only on `tipsters/payments/earnings/betslip_secrets/slip_verifications/platform_settings`.
- **Security follow-up (not a conflict, flag during harmonization):** `transactions_service_only FOR ALL USING(true)` is permissive — should be no-policy/deny like `payments`/`earnings`.

### `src/types/betslip.ts` — *textual conflict (both sides)*
- **Why it conflicts:** both branches edited the slip/leg TS contract. main added ranking-facing bits (`SlipResult` incl. `'void'`, market/odds filters used by WinHistory/slip cards); dev added paywall/verification fields (`verification_status`, proof columns, `betslip_secrets`-shaped reveal type, `posting_mode:'booking_code'`).
- **Owner:** the match/leg model is **shared**.
- **Resolution: INTEGRATE — union the type.** Keep main's `SlipResult` union (incl. `'void'`) and odds/market helpers; keep dev's `verification_status` (`pending|verified|failed|rejected`), proof fields (`game_count`, `markets`, `leagues`, `earliest_kickoff`, `total_odds`), and the `'booking_code'` posting mode. These are orthogonal columns on the same entity — neither replaces the other.

### `src/types/index.ts` — *clean auto-merge to dev*
- **Why:** `main=0 dev=1`. dev pared down stale interfaces (`Tip`/`Subscription`/`Payment` legacy) and added `Role`/`Profile`/payment types.
- **Resolution: DEV-WINS**, but **verify** the ranking page still gets the fields it reads. `TipsterPublic` in `index.ts` is narrower than what `rankings/page.tsx` actually consumes (`losses`, `slips_posted`, `roi`, `last5`, `slug`) — the page uses its own local `TipsterRow`, so dropping/narrowing `TipsterPublic` is safe, but confirm no main file imports a field dev removed.

### `src/lib/db.ts` — *textual conflict (both sides)*
- **Why it conflicts:** both edited the legacy query layer. main kept/uses the live `tipster_stats` reads (`getAllTipsters`, `getTipsterByIdentifier` order by `score`); dev pruned/changed surrounding helpers.
- **Owner:** shared (mostly legacy).
- **Resolution: INTEGRATE.** **Keep main's `.from('tipster_stats')` reads** — channels + rankings depend on them. The rest of `db.ts` (`.from('tips')`, `.from('subscriptions')`) is **dead on both branches** (superseded by `betslips`/`slip_purchases`); resolve toward removing it, but do not drop the `tipster_stats` helpers. **Cross-cutting dependency:** the merged DB MUST expose a `tipster_stats` view (it lives only in the live DB, not in any tracked SQL on either branch) or every channel/ranking read returns empty — capture its DDL into the baseline migration.

---

## DOMAIN 2 — SETTLEMENT (main owns; mostly clean, but two delete/modify conflicts)

### `src/lib/footballApi.ts` — *clean auto-merge to main*
- **Why:** `main=1 dev=0` (dev never touched it). git takes main's version with no markers.
- **Resolution: MAIN-WINS (auto).** This is Verifier 2 (win/loss settlement) — preserve verbatim. Confirm it still compiles against the merged schema (it reads `betslip_legs.match/pick/match_time`, writes `betslips.result` + `result_proof_pending`; the `fixture_id` path is dead — no such column on either branch).

### `src/app/api/verify/route.ts` — *clean auto-merge to main*
- **Why:** `main=1 dev=0`. The cron settlement orchestrator. **MAIN-WINS (auto).**
- **Integration check (the UNIFIED-settlement hard requirement, charter §2):** main's verify query already filters `posting_mode in ('manual','screenshot','booking_code')` and grades any slip that has `betslip_legs` rows. For **code-entered slips to settle here**, the bet-code worker's scraped legs must land in `betslip_legs` as `match = "<Home> vs <Away>"` + `pick` + `match_time`. **Today they do NOT** — dev's worker writes legs into `slip_verifications.normalized` (jsonb), not `betslip_legs`. **This is the principal post-merge integration task, not a textual conflict:** add a path that materializes verified `slip_verifications.normalized` legs into `betslip_legs` so Verifier 2 can grade booking-code slips. Track separately from the merge resolution.

### `src/app/api/admin/pending-slips/route.ts` — **DELETE/MODIFY CONFLICT**
- **Why git raises it:** file is **deleted on dev** but **modified on main since base** (`main_changed=1`). git emits a `CONFLICT (modify/delete)`.
- **Owner:** slip-review/settlement admin = **main**.
- **Resolution: RESURRECT MAIN'S FILE — do NOT accept the deletion.** This is the settlement hub feed (pending betslips + legs + tipster name, force-no-store). Re-add it and **re-guard with `requireRole('admin')`** (main shipped it with **no auth guard**). This is a feature, not a payment leftover.

### `src/app/api/admin/settle/route.ts` — **DELETE/MODIFY CONFLICT**
- **Why git raises it:** deleted on dev, modified on main since base. `CONFLICT (modify/delete)`.
- **Owner:** settlement admin = **main**.
- **Resolution: RESURRECT MAIN'S FILE.** Manual win/loss/void settlement (`betslips.result` + `result_proof_pending=false`, cascades `betslip_legs.result`). dev has **no equivalent** — losing it loses manual settlement. **Re-guard:** replace the optional `ADMIN_SETTLE_KEY`/open-endpoint gate with `requireRole('admin')`. **Schema dependency:** `'void'` violates the current `result` CHECK on *both* branches — the merge must add `'void'` to the `betslips.result` + `betslip_legs.result` CHECK constraints (additive migration) or settle-void 500s.

### `src/app/api/{apitest,fixturetest,verify-debug}/route.ts` — **DELETE/MODIFY CONFLICTS (x3)**
- **Why git raises them:** deleted on dev, modified on main since base.
- **Owner:** settlement diagnostics (main); unauthenticated probes.
- **Resolution: DECISION REQUIRED — default DEV-WINS (accept deletion).** These are no-auth diagnostic routes that leak pending-slip internals. Recommend taking the deletion (resolve `--ours`). If kept for ops, gate behind `requireRole('admin')`. Not feature-bearing — safe to drop.

---

## DOMAIN 3 — AUTH (dev wins; this is the one non-additive area)

> Charter §3: dev/payments' Supabase Auth is the **only** auth. main's admin/tipster
> features re-wire onto it. Below, "clean delete" means git removes the file with no
> conflict because main never touched it since base — but each is an intentional
> auth-model replacement, listed so no one "restores" them.

### Clean deletions (dev-wins, no markers) — *do not restore*
`main_changed_since_base=0` for all of these, so git deletes them cleanly:
- `src/lib/adminAuth.ts` — shared-password / `x-admin-token` / base64 token scheme. **Replaced** by `requireRole('admin')` + `profiles.role`. (Carried a hardcoded `ADMIN_PASSWORD` default — its removal is a security win.)
- `src/app/api/admin/login/route.ts` — base64 token issuer. Gone (Supabase session is the login).
- `src/app/api/tipster/auth/route.ts` — legacy phone+bcrypt tipster auth. Gone (Supabase Auth).
- **Env name retired:** `ADMIN_PASSWORD` (and the `x-admin-token` header contract).

### `src/app/api/admin/{ads,revenue,review,settings,stats,tipsters}/route.ts` — *clean auto-merge to dev, SEMANTIC trap*
- **Why no textual conflict:** `main=0 dev=1` for all six — main didn't touch them since base, so git **auto-takes dev's `requireRole` versions**.
- **Owner:** admin shell = shared; **auth = dev**.
- **Resolution: DEV-WINS (auto) — but verify the client side.** dev already swapped these to `requireRole('admin')` and fixed column bugs (`review`: order by `match_time` not `created_at`; `stats`: `slip_purchases.purchased_at` not `created_at`; `tipsters`: adds `commission_rate`; `settings`: persists to `platform_settings` instead of in-memory). **The trap:** the merged `admin/page.tsx` (see Domain 5) must stop sending `x-admin-token` and stop relying on `localStorage[bf_admin_session]`; these routes now read the Supabase session cookie. The header is ignored, so it "works" by accident — clean it up.

### `src/app/tipster/login/page.tsx` — *clean auto-merge to dev*
- `main=0 dev=1`. **DEV-WINS** — email+password → `supabaseBrowser().auth.signInWithPassword` → `/tipster/dashboard`.

### `src/app/tipster/dashboard/page.tsx` — *textual conflict (both sides)*
- **Why it conflicts:** both edited the dashboard. main edited slip/earnings rendering; dev rewired it onto Supabase Auth (`getMyTipster()` via `tipsters.profile_id == auth.uid()`).
- **Resolution: DEV-WINS on the auth wiring**, integrate any main rendering changes on top.
- **Carries the P0 + a logout bug (flag, fix during merge):**
  - **P0:** legacy + seeded tipsters have `tipsters.profile_id = NULL` (migration 0005 adds the column, never backfills, and provides no Supabase-Auth users for them) → `getMyTipster()` finds nothing → dashboard infinite-bounces to `/tipster/login`. Needs a **backfill/link migration** + harden `getMyTipster()` to `.maybeSingle()`.
  - **Logout bug:** dashboard "Sign out" only does `localStorage.removeItem('bf_tipster_id')` (a dead key) + redirect; it never calls `/api/auth/logout` or `auth.signOut()`, so the session survives. Fix to call `POST /api/auth/logout`.

---

## DOMAIN 4 — PAYMENTS / BET-WORKER / CODE-PARSE (dev wins; mostly additive)

### `src/lib/payments.ts` — *textual conflict (both sides)*
- **Why it conflicts:** both edited it, but it's a wholesale replacement — main = big Flutterwave client; dev = 1-line barrel `export * from './iotec'`.
- **Resolution: DEV-WINS.** Take dev's barrel. **No Flutterwave code may resurrect.** Also stays-deleted (clean, main unchanged): `webhooks/flutterwave/route.ts`, `types/flutterwave.d.ts`, `types/africastalking.d.ts`. New dev files come in additively (no main counterpart): `iotec.ts`, `transactions.ts`, `fulfillment.ts`, `types/payments.ts`, all `api/payments/*`, `api/webhooks/iotec`.

### `src/lib/supabase.ts` — *textual conflict (both sides)*
- **Why it conflicts:** both edited the client wiring. main hardcoded the prod project URL in `supabaseServer()`; dev reads `NEXT_PUBLIC_SUPABASE_URL` from env, forces `cache:'no-store'`, and adds the `src/lib/supabase/{client,server,index}.ts` split for Supabase Auth (anon session vs service-role).
- **Resolution: DEV-WINS** (env-URL + no-store fix + the new client trio). Integrate any main call-site that imported from `supabase.ts` so it resolves to the right new helper. The new `supabase/` directory files are additive (no main version).

### `src/app/api/subscribe/route.ts` — *textual conflict (both sides)*
- **Why it conflicts:** main = synchronous mock collect/disburse POST; dev = GET-only "my purchases" list (the legacy POST body is gone).
- **Resolution: DEV-WINS.** Do not let main's POST collect/disburse body return.

### `src/app/api/slips/route.ts` — *textual conflict (both sides)*
- **Why it conflicts:** both edited the public feed endpoint. main's feed shape vs dev's paywall feed (proof-only payload, `Cache-Control: no-store`, hidden-flag filter).
- **Owner:** shared feed.
- **Resolution: INTEGRATE — dev's paywall payload wins for the secret-isolation guarantee** (feed must never include `booking_code`/`betting_site`/legs for pending coded slips; e2e spec 03/04 assert this). Layer any main display fields on top. Keep dev's no-store header and `hidden` filter.

### Bet-worker + code-parse — *additive, NO conflict (main never had these paths)*
- The entire `bet-code-worker/` service, `src/lib/verifyCode.ts`, `src/app/api/slips/{verify-code,sync-codes,[id]/reveal}/route.ts`, `src/lib/{bettingSites,guestId,slipStatus}.ts`, the `sync` container, and all `supabase/migrations/*` are **dev-only adds** — no main counterpart, no conflict. Bring verbatim. Keep `bettingSites.ts` ↔ `adapters.js` in sync.

---

## DOMAIN 5 — ADMIN SHELL + SHARED PAGES (integrate)

### `src/app/admin/page.tsx` — *textual conflict (both sides) — the headline integration*
- **Why it conflicts:** both heavily edited (+397 lines on dev's side of the diff). main's tabs = Overview / Tipsters / Revenue / **Review (settle win/loss/void)**; dev's = Overview / Tipsters / Revenue / Review(leg-level) / **Slips (hide)** / **Transactions**, gated by `/api/admin/me` instead of a localStorage token.
- **Owner:** admin shell = **shared → integrate**.
- **Resolution: INTEGRATE.** Keep **dev's `/api/admin/me` Supabase gate** + logout via `POST /api/auth/logout`. **Graft main's ReviewTab (slip settlement → `pending-slips` + `settle`)** on as its own tab alongside dev's Slips/Verify-slip/Transactions tabs — they are **complementary, not duplicates** (settlement vs moderation/verification-status). **Strip the dead plumbing** dev left behind: `AdminLogin` component, `SESSION_KEY='bf_admin_session'`, `/api/admin/login` fetch, and all `x-admin-token` / `token=` props (routes now read the session cookie; the props are dead).

### `src/app/channel/[slug]/page.tsx` — *textual conflict (both sides)*
- **Owner:** channels = **main**.
- **Resolution: INTEGRATE — main's channel UI wins**, wire in dev's reveal/paywall + verification badges. Preserve main's win-rate-over-settled math, seed-hide reliance on `betslips.note='__seed__'`, and the two-endpoint fetch (`/api/tipster/[slug]` for profile + `/api/tipster/[slug]/slips` for slips).

### `src/app/api/tipster/route.ts`, `[slug]/route.ts`, `[slug]/slips/route.ts`, `[slug]/stats/route.ts` — *textual conflicts (all four, both sides)*
- **Owner:** channels + ranking = **main**.
- **Resolution: INTEGRATE — keep main's data shape + ranking/seed logic; apply dev's schema-aware reads.**
  - `route.ts` / `stats`: keep main's `tipster_stats` reads and JS score recompute (`score = wins×avg_odds` in stats route; page uses winRate×odds). Preserve the live-view dependency (`losses`, `slips_posted`, `roi`, `last5`, `created_at` columns).
  - `[slug]/slips`: keep main's `note !== '__seed__'` seed-hide filter **AND** dev's secret isolation (booking code/site read from `betslip_secrets`, never returned in the public list).

### `src/app/api/tips/route.ts` — *textual conflict (both sides)*
- **Owner:** shared entry (main = screenshot/manual insert; dev = booking-code + verify trigger).
- **Resolution: INTEGRATE — keep ALL THREE input methods** (`booking_code` → `screenshot` → `manual`, chosen by present field; charter §4). Keep dev's fire-and-forget `verifyAndRecord(...)` auto-trigger on coded slips and the move of `booking_code`/`betting_site` into `betslip_secrets`. Booking-code slips start `verification_status='pending'`; manual/screenshot start `'verified'`.

### `src/app/mine/page.tsx`, `src/components/ui/BetslipFeed.tsx` — *textual conflicts (both sides)*
- **Owner:** shared feed/buyer pages.
- **Resolution: INTEGRATE — dev's guest-buyer + proof-only model wins** (BetslipFeed renders proof-only for pending slips + `BuySlipButton`; `mine` uses the `x-buyer-key` guest identity, not phone-only). Layer main's display refinements on top. The feed must never expose secrets for unpurchased pending slips.

### `src/components/layout/Navigation.tsx` — *clean auto-merge to dev*
- `main=0 dev=1`. **DEV-WINS** (adds auth-aware nav entries). e2e spec 01 asserts the bottom nav (Channels/Rankings/Mine) — keep dev's labels.

### `src/app/rankings/page.tsx`, `src/components/ui/WinHistory.tsx`, `src/components/ui/ImageUpload.tsx` — *clean auto-merge to main*
- All `main=1 dev=0`. **MAIN-WINS (auto).** ranking page (winRate×odds score, `rk-optional` responsive hide, Score toggle), WinHistory badge/modal, and screenshot ImageUpload are main-owned and untouched by dev. Verify they compile against dev's types/schema (rankings reads the live `tipster_stats`; ImageUpload feeds main's `parse-slip`). e2e spec 07 smoke-tests `/rankings` copy ("Betfluencer rankings", "Last 28 days").

---

## CROSS-CUTTING ITEMS (not file conflicts, but block a clean merge)

1. **`tipster_stats` view exists only in the live DB** — no tracked SQL on either branch defines it (both define `tipster_rankings`). Channels + rankings + stats all query `tipster_stats` with columns (`losses`, `slips_posted`, `roi`, `last5`, `created_at`) absent from `tipster_rankings`. **Recover its DDL into the baseline migration or every channel/ranking page degrades to empty.** (See `merge/db-harmonization.md`.)
2. **Unified settlement seam (charter §2):** worker writes legs to `slip_verifications.normalized`, but Verifier 2 (`/api/verify`) grades only `betslip_legs`. Add a materialization path so verified code-slip legs reach `betslip_legs` (`match="X vs Y"`, `pick`, `match_time`). Post-merge integration task.
3. **`'void'` CHECK gap:** `admin/settle` writes `'void'`, no schema allows it. Additive migration to widen `betslips.result` + `betslip_legs.result` CHECKs.
4. **P0 tipster login:** legacy/seeded `tipsters.profile_id = NULL` → dashboard redirect loop. Backfill/link migration + `.maybeSingle()` hardening required with the merge.
5. **Empty dummy migration `20260611075122_test.sql`** (0 bytes): decide delete + `supabase migration repair` rather than carrying it forward.
6. **e2e suite is the merge gate** (`npm run test:e2e`). It hard-depends on `supabase/migrations/*` (not `schema.sql`). UI-coupled assertions key on dev's copy — if main's home/rankings/dashboard copy wins anywhere, specs 01/03/05/06/07 selectors need updates (copy-drift, not feature loss).
7. **Diff-artifact "files":** the `D` entries `p.user_phone)).size`, `r.id`, `s.result`, `since28)` in `git diff --name-status` are multi-line-deletion artifacts, not real paths — ignore them in the merge.

---

## RESOLUTION CHEAT-SHEET (apply at merge time)

- **Take `--ours` (dev) wholesale:** `rls.sql`, `payments.ts`, `supabase.ts`, `types/index.ts`, `subscribe/route.ts`, `Navigation.tsx`, `tipster/login`, `tipster/dashboard` (auth wiring), all `admin/*` shared routes; keep all dev deletions of Flutterwave/legacy-auth files.
- **Take `--theirs` (main) wholesale (auto-clean, just verify build):** `footballApi.ts`, `verify/route.ts`, `parse-slip/route.ts`, `rankings/page.tsx`, `WinHistory.tsx`, `ImageUpload.tsx`.
- **Resurrect from main (delete/modify):** `admin/pending-slips/route.ts`, `admin/settle/route.ts` → re-add + `requireRole('admin')`.
- **Accept deletion (delete/modify), default:** `apitest`, `fixturetest`, `verify-debug` (or keep gated — decide).
- **Hand-integrate (both sides):** `schema.sql`(→regen), `db.ts`, `betslip.ts`, `admin/page.tsx`, `channel/[slug]/page.tsx`, `mine/page.tsx`, `slips/page.tsx`, `BetslipFeed.tsx`, `api/slips/route.ts`, `api/tips/route.ts`, all four `api/tipster/*` routes.

---

## AS EXECUTED (step e — actual merge outcome)

> The merge ran (`git merge main` into `stag`; commit `1b5f531`). Actuals vs the
> forecast above:

**15 real content conflicts (`UU`)** — matched the forecast's "integrate"/"dev-wins"
set: `db.ts`, `payments.ts`, `supabase.ts`, `subscribe`, `slips/route`, `tips/route`,
all four `tipster/*` routes, `channel/[slug]/page`, `mine/page`, `slips/page`,
`BetslipFeed`, `tipster/dashboard`. Resolved per the cheat-sheet. See `merge/changes.md` §A.

**Forecast corrections:**
- `settle` / `pending-slips` / `apitest` / `fixturetest` / `verify-debug` were predicted
  as *delete/modify* conflicts. **Actual:** they were *added on main after the merge base*
  (never on dev/payments), so they came in cleanly as `A` (no conflict). `settle` +
  `pending-slips` kept & re-guarded; the 3 debug routes `git rm`'d.
- `src/types/betslip.ts` and `src/app/admin/page.tsx` were predicted as textual conflicts
  but **auto-merged** (no markers). Audited both: `betslip.ts` auto-merge was a correct
  union (kept); `admin/page.tsx` auto-merge had **silently dropped main's settlement
  Review tab** → rewritten to graft it back and strip dead login plumbing.
- `schema.sql` / `rls.sql` / `types/index.ts` / `Navigation.tsx` / `tipster/login` /
  shared `admin/*` routes auto-merged to dev as forecast (no markers).

**Cross-file fix not in the forecast:** parallel resolvers disagreed on the dead `tips`
table — reconciled by trimming `api/tipster/[slug]/route.ts` to drop `getTipsByTipster`.

**Validation:** `tsc --noEmit` clean (0 errors).
