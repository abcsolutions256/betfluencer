# Slip Lifecycle — End-to-End Flow (§5) AS IT WILL BE BUILT

**Doc scope:** the merged `stag` (== `dev/payments`) ← `main` slip pipeline, from input
through settlement, after the additive merge. This is the **target-state** flow, not
either branch as it stands today.

**Audience:** senior engineers performing the merge.

**Fixed owner decisions this doc is bound by:**
1. Additive, non-destructive DB only; backfill main's real users into dev's Supabase Auth.
2. **Settlement is UNIFIED** — a booking-code slip MUST be gradable by main's football-API
   verifier through the common match/leg model. (Hard requirement; §5E + §6 are the seam.)
3. dev/payments' Supabase Auth is the only auth.
4. Keep **both** input methods (screenshot + booking code) and **both** verifiers
   (bet-worker entry-validation + football-API settlement). No feature dropped to dodge a conflict.

> **Two orthogonal "verifications" — do not conflate them.** The pipeline has TWO independent
> verifier subsystems writing TWO different columns:
> - **Verifier 1 — entry validation** (dev/payments, the bet-code worker): "does this booking
>   code resolve, and what legs does it contain?" → writes `betslips.verification_status`
>   (`pending|verified|failed|rejected`).
> - **Verifier 2 — result settlement** (main, `footballApi.ts`): "did the slip win or lose?"
>   → writes `betslips.result` (`pending|win|loss`).
>
> A merged code-entered slip ends up `verification_status='verified'` AND, later,
> `result='win'|'loss'`. Both columns survive the merge; neither replaces the other.

---

## The chain at a glance

```
(1) INPUT                 (2) NORMALIZE              (3) ENTRY VALIDATION        (4) RANKING + CHANNELS     (5) SETTLEMENT
─────────                 ─────────────              ────────────────────        ──────────────────────     ──────────────
screenshot ─► Claude      both paths land in the     bet worker confirms the     verification_status        football API decides
  Vision  ──┐  common match/leg model     code + pulls legs           ='verified' makes the      win/loss → betslips.result
            ├─►(normalized legs)          (slip_verifications +       slip PUBLIC; ranking/      via betslip_legs (the
booking ───┘                              betslip_secrets)            channels read the          COMMON model both paths
 code  ──► code parsing                                               tipster_stats view         feed)
           (scrape + Gemini)
```

The **integration spine** is one table: **`betslip_legs`** (`match` TEXT "Home vs Away",
`pick`, `match_time`, + new `fixture_id`). Screenshot/manual already write it; the merge
makes the booking-code path write it too. That single projection is what unifies settlement
(see §5E / §6).

---

## (1) INPUT — two paths kept

A tipster posts a slip via **`POST /api/tips`** (`src/app/api/tips/route.ts`). The route
picks the path by which field is present, in priority order **booking_code → screenshot →
manual** (`tips/route.ts:32`), and writes `betslips.posting_mode` accordingly. **All three
modes are kept** (`betslips.posting_mode` CHECK = `manual|screenshot|booking_code`; the
`booking_code` value is dev/payments-only and MUST be in the merged constraint).

### Path A — Screenshot → Claude Vision  *(owner: main; preserve)*
- Tipster uploads a slip image. `posting_mode='screenshot'`.
- Claude Vision reads the image into legs, which are inserted into **`betslip_legs`**
  (`match` = "Home vs Away", `pick`, `odds`, `match_time`).
- The image lives in `betslip_secrets.slip_image_url` (post-overhaul; moved off `betslips`,
  service-role only). `betslips.slip_image_url` is NULLed by migration 0005.
- Screenshot slips are **trusted** at post time: backfilled to `verification_status='verified'`
  (no code to scrape). They already populate `betslip_legs`, so they already settle today.

### Path B — Booking code → code parsing  *(owner: dev/payments; preserve)*
- Tipster supplies `betting_site` + `booking_code` (e.g. `Betika` / `KkxPBu`).
  `posting_mode='booking_code'`.
- Code + site are stored in **`betslip_secrets`** (`booking_code`, `betting_site`;
  service-role only). The slip starts `verification_status='pending'`.
- `POST /api/tips` fires Verifier 1 fire-and-forget:
  `verifyAndRecord(bs.id, betting_site, booking_code).catch(()=>{})` (`tips/route.ts:78`).
- **No client-side code format validation** — legitimacy is decided entirely by whether the
  worker can load the code on the real bookie (§3).

> **Merge note (DB):** main's `betslips` has `total_odds NOT NULL` and `leg_count NOT NULL
> default 1`. Booking-code slips have neither until scraped → **dev's nullable version of both
> columns MUST win** (`dev-schema.md` §0 risk 2). Likewise main's `betslips.booking_code` /
> `betting_site` columns are NULLed and moved to `betslip_secrets` by 0005 — any main code that
> still reads code/site off `betslips` must be re-pointed at `betslip_secrets`.

---

## (2) NORMALIZE — both inputs land in the common match/leg model

The whole point of the merge is that **both input paths converge on the same structured
leg shape** so one settlement engine grades them all.

| Input path | Where structured legs end up *today* | Shape |
|---|---|---|
| Screenshot / manual | **`betslip_legs`** rows (1 slip → N legs) | `{match:"Home vs Away", league, pick, odds, match_time, result}` |
| Booking code | **`slip_verifications.normalized`** (jsonb array) | `NormalizedLeg[]` from Gemini (§3) |

### The canonical `NormalizedLeg` (booking-code path, `verifyCode.ts:13`)
```
{ teams, homeTeam, awayTeam, market, marketLabel, pickSymbol, pickSide,
  pickTeam, line, odds, kickoff (ISO-8601 +03:00 EAT), kickoffRaw, summary }
```
Produced by the Gemini normaliser (`bet-code-worker/src/normalize.js`) with canonical market
codes `1X2|DC|OU|BTTS|DNB|AH|EH|CS|OTHER`, home-first team split, and ISO kickoff.

### The gap the merge MUST close
The two shapes live in **two different stores**. main's settlement engine
(`footballApi.ts`) reads **only `betslip_legs`** — it has never heard of
`slip_verifications.normalized`. So a code-entered slip's normalized legs, today, **never reach
settlement**.

**Target state:** the booking-code path must *project* its `NormalizedLeg[]` into
**`betslip_legs`** so `betslips` → `betslip_legs` becomes the single common model both inputs
share. The projection mapping is the integration seam — spelled out concretely in §6.

---

## (3) ENTRY VALIDATION — the bet worker confirms the code + pulls legs

*(Verifier 1; owner dev/payments; entirely additive — main never touched these paths.)*

### Topology
```
POST /api/tips (auto)  ─┐
admin re-check         ─┤─► verifyAndRecord(betslip_id, site, code)   (src/lib/verifyCode.ts:142)
POST /api/slips/verify-code (requireRole admin)   │  callWorker(): POST {BET_CODE_WORKER_URL}/verify
poller                 ─┘     │                    │     x-worker-key
POST|GET /api/slips/sync-codes (x-sync-token)      ▼
                           bet-code-worker :8080  (Express + Puppeteer + Debian chromium)
                             ├ scrapeCode → adapters.js → real bookie → matches[] + raw_text + found
                             └ normalize.js (Gemini, optional) → normalized[] + totalOdds + summary
                             ▼  JSON  (HTTP 200 even on scrape failure, ok:false)
                           recordVerification(): upsert slip_verifications + reflect PROOF onto betslips
```

### What the worker is / does
- A **standalone, stateless HTTP microservice** (`bet-code-worker/`, its own
  Dockerfile/package.json, Node 24 + `puppeteer-core` driving `/usr/bin/chromium`). Separate
  service because Vercel can't run headless Chrome. It writes **nothing** to Postgres; its only
  persistence is debug screenshots. **No queue, no Redis** (a Redis rearchitecture was built and
  reverted — do not reintroduce).
- `POST /verify` (`server.js:56`): auth header `x-worker-key` (= `WORKER_API_KEY`); body
  `{betting_site, booking_code}`. `getAdapter(site)` resolves bookie via an alias table; unknown
  site → 400. Scrape runs in a **fresh incognito `BrowserContext` per request** (bookies persist
  the betslip in localStorage). `found = matches.length > 0` is **the validity signal**.
- Optional Gemini normaliser runs only when `GEMINI_API_KEY` is set AND the code is valid;
  any failure is caught and leaves `/verify`'s base contract intact.
- Supported sites (two synced lists that MUST stay in lockstep: `src/lib/bettingSites.ts` ↔
  `bet-code-worker/src/adapters.js`): Betika, betPawa, 1xBet, 22Bet, SportPesa, MozzartBet
  (confirmed) + SportyBet, Betway (placeholders). Deliberately unsupported: Fortebet,
  Championbet.

### What entry validation writes (`recordVerification`, `verifyCode.ts:67`)
1. Upserts a **`slip_verifications`** row (`onConflict:'betslip_id'` → one current row/slip):
   `matches` (raw), `normalized` (Gemini legs), `summary`, `total_odds`, `raw_text`,
   `match_count`, `found`, `status` (`scraped|failed`), `error`, `screenshot_url`, `scraped_at`.
   **RLS: service-role only — normalized picks never reach the public feed.**
2. Reflects **PUBLIC PROOF** onto `betslips` (`verifyCode.ts:113`):
   - `found && matches.length` → `verification_status='verified'`, `verified_at`, `game_count`,
     `markets`, `leagues`, `earliest_kickoff`, `total_odds`. **Never un-verifies.**
   - `ok` but not found (bad/expired code) → `rpc('record_failed_verify', {p_betslip_id})`:
     bumps `verify_attempts`, flips a still-`pending` slip to `'failed'`.
   - worker errored/unreachable → change nothing; slip stays `pending` for the poller.

### The poller (`POST|GET /api/slips/sync-codes`)
Keeps still-pending coded slips fresh. Reads `betslip_secrets` ⋈ `betslips!inner` where
`booking_code` present AND `betslips.result='pending'` AND `verification_status IN
(pending,failed)` AND `verify_attempts < SYNC_MAX_FAILED_RETRIES`. Kill switch
`SYNC_CODES_ENABLED=false` in prod (scraper is blocked from datacenter IPs → sync runs from a
residential-IP stack against the same DB). Auth `x-sync-token`.

> **The poller's `result='pending'` filter is the natural handshake between the two verifiers:**
> once Verifier 2 (settlement, §5) writes `result='win'|'loss'`, the poller stops re-scraping the
> slip (`dev-betworker.md` §7; migration `20260625120000_skip_verified_sync`). This already
> works *after* §6 makes the slip settle.

---

## (4) RANKING + CHANNELS — what "verified" unlocks

*(Owner: main. Reads only; no writes to the lifecycle.)*

Once a slip is `verification_status='verified'`, it becomes publicly visible (RLS
`betslips_verified_public`: `verification_status='verified' OR result IN (win,loss)`), and it
flows into ranking + channels.

- **Channels** — `src/app/channels/page.tsx` (list) + `src/app/channel/[slug]/page.tsx`
  (detail). The detail feed comes from `GET /api/tipster/[slug]/slips`, which queries
  `betslips, betslip_legs(*)` and **filters out seeded historical slips**
  (`s.note !== '__seed__'`, NULL-safe in JS — commit `e469cea`). The `betslips.note` column and
  this filter MUST survive the merge.
- **Ranking** — `/rankings` (`src/app/rankings/page.tsx`) reads the **`tipster_stats`** view via
  `GET /api/tipster`. Score is recomputed client-side as
  `winRate × avg_odds` where `winRate = wins_last_10 / (wins_last_10 + losses)` (settled denom;
  commits `40ba53c`, `bdbcc43`). All of this derives from `betslips.result='win'`.

> **MERGE RISK — `tipster_stats` is undefined in tracked SQL on BOTH branches.** Every channel +
> ranking route queries a view named **`tipster_stats`**, but the only view in either branch's
> migrations is **`tipster_rankings`** (`20260610000001_init.sql:149`). `tipster_stats` is a live-DB
> superset exposing `losses, slips_posted, roi, last5, slug, subscriber_count, sport, created_at`.
> **The merge MUST capture the live `tipster_stats` DDL into a migration (or rename/extend
> `tipster_rankings`→`tipster_stats`)**, or every channels/ranking page degrades to blanks.
> (`main-ranking.md` §2, `main-channels.md` risk 1, `main-schema.md` §6/§8.)

This stage is **why settlement must be unified**: ranking/score is fed entirely by
`betslips.result='win'`. If code-entered slips can't reach settlement (§6), they never produce
wins, and a tipster who posts by booking code is invisible on the leaderboard despite being
"verified". Unifying settlement is what makes the booking-code path a first-class citizen here.

---

## (5) SETTLEMENT — the football API decides win/loss  *(THE UNIFIED SEAM)*

*(Verifier 2; owner: main. This is the hard-requirement integration point.)*

### 5A. The engine (`src/lib/footballApi.ts`)
- Provider **API-Football** (`v3.football.api-sports.io`), env key **`FOOTBALL_API_KEY`**
  (header `x-apisports-key`). Free tier: ~3-day date window (-1..+2 days), 100 req/day.
- `verifyLeg(leg)` resolves a fixture **two ways**:
  1. **By `leg.fixture_id`** (preferred, most reliable) → `getFixtureById()`. **Currently DEAD:
     no `fixture_id` column exists on `betslip_legs` in either branch**, so it never runs.
  2. **By teams + date** (the path that runs): split `leg.match` on `/\s+vs\.?\s+/i` into
     `[home, away]`; date from `leg.match_time.split('T')[0]`; 2h "match finished" guard;
     fuzzy `teamsMatch()` (substring or first-5-char prefix over normalized names).
- `determineResult(pick, fixture)` grades the markets (O/U, BTTS, 1X2, DC, clean sheet, HT,
  handicap, exact score, win-by-margin, etc.) → `win|loss|pending|unverifiable`.
- `calcSlipResult`: any `loss`→loss; any `pending`→pending; any `unverifiable`→unverifiable;
  all `win`→win.

### 5B. The orchestrator (`POST /api/verify`, `src/app/api/verify/route.ts`)
- Vercel cron `0 2 * * *` (`main:vercel.json`). Selects pending slips joined with
  `betslip_legs(*)`, settles, then writes `betslip_legs.result` and `betslips.result`
  (`unverifiable` → keep `pending` + `result_proof_pending=true` for admin review).
- Writing `betslips.result` fires `tipster_tick_trigger` → recomputes the verified tick and feeds
  `tipster_stats` (§4).

### 5C. ⚠️ MERGE CONFLICT — both branches edited `verify/route.ts` AND `footballApi.ts`
This is **NOT a clean additive add.** Both files exist on `stag` AND on `main`, and they
**diverge** (`git diff main -- src/app/api/verify/route.ts src/lib/footballApi.ts`):

| | `main` (richer / ahead) | `stag` == dev/payments (regressed fork) |
|---|---|---|
| `verify/route.ts` posting-mode filter | `.in('posting_mode', ['manual','screenshot','booking_code'])` | `.eq('posting_mode', 'manual')` ← **drops screenshot + booking_code** |
| empty-leg guard | `if (!legs.length) continue` (skips leg-less code slips) | **absent** |
| `footballApi.ts` team matching | full `normalize()` + `teamsMatch()` fuzzy resolution | stripped down |

**Required resolution (do NOT take stag's copy):** the merge MUST take **main's**
`verify/route.ts` and `footballApi.ts` as the base for these two files — they are the only
versions that settle all three posting modes and skip empty-leg slips. Stag's `.eq('posting_mode',
'manual')` fork would silently exclude every screenshot AND booking-code slip from settlement,
violating decision 2 and 4. Re-apply any genuinely-additive stag changes (e.g. the
`x-rapidapi-key` header fallback in stag's `footballApi.ts`) on top of main's version, but
**main's posting-mode filter and empty-leg guard win.**

### 5D. ⚠️ Reconcile the `'void'` check-constraint bug (pre-existing on both)
`POST /api/admin/settle` writes `result='void'`, but `betslips.result` and `betslip_legs.result`
CHECK constraints allow only `pending|win|loss` on BOTH branches. Writing `'void'` violates the
constraint. The merge should **add `'void'` to both CHECK constraints** via an additive migration
(`main-settlement.md` §8/§12).

### 5E. THE UNIFIED-SETTLEMENT SEAM (hard requirement)
Settlement is **leg-driven**, not entry-path-driven. main's verifier already *queries* all three
posting modes — the actual gate is: **does the slip have `betslip_legs` rows shaped as
`{match:"Home vs Away", pick, match_time}`?**

- Screenshot/manual: yes (they write `betslip_legs` directly) → they settle.
- Booking code: **NO today** — the worker writes normalized legs into
  `slip_verifications.normalized`, never into `betslip_legs`. So a code-entered slip is leg-less
  from the settler's view and main's verify route skips it (empty-leg guard).

**The seam is exactly this projection.** To satisfy decision 2, the merged booking-code path must
write its normalized legs into the common `betslip_legs` table. See §6 for the concrete wiring.

---

## (6) THE INTEGRATION SEAM, CONCRETELY — how a code-entered slip reaches settlement

This is the load-bearing part of the merge. Four concrete changes connect dev's normalized legs
to main's `footballApi.ts`.

### 6A. Project `NormalizedLeg[]` → `betslip_legs` inside `recordVerification`
**Where:** `src/lib/verifyCode.ts`, in `recordVerification()` (`verifyCode.ts:67-139`), in the
`found && matches.length` branch where it already reflects PROOF onto `betslips`.

**What:** after upserting `slip_verifications` and setting `verification_status='verified'`, also
**write the legs into `betslip_legs`** (replace-then-insert keyed on `betslip_id`, so a re-scrape
refreshes them). Mapping from `NormalizedLeg` (preferred) → `betslip_legs` row:

| `betslip_legs` column | source on `NormalizedLeg` | notes |
|---|---|---|
| `match` (TEXT, not null) | `` `${homeTeam} vs ${awayTeam}` `` (fall back to `teams`) | **home-first, "X vs Y"** — main's `verifyLeg` splits on `/\s+vs\.?\s+/i`; the worker already guarantees home-first |
| `pick` (TEXT, not null) | `marketLabel` / `pickSymbol` (+ `line`) | must read back to main's `determineResult` market parser (1X2, "Over 2.5", "BTTS", etc.) — the Gemini canonical codes already align with main's market coverage |
| `odds` (numeric) | `odds` | per-leg odds |
| `match_time` (timestamptz) | `kickoff` (ISO-8601 +03:00 EAT) | drives main's 2h finish guard + free-tier date window |
| `league` (TEXT) | raw `matches[].league` | normaliser drops league; pull from raw `matches` |
| `result` | default `'pending'` | settled later by `/api/verify` |
| `fixture_id` (**new col**, see 6C) | leave null for now | enables the reliable fixture path once populated |

Only project when `found && normalized.length` (or fall back to raw `matches` when Gemini is
disabled). Do this in the **same** service-role write that sets `verification_status='verified'`
so the two stay consistent.

### 6B. Decouple settlement from entry path (use main's verify route)
Take **main's** `verify/route.ts` (§5C): it already selects
`posting_mode in (manual,screenshot,booking_code)` and skips empty-leg slips. With 6A in place, a
code-entered slip now *has* `betslip_legs`, so the existing empty-leg guard naturally lets it
through. **No special-casing of `posting_mode` in the settler** — entry path is fully decoupled;
the only thing that matters downstream of §2 is "are there well-formed legs?". This is the
entry-path decoupling the owner decision requires.

### 6C. Add `fixture_id` to `betslip_legs` (additive migration; high value)
main's `footballApi.ts:106-114` already has a **preferred `getFixtureById()` path gated on
`leg.fixture_id`**, but **no `fixture_id` column exists on `betslip_legs` in either branch** —
it's dead code. Add it as an **additive, nullable** column:

```sql
-- new migration, e.g. supabase/migrations/2026XXXXXXXXXX_betslip_legs_fixture_id.sql
ALTER TABLE betslip_legs ADD COLUMN IF NOT EXISTS fixture_id bigint;  -- nullable; non-destructive
```
This activates main's reliable id-based settlement path and removes dependence on fuzzy
5-char-prefix team matching. Optional but recommended; harmless if left null (settler falls back
to teams+date).

### 6D. Keep both verifier columns; let the poller hand off
- `verification_status` (Verifier 1) and `result` (Verifier 2) are **orthogonal columns — keep
  both**. A merged code slip is `verification_status='verified'` then later `result='win'|'loss'`.
- The handoff is automatic: the sync poller's filter (`result='pending'`, §3) stops re-scraping a
  slip the moment §6A→6B let main's settler write `result='win'|'loss'`. No extra wiring needed.

### 6E. Seam summary (the connect points, by file/route/column)
| Connect point | File / route | Change |
|---|---|---|
| Project normalized legs → common model | `src/lib/verifyCode.ts` `recordVerification()` | **insert/replace `betslip_legs`** from `NormalizedLeg[]` (6A) |
| Settle all entry paths | `src/app/api/verify/route.ts` | take **main's** version (all 3 modes + empty-leg skip), NOT stag's `manual`-only fork (5C/6B) |
| Grade legs | `src/lib/footballApi.ts` | take **main's** version (full fuzzy match); re-apply stag's `x-rapidapi-key` additively (5C) |
| Reliable fixture resolution | new migration | add nullable `betslip_legs.fixture_id` (6C) |
| Allow void settlement | new migration | add `'void'` to `betslips.result` + `betslip_legs.result` CHECKs (5D) |
| Posting-mode value | merged schema | `betslips.posting_mode` CHECK MUST include `'booking_code'` (dev superset) |
| Nullable slip columns | merged schema | `betslips.total_odds` / `leg_count` MUST be nullable (dev wins) |

---

## Merge checklist for this lifecycle (do-not-lose)

- [ ] **Both input paths kept** — screenshot (Claude Vision → `betslip_legs`) and booking code
      (worker → `slip_verifications.normalized`); `posting_mode` CHECK includes all three values.
- [ ] **Whole `bet-code-worker/` service + `src/lib/verifyCode.ts` +
      `/api/slips/{verify-code,sync-codes}` + `sync` compose service** merged verbatim (additive;
      main never touched these paths).
- [ ] **`recordVerification` projects normalized legs into `betslip_legs`** (6A) — the change that
      actually unifies settlement.
- [ ] **`verify/route.ts` + `footballApi.ts`: take main's versions** (5C/6B); re-apply stag's
      additive `x-rapidapi-key` header on top. Do NOT keep stag's `manual`-only filter.
- [ ] **Additive migrations:** nullable `betslip_legs.fixture_id`; `'void'` added to `result`
      CHECKs; capture live `tipster_stats` view DDL.
- [ ] **Keep `betslips.note='__seed__'`** column + the JS seed-hide filter (channels).
- [ ] **Keep both verifier columns** `verification_status` and `result` (orthogonal).
- [ ] **DB additive/non-destructive:** dev's nullable `total_odds`/`leg_count` win; secrets stay in
      `betslip_secrets`; main's permissive `rls.sql` must NOT win (re-leaks pending codes);
      backfill main's real users into Supabase Auth.

## Open risks carried into this flow (pre-existing; flag, don't silently fix)
- **`tipster_stats` view undefined in tracked SQL** on both branches — capture from live DB or
  ranking/channels degrade (§4).
- **`fixture_id` path is dead** until 6C lands; settlement relies on fuzzy 5-char-prefix team
  matching, which can mis-grade.
- **Free-tier date window (-1..+2 days)** → slips older than ~2 days past kickoff become
  `unverifiable` → routed to admin via `result_proof_pending`.
- **Unauthed settlement endpoints** (`/api/verify` POST, `/api/verify-debug`, `/api/fixturetest`,
  `/api/apitest`) — cron-only by convention; consider gating in prod.
- **P0 tipster-login (legacy `profile_id` NULL)** affects the reveal/owning-tipster path that sits
  alongside this lifecycle (`tipsters.profile_id = auth.uid()` join) — out of scope here but
  touches `betslip_secrets`/reveal authorization.
</content>
</invoke>
