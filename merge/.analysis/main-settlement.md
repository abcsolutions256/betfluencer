# main — Football-API Result Settlement (Verifier 2)

Area owner: `main`. Decides whether a **slip WON or LOST** from real match results.
This is **Verifier 2 (result settlement)**, distinct from dev/payments' **Verifier 1 (booking-code validity)** which writes `verification_status`. Do not conflate them.

All file refs below are on `main` (read via `git show main:PATH`). The working tree is `stag` (== dev/payments) and does NOT contain these as written — `src/lib/footballApi.ts`, `src/app/api/verify*`, `src/app/api/fixturetest`, `src/app/api/apitest` are main-only files.

---

## 1. Provider + env key

- **Provider:** API-Football (api-sports.io), API v3. Base URL `https://v3.football.api-sports.io` (`src/lib/footballApi.ts:9`).
- **Env key:** `FOOTBALL_API_KEY` (`footballApi.ts:8`), sent as header `x-apisports-key` (`footballApi.ts:13`). Also read independently (not via the lib) in the two test routes: `apitest/route.ts` and `fixturetest/route.ts`.
- **Free-tier constraints (documented in header comment, footballApi.ts:1-7):**
  - Only ~3-day window: yesterday → +2 days. Older dates blocked.
  - Cannot combine `?date` with `?search` — query by date, match teams client-side.
  - 100 requests/day.

## 2. How legs are matched to fixtures (`footballApi.ts`)

Two resolution paths inside `verifyLeg()` (footballApi.ts:106-141):

1. **By fixture id (PREFERRED but currently DEAD):** if `leg.fixture_id` is set, call `getFixtureById()` → `/fixtures?id=<id>` (footballApi.ts:38-46, 110-114).
   - **CRITICAL GAP:** there is **no `fixture_id` column** on `betslip_legs` in either branch's schema (`main:src/lib/schema.sql:41-49`; `dev/payments:supabase/migrations/20260610000001_init.sql:42-50`). So `leg.fixture_id` is always `undefined` and this fast/reliable path never runs today. It is latent code waiting for a column. Flag for merge: adding a `fixture_id` column would make settlement far more reliable and is a natural enhancement, but is NOT present now.

2. **By teams + date (the path that actually runs):**
   - Split `leg.match` on `/\s+vs\.?\s+/i` into `[home, away]` (footballApi.ts:117-119). If it can't split into 2 → `'unverifiable'`.
   - Derive `date` from `leg.match_time` (`split('T')[0]`), else null (footballApi.ts:121).
   - **Pending guard:** if `match_time` is within the last 2h (match not safely finished), return `'pending'` (footballApi.ts:123-125).
   - `findFixture(home, away, date)` (footballApi.ts:51-86): builds the allowed free-tier date window (`-1..+2` days), queries `/fixtures?date=<d>` for each candidate date, and finds the fixture where BOTH teams pass `teamsMatch()`.
   - `teamsMatch()` (footballApi.ts:31-36) compares `normalize()`-d names: substring either-direction OR first-5-char prefix match. `normalize()` (footballApi.ts:22-29) lowercases and strips `fc|sc|afc|cf|sk|if|ks|women|ladies|w|u\d+|reserves?|ii` tokens and all non-alphanumerics. Fuzzy → can mis-match; first-5-char prefix is loose.
   - No fixture found → `'unverifiable'`.

## 3. Leg result → win/loss computation (`determineResult`, footballApi.ts:143-260)

`verifyLegAgainstFixture(pick, fixture)` (footballApi.ts:90-104):
- Reads `fixture.fixture.status.short`; only `FT|AET|PEN` are considered final, else `'pending'`.
- Pulls `goals.home/away`, `score.halftime.home/away`, team names; calls `determineResult(pick.toLowerCase().trim(), {...})`.

`determineResult` market coverage (returns `'win'|'loss'|'pending'|'unverifiable'`):
- Over/Under N (total goals) — footballApi.ts:152-161
- BTTS / both teams (+ no/not negation) — 163-167
- 1X2: home win / `^1$`, away win / `^2$`, draw / `^x$` — 169-177
- Double chance: `1x`/home-or-draw, `x2`/away-or-draw, `12`/home-or-away — 179-188
- Clean sheet (home/away/either) — 190-194
- Half-time result (draw/home/away) using `score.halftime` — 196-200
- HT/FT → `'unverifiable'` — 202
- Asian/European handicap (regex `([a-z\s]+)\s*([+-]\d+...)`) — 204-214 (note: draw on adjusted score is graded a win; logic is approximate)
- Exact score `N-N` / `N:N` — 216-220
- Exactly N goals — 222-225
- Win by N margin — 227-232
- Score first / first goal — needs `fixture.events` (Goal) — 234-243
- "to score" (anytime, non-first/both) → `'unverifiable'` — 245-247
- Over N cards — needs `fixture.events` (Card) — 249-254
- Fallthrough → `'unverifiable'` (footballApi.ts:256)

Note: `events`-based markets (first goal, cards) require the fixture payload to include `events`, which the bare `/fixtures?date=` and `/fixtures?id=` responses may not contain → those typically resolve `'unverifiable'`.

## 4. Slip-level aggregation

`verifySlip(legs[])` (footballApi.ts:263-274): `Promise.all` over `verifyLeg`, returns `[{id, result}]`.
`calcSlipResult(legResults[])` (footballApi.ts:277-284) precedence:
- any `loss` → `loss`
- any `pending` → `pending`
- any `unverifiable` → `unverifiable`
- all `win` → `win`
- else `pending`

## 5. The orchestrator: `POST /api/verify` (`src/app/api/verify/route.ts`) — CRON ENTRY POINT

- Triggered by **Vercel cron** `path /api/verify`, schedule `0 2 * * *` (2am UTC / 5am Uganda) — `main:vercel.json`.
- Auth: **none** on the POST (open endpoint; relies on cron + obscurity). dev/payments may gate cron differently — reconcile.
- Flow (verify/route.ts:11-71):
  1. Select pending slips: `betslips` where `posting_mode in ('manual','screenshot','booking_code')` AND `result = 'pending'`, joining `betslip_legs(*)`.
  2. Skip slips with **no legs** (verify/route.ts:30) — i.e. booking_code slips that never had legs scraped are left for manual upload.
  3. Time gate: cutoff = max leg `match_time` (fallback `posted_at`); skip unless cutoff is > 3h in the past (verify/route.ts:33-44).
  4. `verifySlip` → `calcSlipResult`; skip if `pending` (verify/route.ts:46-50).
  5. Write each finished leg's `result` (win/loss) to `betslip_legs.result` (verify/route.ts:53-57).
  6. Slip update (verify/route.ts:60-69):
     - `unverifiable` → keep `result='pending'`, set `result_proof_pending=true` (admin-review flag).
     - else → set `betslips.result = slipResult`.
- GET returns a status/info JSON (verify/route.ts:74-80).

**Writing `betslips.result` is what fires the downstream leaderboard machinery** (see §7).

## 6. Columns this writes / reads

- `betslips.result` — `pending|win|loss` (main schema check, `schema.sql:30`). The settlement target.
- `betslips.result_proof_pending boolean` (`schema.sql:35`) — set true when settlement can't grade (admin review queue).
- `betslip_legs.result` — `pending|win|loss` (`schema.sql:48`).
- Reads `betslips.posting_mode`, `betslips.posted_at`, `betslip_legs.match`, `.pick`, `.match_time`.
- `betslips.result_image_url` (`schema.sql:34`) exists for manual result-proof uploads (not written by the verifier).

## 7. Downstream of `result` (why settlement matters — `schema.sql`)

- Trigger `tipster_tick_trigger` fires `after update of result on betslips` (`schema.sql:137-139`) → `update_tipster_tick()` (`schema.sql:101-135`) auto-grants/revokes the verified tick from wins in last-10 + 7-day avg odds.
- View `tipster_rankings` (`schema.sql:140-175`) computes `wins_last_10`, `avg_odds`, and `score = wins_last_10 * avg_odds` from `result='win'`. So result settlement directly drives ranking/score.

## 8. Admin manual settlement: `POST /api/admin/settle` (`src/app/api/admin/settle/route.ts`)

- Body `{ slip_id, result, admin_key }`. Auth: optional `ADMIN_SETTLE_KEY` env; if unset, endpoint is open (settle/route.ts:14-17).
- Accepts `result in ['win','loss','void','pending']` (settle/route.ts:19).
- Updates `betslips.result = result` and `result_proof_pending = false` (settle/route.ts:28-32); if win/loss, cascades to all `betslip_legs` via `.eq('betslip_id', slip_id)` (settle/route.ts:35-40).
- **SCHEMA MISMATCH (main, real):** schema check constraints are `result in ('pending','win','loss')` on BOTH `betslips` (`schema.sql:30`) and `betslip_legs` (`schema.sql:48`). Writing `'void'` will **violate the CHECK constraint and fail** against main's own schema. This is a latent bug on main. dev/payments' init also only allows `pending|win|loss` (`20260610000001_init.sql:30,50`). Merge must add `'void'` to the check constraints (a migration) if void settlement is to work.

## 9. Debug / test routes (main-only, no auth, all `force-dynamic`, `Cache-Control: no-store`)

- `GET /api/verify-debug` (`verify-debug/route.ts`): dry-run of fixture resolution over ALL pending slips with legs (no time restriction), reports api team names/league/status/score per leg. Read-only — does not write results.
- `GET /api/fixturetest` (`fixturetest/route.ts`): probes the free-tier date window + a hardcoded date and team search. Diagnostic only.
- `GET /api/apitest` (`apitest/route.ts`): checks key presence, `/status`, and sample searches. Diagnostic only.
- These leak pending-slip internals with no auth — note for the merge (harmless data but consider gating in prod).

## 10. db.ts

`main:src/lib/db.ts` does NOT contain slip win/loss settlement logic. The only `result` usage is `createTip` inserting `result:'pending'` (db.ts:62-70). All Verifier-2 settlement lives in `footballApi.ts` + `verify/route.ts`. (The task hint about "win/loss computation in db.ts" does not match main — settlement is in footballApi.ts.)

---

## 11. ENTRY-PATH COUPLING (the critical merge seam)

**Today, settlement is NOT coupled to screenshot entry.** `/api/verify` selects ALL `posting_mode in ('manual','screenshot','booking_code')` slips (verify/route.ts:24). The real coupling is to **legs existence and `match_time` quality**, not to entry path:

- Settlement is **leg-driven**. A slip is only gradable if `betslip_legs` rows exist (route skips empty-leg slips, verify/route.ts:30) and each leg has a parseable `"<home> vs <away>"` string + ideally a `match_time`.
- **Screenshot/manual** paths populate legs (and match_time) directly, so they settle.
- **booking_code** slips: `posting_mode='booking_code'` IS already included in the verify query, BUT a code-entered slip only settles **if the bet-code worker (dev/payments) has scraped legs into `betslip_legs` with `match` formatted as `"Home vs Away"` and a `match_time`.** If the worker stores legs in a different shape/table or leaves the slip leg-less, settlement skips it. So the seam is: **the worker's leg output must conform to `betslip_legs(match TEXT "X vs Y", pick, match_time)` for Verifier 2 to grade code-entered slips.**

### Merge requirements so code-entered slips also settle here
1. Bet-code worker must write scraped legs into `betslip_legs` with `match` = `"<Home> vs <Away>"`, a sensible `pick`, and `match_time` (so the 2h/3h finish guards + date resolution work). Confirm the worker's column shape vs this expectation.
2. Keep `'booking_code'` in the verify `posting_mode` filter (already present in main's verify route — main's verify route is AHEAD of main's own schema, which lacks `booking_code`; dev's schema HAS it via `20260610000001_init.sql:27`). The merged schema must allow `posting_mode='booking_code'`.
3. Reconcile the two verifiers: dev's `verification_status` (`pending|verified|failed|rejected`, `20260612120000_auth_paywall_overhaul.sql:39-40`) gates booking-code validity / paywall visibility; main's `result` (`pending|win|loss`) is the win/loss outcome. They are orthogonal columns — keep BOTH. A code slip should be `verification_status='verified'` (worker confirmed the code) AND later `result='win'/'loss'` (Verifier 2 from match results).
4. Add `fixture_id` to `betslip_legs` (optional but high-value) to enable the reliable `getFixtureById` path that is currently dead code.
5. Fix the `'void'` mismatch (§8): admin/settle writes `'void'` but no schema allows it — add to CHECK constraints.

## 12. Risk inventory for the merge (no feature may be lost)
- DEAD path: `fixture_id` resolution (no column) — lib code present, never exercised.
- BUG: `admin/settle` `'void'` violates CHECK constraint on both branches' schemas.
- SCHEMA DRIFT: main's verify route filters `'booking_code'` but main's `schema.sql` posting_mode check only allows `manual|screenshot`. dev's schema adds `booking_code`. The merged schema must be the dev superset.
- Unauthed endpoints: `/api/verify` (POST), `/api/verify-debug`, `/api/fixturetest`, `/api/apitest` — no auth; cron-only by convention.
- Fuzzy team matching (5-char prefix) can mis-grade; free-tier date window (-1..+2d) means slips older than ~2 days past kickoff become `unverifiable` → routed to admin via `result_proof_pending`.
- events-based markets (first goal/cards) likely `unverifiable` unless fixture payload includes `events`.
