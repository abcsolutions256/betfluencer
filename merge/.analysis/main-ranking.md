# main — RANKING system (provenance for additive merge)

Scope: the tipster leaderboard at `/rankings`, its scoring formula, every field/column it
reads, ordering logic, page layout + responsive rules, and how settled/won counts feed score.
All paths read from `main` via `git show main:…` unless noted.

## 1. Files that own ranking on `main`

| File | Role |
|------|------|
| `src/app/rankings/page.tsx` | The rankings page (client component). Fetches, **re-sorts**, scores, renders the table. |
| `src/app/api/tipster/route.ts` | `GET /api/tipster` — returns all rows from view `tipster_stats`. Data source for the page. |
| `src/app/api/tipster/[slug]/stats/route.ts` | Per-tipster stats incl. **rank** computed from the same `tipster_stats` view + same score. |
| `src/app/api/tipster/[slug]/slips/route.ts` | Per-tipster slip list (uses `tipster_stats` only to resolve username→id). |
| `src/lib/db.ts` | `getAllTipsters()` / `getTipsterByIdentifier()` — query `tipster_stats`, order by `score`. |
| `src/components/ui/WinHistory.tsx` | `WinRateBadge` — wins/total badge + "last 15 days" win-history modal (channel/profile, not the rankings table). |
| `src/types/index.ts` | `TipsterPublic` interface (the *documented* view contract; narrower than what the page actually reads). |
| `src/types/betslip.ts` | `Betslip` / `SlipLeg`, `SlipResult`, odds filters/risk labels (feed WinHistory + slip cards). |
| `src/lib/schema.sql` (+ rls.sql) | DB baseline. Defines view **`tipster_rankings`**, the `betslips`/`betslip_legs` tables, and the auto-tick trigger. |

## 2. CRITICAL provenance finding — `tipster_stats` vs `tipster_rankings`

- **All of main's runtime code queries a view named `tipster_stats`** (`api/tipster/route.ts:11`,
  `db.ts:17,31,40`, `stats/route.ts:14,18`, `slips/route.ts:13`).
- **But neither branch defines `tipster_stats` in tracked SQL.** The only view defined is
  **`tipster_rankings`** — in `main:src/lib/schema.sql:141` AND identically in
  `dev/payments` at `supabase/migrations/20260610000001_init.sql:149`.
- `git grep "create .*view" main` → only `tipster_rankings`. `grep -rn` over `supabase/migrations/`
  for `tipster_stats|slips_posted|as losses|as roi|last5|as slug` → **no matches.**
- Conclusion: **`tipster_stats` is a live-DB view created out-of-band** (not captured in either
  branch's migrations). It is a *superset* of `tipster_rankings`: it must additionally expose
  `losses`, `slips_posted`, `roi`, `last5`, `slug`, `subscriber_count`, `sport`, `created_at`
  (see the page's `TipsterRow` type below) — fields absent from `tipster_rankings`.
- **MERGE RISK (must not lose):** the merged DB MUST keep a `tipster_stats` view with the full
  column set the page consumes, or the rankings page silently degrades (missing columns →
  `undefined` → all the `?? 0` fallbacks fire, ROI/Streak/Last5 blank, win% collapses).
  Recommend capturing the live `tipster_stats` definition into a migration during the merge.

## 3. Scoring formula (THE matrix)

Score is computed **twice and identically** — once in SQL (`tipster_rankings.score`) and again
client-side in the page/stats route. The page does NOT trust the view's `score`; it recomputes.

### 3a. Client-side score (authoritative for display + ordering) — `page.tsx:91-95`
```
settled  = (wins_last_10 ?? 0) + (losses ?? 0)
winRate  = settled > 0 ? wins_last_10 / settled : 0
score    = winRate * (avg_odds || 1)
```
- This is the **"rank by win rate × odds"** + **"wins out of total settled"** behavior named in
  the recent main commits (`40ba53c`, `bdbcc43`).
- `winRate` denominator = **settled slips only** (wins + losses); pending excluded. So `wins/total`
  shown on the table is `wins / (wins+losses)`, NOT `wins/10`.
- `avg_odds` falls back to `1` when 0/null, so score = winRate when no winning odds available.
- Recomputed again per-row at render (`page.tsx:175-177`) for the optional Score column — same formula.

### 3b. Stats-route rank — `stats/route.ts:23-26`
```
score = (wins_last_10 ?? 0) * (avg_odds || 1)   // NOTE: raw wins × odds, NOT win-rate × odds
rank  = position in desc-sorted list by that score
```
- **DISCREPANCY to flag:** the per-tipster `rank` uses **raw `wins_last_10 × avg_odds`**, whereas
  the rankings *page* orders by **`winRate × avg_odds`**. The page's row position and the profile's
  displayed "rank" can therefore disagree. (Pre-existing on main; preserve as-is unless asked.)

### 3c. SQL score (view) — `schema.sql:148-174` / init migration `:149-175`
```
score = wins_last_10 * avg_odds      -- raw wins × odds (matches stats route, not the page)
```
where in SQL:
- `wins_last_10` = count of `result='win'` among the **last 10 betslips by `posted_at desc`**.
- `avg_odds`     = `round(avg(total_odds),1)` over betslips with `result='win'` AND
  `posted_at > now() - interval '7 days'`, coalesced to `1.0`.
- `subscriber_count` = count of `slip_purchases` where `status='active'`.
- View is `order by score desc`; `db.ts:getAllTipsters` also `.order('score', desc)`.

> So three layers compute "score" three slightly different ways: SQL view and stats-route =
> `wins×odds`; rankings page = `winRate×odds`. The page's client re-sort is what users see on `/rankings`.

## 4. Every field/column the ranking reads

### 4a. Page row shape — `page.tsx:5-19` (`type TipsterRow`)
Read from `tipster_stats` via `/api/tipster`:
`id, name, username, sport, wins_last_10, losses, slips_posted, avg_odds, roi, last5,
subscriber_count, tick_type, verified, slug`.
- Used in render: `wins_last_10` (W col + winRate numerator), `losses` (L col + winRate denom),
  `slips_posted` (Slips col), `avg_odds` (Odds col + score), `roi` (ROI col), `last5` (Last 5 dots
  + Streak), `name` (avatar initials + label), `sport` (sub-label, default 'Football'), `verified`
  (✓ badge), `id` (react key). `username/slug/subscriber_count/tick_type` typed but not rendered here.

### 4b. Documented view contract — `types/index.ts` `TipsterPublic`
`id, name, username, description, sport, verified, tick_type, subscriber_count, wins_last_10,
avg_odds, score`. **Narrower than what the page reads** — missing `losses, slips_posted, roi,
last5, slug`. The page's local `TipsterRow` is the real contract; `TipsterPublic` is stale/partial.

### 4c. Underlying tables (`schema.sql`)
- `betslips`: `tipster_id, total_odds numeric(8,2), leg_count, result text check in
  ('pending','win','loss') default 'pending', note default '', posted_at timestamptz default now()`
  (cols at `schema.sql:24-37`). Index `idx_betslips_tipster (tipster_id, posted_at desc)` (`:94`).
- `betslip_legs`: `result text check in ('pending','win','loss')` (`:48`).
- `result='win'` is the single signal that feeds `wins_last_10`, `avg_odds`, and the score.
- `note='__seed__'` marks seeded historical slips, filtered out of public slip lists
  (`slips/route.ts`), but **still counted in the view's win/odds stats** (the view does not
  exclude `__seed__`). Flag for merge: ranking counts may include seeded slips.

## 5. Ordering logic (the pipeline)

1. View `tipster_stats` / `tipster_rankings` returns rows `order by score desc` (or
   `api/tipster/route.ts` orders by `created_at desc` — see note).
2. `api/tipster/route.ts:13` actually orders by **`created_at desc`**, NOT score — so the API order
   is insertion order; the page does the real ranking sort itself.
3. `page.tsx:97`: client `.sort((a,b) => scoreOf(b) - scoreOf(a))` with `scoreOf` = winRate×odds (3a).
4. Rank number = array index + 1 (`page.tsx:165`).
5. `db.ts:getAllTipsters` (used elsewhere, e.g. channels) orders by view `score` (wins×odds).

## 6. Page layout / columns + responsive hide rules — `page.tsx`

Header band: 🏆 "Betfluencer rankings", subtitle "Win rate · avg odds · score", a "Last 28 days"
pill, and an explainer: **"Score = win rate × avg winning odds · rolling 4 weeks only"**
(`page.tsx:131`). (Copy says 28 days / 4 weeks, but the SQL `avg_odds` window is **7 days** — copy/logic mismatch to flag.)

Legend + toggle row: zone legend `Top 2 / Elite / Mid / Bottom`; a **"Show Score / Hide Score"**
button toggling `showExtra` (adds the optional Score column).

Table columns (in order): `# | Tipster | Slips | W | L | Win% | Odds | ROI | Streak | Last 5 | [Score]`.
- `Score` column only renders when `showExtra` is true.

**Responsive hide rules** — CSS `@media (max-width: 640px) { .rk-optional { display:none } }`
(`page.tsx:113`). Columns with `className="rk-optional"` hidden on mobile:
- **`L` (losses)** header `:172` / cell `:201`
- **`Streak`** header `:177` / cell `:208`
(Matches commit `a497c19` "responsive rankings - hide L, Streak, Last 5 on mobile" — though in this
version of the file only **L and Streak** carry `rk-optional`; Last 5 is NOT hidden. Verify against
HEAD if that commit is newer.)
The table is also wrapped in `overflowX:auto` for horizontal scroll on small screens.

### Color / visual helpers (all in `page.tsx`)
- `zoneColor(rank,total)`: rank≤2 purple `#a855f7`; rank≤floor(0.3·total) blue `#3b82f6`;
  rank≥total−1 red `#ef4444`; else gray `#6b7280`. Drawn as a 3px left bar on `#` cell.
- `winPctColor(pct)`: ≥0.7 green, ≥0.5 amber, else red.
- `ResultDots({last5})`: splits `last5` CSV; `W`→green, `L`→red, else amber dot with the letter.
- `streakLabel(last5)`: counts leading run of identical results from the **first** entry →
  `W{n}` green / `L{n}` red / `P{n}` amber.
- `last5` is a **comma-separated string** (e.g. `"W,W,L,P,W"`) produced by the live `tipster_stats`
  view (not defined in tracked SQL — see §2).

## 7. WinHistory (`components/ui/WinHistory.tsx`) — adjacent, not the table

`WinRateBadge({wins, total=10, slips})`: renders a `wins/total` badge (default total **10**) + a
progress bar `pct=(wins/total)*100`. Tapping opens a bottom-sheet modal "Win history · Last 15 days":
filters `slips` to `posted_at` within **15 days**, tallies `result` win/loss/pending, lists each slip
with leg-level win/loss/pending dots, odds, date (`en-UG` locale). Consumes `Betslip`/`SlipLeg`
(`types/betslip.ts`) incl. `result` ∈ `pending|win|loss|void`. Note the badge's default `/10` denom
differs from the rankings table's settled-based win%. Used on channel/profile, not `/rankings`.

## 8. Merge checklist (do-not-lose)

1. **Keep the live `tipster_stats` view** with full columns: `id, name, username, sport,
   wins_last_10, losses, slips_posted, avg_odds, roi, last5, subscriber_count, tick_type,
   verified, slug, score, created_at`. Capture its real DDL into a migration — it is the single
   most fragile undocumented dependency of the ranking feature.
2. Preserve the client-side score formula in `page.tsx` (winRate×odds, settled denom).
3. Preserve `rk-optional` responsive hide CSS + the `showExtra` Score toggle.
4. Keep `betslips.result`/`betslip_legs.result` enum `('pending','win','loss')` and `posted_at`
   index — the entire score derives from `result='win'` over recent slips.
5. Note inconsistencies to surface (pre-existing on main, not bugs to fix during merge):
   page sort = winRate×odds vs stats-route/view rank = wins×odds; explainer copy "28 days/4 weeks"
   vs SQL `avg_odds` 7-day window; `__seed__` slips counted in stats; `TipsterPublic` type narrower
   than actual view.
