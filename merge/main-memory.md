# `main` branch — How It Works (DATA baseline + colleague's side)

> Audience: senior engineers merging `main` into `stag` (`stag == dev/payments`).
> `main` is the **colleague's branch** AND the **production DATA baseline** — its live Supabase
> DB holds real tipsters, slips, purchases, payments, earnings. The merge is **additive and
> non-destructive**: no `main` feature is dropped, no `main` data is lost.
>
> All `main` paths below are read via `git show main:PATH`. The working tree is `stag` and does
> **not** contain `main`-only files (`src/lib/footballApi.ts`, `src/app/api/parse-slip`,
> `src/app/api/verify*`, `src/lib/adminAuth.ts`, `src/lib/schema.sql`, etc.).

---

## 0. Single most important merge fact

`main` has **NO `supabase/migrations/` folder.** Its schema is applied by manually pasting
`src/lib/schema.sql` + `src/lib/rls.sql` into the Supabase SQL Editor. Worse, **`schema.sql`
DRIFTS from the live production DB** — several columns, a widened CHECK, and an **entire view
(`tipster_stats`) the app actually depends on** exist only in the live DB, never written back to
the file. **The real DATA baseline is the live DB, not `schema.sql`.** See the Drift Ledger (§8).
Production project ref (hardcoded in `src/lib/supabase.ts` `supabaseServer()`):
`sooutpsbdgqelnnnfezp`.

---

## 1. Modules & data flow

`main` is a single Next.js (App Router) app — no separate worker/sync services. Flow:

```
Tipster dashboard (/tipster/dashboard)
   ├── Manual entry ──────────────┐
   ├── Screenshot upload ─► /api/parse-slip (Claude Vision) ─► editable legs ─┐
   └── Booking-code entry ────────┤                                          │
                                  ▼                                          ▼
                           POST /api/tips  ──►  betslips (+ betslip_legs)  [result='pending']
                                                       │
        ┌──────────────────────────────────────────────┤
        ▼                                                ▼
  Public read paths                          Settlement (Verifier 2)
  /channels, /channel/[slug],               Vercel cron 0 2 * * * ─► POST /api/verify
  /rankings  ─►  view tipster_stats              ─► src/lib/footballApi.ts (API-Football)
                     ▲                            ─► writes betslips.result = win/loss
                     │                                   │
              trigger tipster_tick_trigger ◄────── AFTER UPDATE OF result ON betslips
              (auto earns/revokes verified tick)        │
                                                        ▼
                                            Admin Review tab settles leftovers
                                            (POST /api/admin/settle  win/loss/void)
```

Key data principle on `main`: **a slip's `result` is the hub.** Writing `betslips.result`
(by the football-API verifier OR by admin settle) fires the tick trigger and feeds the ranking
view. Everything ranking/channels shows derives from `result='win'` over recent slips.

---

## 2. Key files

| File | Role |
|---|---|
| `src/app/api/parse-slip/route.ts` | **Screenshot pipeline** — Claude Vision OCR of a betslip image → JSON legs. |
| `src/app/api/tips/route.ts` | Insert path: writes `betslips` + `betslip_legs` for all 3 input modes. |
| `src/app/tipster/dashboard/page.tsx` | Tipster UI: manual / screenshot / booking-code entry; calls parse-slip then `/api/tips`. |
| `src/lib/footballApi.ts` | **Verifier 2** — API-Football fixture resolution + market grading (`main`-only). |
| `src/app/api/verify/route.ts` | Settlement orchestrator (cron entry point); writes `betslips.result`. |
| `src/app/api/verify-debug`, `apitest`, `fixturetest` | Unauthed diagnostics for the football API. |
| `src/app/rankings/page.tsx` | `/rankings` leaderboard — fetches, re-sorts, scores, renders. |
| `src/app/channels/page.tsx`, `src/app/channel/[slug]/page.tsx` | Channels list + detail. |
| `src/app/api/tipster/route.ts` + `[slug]/{route,slips,stats,earnings}` | Public tipster/channel API; all `force-dynamic`, no-store. |
| `src/lib/db.ts` | Query helpers (`getAllTipsters`, `getTipsterByIdentifier`, …). Partly **legacy/dead** (see §9). |
| `src/app/admin/page.tsx` + `src/app/api/admin/*` | Admin console incl. the load-bearing **Review (settle)** tab. |
| `src/lib/adminAuth.ts`, `src/app/api/admin/login` | `main` admin auth (shared password) — **to be replaced** by dev's Supabase Auth. |
| `src/lib/auth.ts` | Tipster auth helpers (sha256 salted) — **identical on both branches**. |
| `src/lib/schema.sql`, `src/lib/rls.sql` | DB DDL baseline (drifts from live — §8). |
| `src/lib/supabase.ts`, `src/lib/imageUpload.ts`, `src/lib/rateLimit.ts` | Supabase client (hardcoded prod URL), Storage upload, in-memory rate limiting. |
| `vercel.json` | Cron config: `/api/verify` at `0 2 * * *`. |

---

## 3. Ranking logic (`/rankings`)

Score is computed **three times, slightly differently** — flag, but **preserve all three** (these
are the recent-commit behaviors: `40ba53c` wins-out-of-settled, `bdbcc43` rank by win-rate×odds).

**3a. Rankings page (authoritative for what users see)** — `rankings/page.tsx:91-95`:
```
settled = (wins_last_10 ?? 0) + (losses ?? 0)
winRate = settled > 0 ? wins_last_10 / settled : 0
score   = winRate * (avg_odds || 1)      // win-rate × odds; settled-only denominator
```
The page does **not** trust the view's `score`; it re-sorts client-side
(`.sort((a,b) => scoreOf(b)-scoreOf(a))`, `page.tsx:97`), rank = array index + 1.

**3b. Per-tipster rank** — `api/tipster/[slug]/stats/route.ts:23-26`:
```
score = (wins_last_10 ?? 0) * (avg_odds || 1)   // RAW wins × odds — NOT win-rate
```
**DISCREPANCY (pre-existing, preserve):** the page orders by *win-rate × odds*; the profile's
displayed "rank" uses *raw wins × odds*. They can disagree.

**3c. SQL view `score`** — same as 3b (`wins_last_10 * avg_odds`) where, in SQL:
`wins_last_10` = count of `result='win'` among the **last 10** slips by `posted_at desc`;
`avg_odds` = `round(avg(total_odds),1)` over `result='win'` slips in the **last 7 days**
(coalesced to `1.0`); `subscriber_count` = active `slip_purchases`.

**Table columns** (`# | Tipster | Slips | W | L | Win% | Odds | ROI | Streak | Last 5 | [Score]`).
`Score` only with the **Show Score / Hide Score** toggle (`showExtra`). **Responsive hide:**
CSS `@media (max-width:640px){.rk-optional{display:none}}` hides **L** and **Streak** on mobile
(`a497c19`). Visual helpers in `page.tsx`: `zoneColor` (rank≤2 purple, top-30% blue, bottom red),
`winPctColor`, `ResultDots`, `streakLabel`. `last5` is a CSV string (e.g. `"W,W,L,P,W"`) emitted
by the live `tipster_stats` view.

**Copy/logic mismatches to surface (not fix during merge):** header says "Score = win rate ×
avg winning odds · rolling 4 weeks", but the SQL `avg_odds` window is **7 days**. Seeded
(`__seed__`) slips are **still counted** in the view's win/odds stats (only hidden from public
slip lists). `types/index.ts` `TipsterPublic` is **narrower** than what the page actually reads —
the page's local `TipsterRow` is the real contract.

> **Ranking depends on the undocumented `tipster_stats` view** (§6). If it isn't recreated in the
> merged DB with the full column set, the page silently degrades (all `?? 0` fallbacks fire).

---

## 4. Screenshot / Claude-Vision pipeline

> No `main-screenshot.md` analysis note exists; this section is derived directly from the `main`
> source (`api/parse-slip/route.ts`, `tipster/dashboard/page.tsx`, `lib/imageUpload.ts`,
> `lib/rateLimit.ts`, `components/ui/ImageUpload.tsx`).

**Entry point:** `POST /api/parse-slip` (`src/app/api/parse-slip/route.ts`).
- **Model:** Anthropic **Claude Vision**, model id **`claude-haiku-4-5-20251001`**, `max_tokens: 1500`,
  via `@anthropic-ai/sdk`. Secret name: **`ANTHROPIC_API_KEY`** (env var name only).
- **Input:** `multipart/form-data` field `image` (a `File`); read to base64; `media_type` from
  `file.type` (jpeg/png/webp/gif default jpeg).
- **Rate limit:** `rateLimit('parse-slip', ip)` — **5 parses/min per IP** (`rateLimit.ts:12`,
  in-memory map; resets on deploy). 429 via `rateLimitResponse`.
- **Prompt:** injects today's date; instructs the model to return **ONLY** a JSON object:
  `{ betting_site, total_odds, stake, potential_win, legs:[{ match:"Home vs Away", league, pick,
  odds, match_time:"YYYY-MM-DDTHH:MM:00Z|null", market }] }`. Notable rules baked in:
  - `match` MUST be exact `"Home Team vs Away Team"` (the format Verifier 2's leg parser depends on).
  - `match_time` always a full date (combine bare times with today's date), null only if truly absent.
  - `pick` normalized to standard short forms ("Over 2.5", "BTTS", "Home Win", …).
  - `market` constrained to an enum (`match_result|over_under|btts|double_chance|handicap|
    ht_result|clean_sheet|exact_score|score_first|win_margin|total_cards|player_score|player_first|
    corners|asian_handicap|other`).
- **Output handling:** strips ```` ```json ```` fences, `JSON.parse`. Success → `{ success:true, slip }`.
  Unparseable → **422** `{ error:'Could not parse betslip — try a clearer screenshot', raw }`.
- **Persistence:** parse-slip does NOT write to the DB. The **dashboard** receives the parsed slip,
  lets the tipster edit legs, then submits via `POST /api/tips` with `posting_mode:'screenshot'`
  and an optional `slip_image_url`.

**Image upload (`src/lib/imageUpload.ts`):** `uploadSlipImage(file, tipsterId, 'slip'|'result')`
→ Supabase Storage bucket **`betfluencer-slips`**, path `slips/<tipsterId>/<type>_<ts>.<ext>`,
returns public URL. Demo fallback stores base64 in `localStorage`. `ImageUpload` component accepts
`image/jpeg,png,webp,heic,heif`.

**Merge note:** the parse-slip → `betslip_legs.match="Home vs Away"` contract is **exactly** what
Verifier 2 needs to grade legs (§5). The booking-code worker (dev/payments) must produce the same
leg shape so code-entered slips settle through the same path.

---

## 5. Channels logic (`/channels`, `/channel/[slug]`)

**List (`channels/page.tsx`):** fetches `GET /api/tipster` → `data.tipsters`; header
"TRENDING THIS WEEK"; client-side `SearchBar` filter; renders `TipsterCard` with
`rank = arrayIndex+1`. **Ordering quirk:** `/api/tipster` orders the view by **`created_at desc`**
(insertion order), NOT score — while `db.ts:getAllTipsters` orders by `score desc`. The channels
page uses the **route**, so the list is in insertion order. Keep both behaviors unless intentionally
unifying.

**Detail (`channel/[slug]/page.tsx`):** two parallel fetches — `GET /api/tipster/[slug]` (returns
`{tipster, tips}`) for the profile, and `GET /api/tipster/[slug]/slips` (returns `{slips}`) for the
feed. Header: `Avatar`, name, `VerifiedTick tick_type`, `@username · sport`,
`WinRateBadge wins=wins_last_10 total=settled` (settled = wins+losses), `subscriber_count` as
"N fans", `FollowButton`. Static gold banner: "Pay per slip — buy only the tips you want. Finished
slips are free to view." Tabs: **Betslips** (`BetslipFeed`) + **About** (win rate
`round(wins/settled*100)%`, avg odds, fans).

**Seed-hide filter (`e469cea`)** — `api/tipster/[slug]/slips/route.ts`: query `betslips, betslip_legs(*)`
`order posted_at desc limit 200`, then JS `.filter(s => s.note !== '__seed__')`, `.slice(0,50)`.
The sentinel is the `betslips.note` column (text, default `''`); seeded rows carry `note='__seed__'`.
**Preserve `note` + the filter** — do not let a dev migration drop/rename `note`.

**Stats route extras (`[slug]/stats/route.ts`):** `subscriber_count` overridden as distinct buyers
(`new Set(slip_purchases.user_phone).size`); `slips_posted` = count of `betslips`; `total_earned` =
sum of `earnings.amount`.

> All channel/tipster API routes are `export const dynamic='force-dynamic'; revalidate=0;
> fetchCache='force-no-store'` — the deliberate no-store cache fix. Preserve headers + segment config.

---

## 6. Football-API settlement (Verifier 2)

Decides **WON or LOST** from real match results. Distinct from dev/payments' **Verifier 1**
(`verification_status` = booking-code validity). They are **orthogonal — keep BOTH**.

- **Provider:** API-Football (`https://v3.football.api-sports.io`), key header `x-apisports-key`,
  secret name **`FOOTBALL_API_KEY`** (`footballApi.ts:8-13`). Free-tier: ~3-day window
  (yesterday→+2d), no `date`+`search` combo, 100 req/day.
- **Leg→fixture matching (`verifyLeg`):**
  1. **By `fixture_id` (PREFERRED but DEAD):** `getFixtureById` — but **no `fixture_id` column
     exists** on `betslip_legs` in either branch's schema, so this path **never runs**. Latent code.
     Adding `fixture_id` is a high-value, additive merge enhancement.
  2. **By teams + date (the live path):** split `leg.match` on `/\s+vs\.?\s+/i` → `[home,away]`;
     date from `match_time`; `findFixture` queries `/fixtures?date=` across the -1..+2d window;
     `teamsMatch()` uses `normalize()` (strips `fc|sc|afc|cf|women|u\d+|reserves|ii`…) + substring
     or **first-5-char prefix** (fuzzy, can mis-match). Pending guard: match within last 2h → `pending`.
- **Market grading (`determineResult`):** Over/Under, BTTS, 1X2, double chance, clean sheet, HT
  result, Asian/European handicap, exact score, exactly-N goals, win-by-N, score-first, total cards.
  HT/FT and anytime-scorer → `unverifiable`. Events-based markets (first goal, cards) need
  `fixture.events` in the payload → usually `unverifiable`.
- **Aggregation (`calcSlipResult`):** any `loss`→loss; any `pending`→pending; any
  `unverifiable`→unverifiable; all `win`→win; else pending.
- **Orchestrator `POST /api/verify`** (cron `0 2 * * *`, `vercel.json`; **no auth** on POST):
  selects `betslips` where `posting_mode in ('manual','screenshot','booking_code')` AND
  `result='pending'` with `betslip_legs(*)`; **skips empty-leg slips**; time-gates on max leg
  `match_time` (>3h past); writes finished `betslip_legs.result`; sets `betslips.result` unless
  `unverifiable` → keeps `pending` and sets `result_proof_pending=true` (admin queue).

**Entry-path coupling (the critical seam):** settlement is **leg-driven, not entry-path-driven** —
`/api/verify` already includes `'booking_code'`. A code-entered slip settles **iff** the bet-code
worker writes `betslip_legs` with `match="Home vs Away"`, a sensible `pick`, and `match_time`. That
is the unified-settlement requirement: the worker's leg output must conform to this shape.

**Latent bugs to fix in the merge (not in scope to "fix on main"):**
- `admin/settle` writes `'void'`, but the CHECK constraint on `betslips`/`betslip_legs.result`
  only allows `pending|win|loss` on BOTH branches → `'void'` **violates the constraint**. The merge
  must widen the CHECK to include `'void'`.
- `main`'s verify route filters `'booking_code'` but `main`'s `schema.sql` `posting_mode` CHECK only
  allows `manual|screenshot` (live DB widened it). Merged schema must be the dev superset.

---

## 7. Admin review

`main` admin page (`src/app/admin/page.tsx`) has tabs **Overview / Tipsters / Revenue / Review**
(+ a dead 'ads' body). Auth on `main` is **shared-password, client-gated** — **to be replaced** by
dev's Supabase Auth.

- **`main` auth (DROP):** `src/lib/adminAuth.ts` — `ADMIN_PASSWORD` (hardcoded fallback in repo),
  `base64("admin:…")` token, `isValidAdminToken` only checks `startsWith('admin:')` (any such base64
  passes), header `x-admin-token`. `api/admin/login` issues the token; the page gates purely on
  `localStorage['bf_admin_session']`. **Replace with `requireRole('admin')` (dev's Supabase session
  + `/api/admin/me` probe + `POST /api/auth/logout`).**

- **`ReviewTab` — THE LOAD-BEARING FEATURE AT RISK (must PORT, not lose):** this is slip
  **settlement** (win/loss/void), which drives ranking. Flow: `GET /api/admin/pending-slips`
  (lists slips with `result` pending/null + legs + tipster name) → three buttons per slip →
  `POST /api/admin/settle { slip_id, result, admin_key }` (valid `win|loss|void|pending`; updates
  `betslips.result` + clears `result_proof_pending`; cascades to `betslip_legs.result`). Plus a
  "Run auto-verification" button → `POST /api/verify`. **dev/payments has NO settlement UI/route**
  (`pending-slips` and `settle` are DELETED on dev) — port both, re-guarded with `requireRole('admin')`
  and real input validation (settle is currently effectively unauthenticated — gated only by optional
  `ADMIN_SETTLE_KEY`; open if unset).

- **Other `main` admin routes:** `review` (manual grading of `result='unverifiable'` legs — KEPT on
  dev, guard swapped), `settings` (in-memory `publicSignupsEnabled` toggle — latent bug, persist in
  DB), `stats`, `tipsters` (CRUD; create returns plaintext password once), `revenue` (earnings
  rollup), `ads` (stub). dev adds **complementary** routes — `me`, `slips` (hide toggle),
  `verify-slip` (`verification_status` override), `transactions`. **Merge takeaway:** `main`'s
  Review/settle and dev's Slips/verify-slip are COMPLEMENTARY — the merged admin needs **BOTH**
  settlement (win/loss/void) and moderation (hide + verification_status), all behind
  `requireRole('admin')`.

---

## 8. `main` DB schema (the DATA baseline)

**DDL files:** `src/lib/schema.sql` (182 lines) + `src/lib/rls.sql` (88 lines). **No migrations
folder.** All "enums" are `text` + CHECK constraints (no native `CREATE TYPE`). Extensions:
`uuid-ossp`, `pgcrypto`.

### 8a. Table list (committed `schema.sql`)

| Table | Purpose | Key columns / notes |
|---|---|---|
| `tipsters` | Tipster accounts | `id`, `name`, `username` (uniq), `phone` (uniq), `password_hash`, `description`, `sport`, `verified`, `tick_type` CHECK(`earned`,`paid`,null), `created_at` |
| `betslips` | The SLIP entity | `id`, `tipster_id` FK→tipsters CASCADE, `posting_mode` CHECK(`manual`,`screenshot`)*, `total_odds numeric(8,2)`, `leg_count`, `result` CHECK(`pending`,`win`,`loss`)*, `slip_price` (UGX, def 1000), `note` (def `''`, **`'__seed__'` sentinel**), `slip_image_url`, `result_image_url`, `result_proof_pending`, `posted_at` |
| `betslip_legs` | The LEG/MATCH entity | `id`, `betslip_id` FK→betslips CASCADE, `match` (free-text "Home vs Away"), `league`, `pick`, `odds numeric(5,2)`, `match_time` (nullable), `result` CHECK(`pending`,`win`,`loss`) |
| `slip_purchases` | Per-slip purchase (no subscriptions) | `id`, `betslip_id` FK, `tipster_id` FK, `user_phone` (guest buyer, no auth row), `user_name`, `amount_paid` (UGX), `status` CHECK(`active`,`refunded`), `purchased_at` |
| `payments` | Payment records | `id`, `purchase_id` FK→slip_purchases, `user_phone`, `tipster_id` FK, `gross_amount`, `commission_amount`, `tipster_amount`, `status` CHECK(`pending`,`confirmed`,`failed`,`refunded`), `flw_ref` (**Flutterwave** — dev is ioTec), `payout_attempts`, `created_at` |
| `earnings` | Net-to-tipster ledger | `id`, `tipster_id` FK CASCADE, `betslip_id` FK, `amount` (net), `gross`, `commission`, `plan` (def `'slip'`), `user_phone`, `created_at` |

\* *live DB has widened these — see Drift Ledger below.*

**No `matches`/`fixtures` table.** A "match" is the free-text `betslip_legs.match` string + `league`
text. `betslip_legs.market` and `betslips`/`legs` `'void'` exist only in TS, not the DDL. This
free-text leg model is the **principal harmonization point** vs dev/payments' structured worker —
harmonize **additively** (add columns/tables; never drop `betslip_legs.match`/`league`).

### 8b. Indexes
`idx_betslips_tipster (tipster_id, posted_at desc)`, `idx_legs_betslip (betslip_id)`,
`idx_purchases_phone (user_phone)`, `idx_purchases_tipster (tipster_id)`,
`idx_earnings_tipster (tipster_id, created_at desc)`.

### 8c. Functions / triggers
- `update_tipster_tick()` (`schema.sql:101-134`): on slip settlement, counts `win` in last 10 slips
  + 7-day avg odds. **Award** if `wins>=7 AND avg_o>=2.0 AND tick_type IS NULL` →
  `verified=true, tick_type='earned'`. **Revoke** if `wins<=4 AND tick_type='earned'`. Never touches
  `'paid'` ticks.
- Trigger `tipster_tick_trigger` — `AFTER UPDATE OF result ON betslips`. **Any** `result` write
  (verifier, admin settle, bulk/seed) fires it. dev's settlement must keep writing `betslips.result`.

### 8d. Views
- `tipster_rankings` (`schema.sql:141-174`, committed) — per-tipster aggregate; `score = wins_last_10
  * avg_odds`. **Likely superseded** in the live DB; only referenced by a legacy `db.ts` path.
- **`tipster_stats` — the view the app ACTUALLY uses (7 call-sites), but UNDEFINED in any committed
  SQL.** Exists only in the live DB. Reconstructed column contract: `id, name, username, sport,
  wins_last_10, losses, slips_posted, avg_odds, roi, last5, subscriber_count, tick_type, verified,
  slug, score, created_at`. **The single most fragile undocumented dependency** — must be dumped from
  the live DB and captured in the baseline migration, or rankings/channels break (500 / blank columns).

### 8e. RLS (`rls.sql`)
Enabled on all 6 tables, but **effectively `using(true)`/`with check(true)`** — authorization is in
the API layer (service-role key). Only non-trivial predicate: `betslips` SELECT — finished slips
(`result in ('win','loss')`) public, pending gated. Non-destructive to keep; reconcile once dev's
Supabase Auth becomes authoritative.

### 8f. DRIFT LEDGER — live DB has, `schema.sql` lacks (capture in baseline `0000`)
1. **`tipster_stats` view** — entire view missing from repo (§8d).
2. **`betslips.booking_code`** column — inserted at `api/tips/route.ts:29`.
3. **`betslips.betting_site`** column — inserted at `api/tips/route.ts:30`.
4. **`betslips.posting_mode` CHECK widened** to include `'booking_code'`.
5. Possible **`result` CHECK widened** to allow `'void'` (TS includes it; confirm against live DB — and
   note `admin/settle` needs it).
6. `tipster_rankings` (committed) is unused by the app — keep (non-destructive), verify before dropping.

---

## 9. Stale / dead references in `main` (do NOT recreate)

`src/lib/db.ts` is partly legacy: `.from('tips')`, `.from('subscriptions')` reference tables that
**do not exist** in `main`'s model (superseded by `betslips`/`betslip_legs` and `slip_purchases`).
Only `.from('tipster_stats')` is live. `src/types/ads.ts` defines `Ad`/`AdBooking` but there is **no
ads table** (mock-only). `src/types/index.ts` `Tip`/`Subscription`/`Payment` and `TipsterPublic` are
stale and disagree with live tables. The football-API settlement is in `footballApi.ts`, **not** in
`db.ts`.

---

## 10. Merge do-not-lose checklist (`main` side)

1. **Capture the live DB** (not just `schema.sql`) as baseline migration `0000_main_baseline.sql`:
   6 tables **with §8f drift additions**, `update_tipster_tick()` + trigger, **both** views
   (`tipster_stats` recovered from live + `tipster_rankings`), all indexes, all RLS policies.
2. **Backfill** real `main` users into dev/payments' Supabase Auth (no data loss); preserve all
   production rows (tipsters/betslips/legs/purchases/payments/earnings, FK-cascaded).
3. **Keep BOTH input methods** (screenshot `parse-slip` + booking code) and **BOTH verifiers**
   (worker entry-validation `verification_status` + football-API settlement `result`) — orthogonal
   columns, keep both.
4. **Port** `main`'s admin **Review/settle** UI + `api/admin/pending-slips` + `api/admin/settle`,
   re-guarded with `requireRole('admin')` + input validation; keep dev's `slips`/`verify-slip`/
   `transactions` alongside.
5. Preserve `note='__seed__'` convention + the JS seed-hide filter; keep `posting_mode='booking_code'`.
6. Widen `result` CHECK to include `'void'`; (optional, high-value) add `betslip_legs.fixture_id` to
   activate the dead reliable settlement path.
7. Keep no-store cache config on all channel/tipster routes.
8. For unified settlement: the bet-code worker must emit `betslip_legs` with `match="Home vs Away"`,
   `pick`, `match_time` so Verifier 2 grades code-entered slips through the same path screenshots use.

**Inconsistencies to SURFACE (pre-existing on `main`; not bugs to fix mid-merge):** page sort
(win-rate×odds) vs stats-route/view rank (wins×odds); explainer "4 weeks/28 days" vs SQL `avg_odds`
7-day window; `__seed__` slips counted in stats; `TipsterPublic` narrower than the real view;
in-memory `settings.publicSignupsEnabled`; unauthed `/api/verify`, `verify-debug`, `apitest`,
`fixturetest`.
