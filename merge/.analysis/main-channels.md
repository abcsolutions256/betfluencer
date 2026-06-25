# main — CHANNELS page logic (provenance for merge; preserve all)

Area owner: `main`. Feature: public **channels** browsing (list of tipsters/channels)
and per-channel detail (profile + betslip feed). No feature here may be lost in the
additive merge with `dev/payments`.

## Files (read via `git show main:PATH`)

UI (client components, all `'use client'`):
- `src/app/channels/page.tsx` — channels LIST page ("TRENDING THIS WEEK").
- `src/app/channel/[slug]/page.tsx` — channel DETAIL page (profile header + tabs).

API routes (all `export const dynamic='force-dynamic'; revalidate=0; fetchCache='force-no-store'`):
- `src/app/api/tipster/route.ts` — list endpoint feeding channels page.
- `src/app/api/tipster/[slug]/route.ts` — single tipster + tips (uses db.ts helpers).
- `src/app/api/tipster/[slug]/slips/route.ts` — betslips for a channel **(seed-hide logic lives here)**.
- `src/app/api/tipster/[slug]/stats/route.ts` — aggregate stats + rank.
- `src/app/api/tipster/[slug]/earnings/route.ts` — earnings rows (tipster-facing).

Lib:
- `src/lib/db.ts:12-60` — `getAllTipsters`, `getTipsterByIdentifier`, `getTipsByTipster` (with `MOCK_TIPSTERS` fallback when supabase unconfigured).

## What channels DISPLAY

### List page `channels/page.tsx`
- Fetches `GET /api/tipster`, reads `data.tipsters` into state.
- Header label "TRENDING THIS WEEK".
- `SearchBar` (`@/components/ui/SearchBar`) filters client-side over `tipsters`, emits to `results`.
- Renders `TipsterCard` per result with `rank={i+1}` (rank = array position from API order). `SearchEmpty` when no results.
- Loading text "Loading tipsters..." while fetching.

### Detail page `channel/[slug]/page.tsx`
- Two parallel fetches on `slug`: `GET /api/tipster/${slug}` (sets `tipster`) and `GET /api/tipster/${slug}/slips` (sets `slips` from `d.slips`).
- NOTE the slips page reads `d.slips`, but `[slug]/route.ts` returns `{ tipster, tips }` (key `tips`, not `slips`). The **slips** array comes from `[slug]/slips/route.ts` which returns `{ slips }`. So the detail page's `tipster` comes from `…/route.ts` and `slips` from `…/slips/route.ts` — two different endpoints.
- Profile header: `Avatar`, name, `VerifiedTick tickType={tipster.tick_type}`, `@username · sport`.
  - `WinRateBadge wins={wins} total={settled} slips={slips}` where `wins = tipster.wins_last_10 ?? 0`, `losses = tipster.losses ?? 0`, `settled = wins+losses`.
  - `subscriber_count` shown as "N fans".
  - `FollowButton tipsterId={tipster.id}`.
  - Static gold banner: "Pay per slip — buy only the tips you want. Finished slips are free to view."
- Tabs: **Betslips** (`BetslipFeed slips={slips}`) and **About**.
  - About rows: description, Username `@username`, Covers `sport||'Football'`, Win rate `settled>0 ? round(wins/settled*100)% (wins/settled) : '—'`, Avg odds `(avg_odds??0).toFixed(2)x`, Fans `subscriber_count`.

## CALCULATIONS

- **Win rate** (detail/About): computed in the component from `wins_last_10` and `losses`; `settled = wins + losses`; pct `= round(wins/settled*100)`.
- **Rank** (`[slug]/stats/route.ts`): rebuilt in JS to match the rankings page —
  `score = (wins_last_10 ?? 0) * (avg_odds || 1)`, sort desc, `rank = index+1`.
  (Mirrors view `score` and recent commits "rank by win rate x odds to match leaderboard score".)
- **Buyers / subscriber_count** (`stats/route.ts`): `new Set(slip_purchases.user_phone).size` for that tipster (distinct buyers), overriding the view's `subscriber_count` for the stats endpoint.
- **slips_posted** = count of `betslips` rows for tipster. **total_earned** = sum of `earnings.amount`.
- List ordering: `GET /api/tipster` orders `tipster_stats` by `created_at desc`. (db.ts `getAllTipsters` orders by `score desc` instead — the route and the helper differ; the channels page uses the **route**, ordered by `created_at`.)

## FILTERING — hide seeded/historical slips (recent commit e469cea)

`src/app/api/tipster/[slug]/slips/route.ts`:
- Resolve `slug`: `tipster_stats` `ilike username` → `id`; fallback treat slug as id.
- Query `betslips` `*, betslip_legs(*)` where `tipster_id=…` order `posted_at desc` limit 200.
- **Filter**: `s.note !== '__seed__'` (NULL-safe in JS — drops seeded historical slips from public view), then `.slice(0,50)`, mapping `legs: s.betslip_legs ?? []`.
- The sentinel is the `betslips.note` column (text, default `''`; main schema.sql:32). Seeded rows carry `note='__seed__'`.

## DATA SOURCES

- **View `tipster_stats`** — queried by `/api/tipster`, `[slug]/slips`, `[slug]/stats`, and `db.ts` helpers. Columns used: `id, name, username, description, sport, verified, tick_type, subscriber_count, wins_last_10, avg_odds, score, created_at`, plus `losses`/`avg_odds` consumed by UI.
- Tables: `betslips` (+`betslip_legs`), `slip_purchases`, `earnings`.

## CROSS-BRANCH MERGE RISKS (flag — do not lose)

1. **`tipster_stats` view is undefined in source.** main's `src/lib/schema.sql:141` defines a view named **`tipster_rankings`** (cols: id,name,username,description,sport,verified,tick_type,subscriber_count,wins_last_10,avg_odds,score). dev/payments `supabase/migrations/20260610000001_init.sql:150` also defines **`tipster_rankings`** only. NO migration or schema file in either branch creates **`tipster_stats`**, yet every channel route queries `tipster_stats`. The channels feature depends on a `tipster_stats` view (almost certainly an alias/rename of `tipster_rankings`, likely with extra `created_at`/`losses` columns) that exists only in the live DB. **The merge must add a `tipster_stats` view (or rename `tipster_rankings`→`tipster_stats`) or all channel pages 500 / return empty.**
2. **Columns `losses` and `created_at`** are read by the channels UI/route but are NOT in the `tipster_rankings` view definition. The deployed `tipster_stats` must expose them; preserve when reconstructing.
3. **`order('created_at')`** in `/api/tipster` requires `created_at` on the view; `tipster_rankings` lacks it.
4. **Route vs helper divergence**: `/api/tipster` orders by `created_at desc`; `db.ts getAllTipsters` orders by `score desc`. Channels page uses the route. Keep both behaviors as-is unless intentionally unified.
5. **Seed-hide depends on `betslips.note`** (`'__seed__'` sentinel). Preserve the `note` column and the JS filter; do not let a dev/payments betslips migration drop/rename `note`.
6. **No-store caching** on all channel routes is deliberate (memory: "no-store cache fix"). Preserve headers + route segment config.
