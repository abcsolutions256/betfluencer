# dev/payments — Booking-Code Parsing / Verification (Input method 2)

Provenance analysis for the additive merge. dev/payments **owns** this entire
subsystem; it is absent from `main`. Nothing here may be lost. All files read
from the working tree (== `stag` == dev/payments).

---

## 1. What "Input method 2" is

A tipster posts a slip by supplying a **bookie name + booking/share code**
(e.g. `betting_site:"Betika", booking_code:"KkxPBu"`) instead of typing legs
manually or uploading a screenshot. The platform then *independently verifies*
what that code actually contains by loading it on the real bookie and scraping
the selections. The scrape result becomes the slip's public PROOF (game count,
markets, leagues, earliest kickoff, total odds) and — post-purchase — the
revealed picks.

Three input methods exist (see `src/app/api/tips/route.ts:32`):
`booking_code` (this area) → `screenshot` → `manual`, chosen by which field is
present. Only `booking_code` slips are scraped; they start `verification_status
= 'pending'`, the others are trusted `'verified'` on post.

---

## 2. Topology — who calls whom

```
tipster posts coded slip
   │  POST /api/tips                       (src/app/api/tips/route.ts)
   ▼
verifyAndRecord(betslip_id, site, code)    (src/lib/verifyCode.ts:142)
   │  callWorker() → HTTP POST {BET_CODE_WORKER_URL}/verify   (verifyCode.ts:48)
   ▼
bet-code-worker  (separate Node/Express service, Puppeteer+Chromium)
   POST /verify                            (bet-code-worker/src/server.js:56)
   ├─ getAdapter(site)                     (bet-code-worker/src/adapters.js:201)
   ├─ scrapeCode({site,code})              (bet-code-worker/src/scraper.js:48)
   │     → headless Chrome loads the code, extracts rows + raw_text
   └─ normalizeSlip(result)  [if GEMINI_API_KEY] (bet-code-worker/src/normalize.js:202)
         → Gemini rewrites messy rows into canonical legs
   ▼ returns { ok, site, code, found, matches[], raw_text, count,
              screenshot_url, normalized[], totalOdds, summary }
   ▼
recordVerification()  upserts slip_verifications + reflects PROOF onto betslips
                                            (src/lib/verifyCode.ts:67)
```

Three callers of `verifyAndRecord` / `verifyCode.ts`:
1. **`POST /api/slips/verify-code`** — admin manual re-check (`requireRole('admin')`). `src/app/api/slips/verify-code/route.ts`.
2. **`POST /api/tips`** — auto-trigger fire-and-forget on post: `verifyAndRecord(bs.id, slip.betting_site, slip.booking_code).catch(()=>{})` (`tips/route.ts:78`).
3. **`POST|GET /api/slips/sync-codes`** — the poller (the `sync` container) keeps every still-pending coded slip fresh. `src/app/api/slips/sync-codes/route.ts`.

The booking code is then revealed to a buyer via **`GET /api/slips/[id]/reveal`**
(`src/app/api/slips/[id]/reveal/route.ts`).

---

## 3. How a code is parsed / validated

### 3a. Web side (`src/lib/verifyCode.ts`)
- **No format validation of the code itself** — any non-empty string is accepted (Zod only enforces `min(1)` on `betting_site`/`booking_code` at `verify-code/route.ts:13`). Site/code legitimacy is decided entirely by whether the worker can load it.
- `callWorker(betting_site, booking_code)` (line 48): POSTs to `${BET_CODE_WORKER_URL}/verify` with header `x-worker-key: BET_CODE_WORKER_KEY`, `AbortSignal.timeout(90_000)`. **Never throws** — returns a failed-shaped `WorkerResult` on any error (missing URL → `{ok:false,error:'worker not configured'}`; unreachable → `{ok:false,error:'worker unreachable: …'}`).
- `WorkerResult` interface (line 29) and `NormalizedLeg` interface (line 13) are the contract with the worker.

### 3b. Worker side — site resolution (`bet-code-worker/src/adapters.js`)
- `getAdapter(site)` (line 201): lowercases + strips all non-alphanumerics, then maps through an **alias table** (line 204): `onexbet→1xbet`, `twentytwobet→22bet`, `pawa→betpawa`, `pesa→sportpesa`, `mozzartbet→mozzart`, etc. Unknown site → `null`.
- `server.js:63` rejects an unsupported site with HTTP 400 `Unsupported site "X". Supported: …` **before** acquiring the Chrome concurrency slot — so an unsupported bookie returns `ok:false` and is recorded as a failed verification.
- **`betting_site` and `booking_code` are required** (`server.js:60`) → 400 if missing.
- Case is **preserved on the code** (`server.js:75` lower-cases only the site key, not the code) because some bookies use case-sensitive codes (Betika `"KkxPBu"`); the code is `.trim()`-ed.

### 3c. Worker side — actual scrape (`bet-code-worker/src/scraper.js`)
`scrapeCode({site, code})` (line 48) drives Puppeteer (`puppeteer-core` against `PUPPETEER_EXECUTABLE_PATH || /usr/bin/chromium`):
- One **shared browser** reused across requests; **fresh incognito `BrowserContext` per scrape** (line 66) — critical because bookies persist the betslip in localStorage and a reused profile would carry the prior code's selections and hide the empty-state code input.
- Two load strategies per adapter:
  - **`codeUrl(code)`** (Betika, MozzartBet, SportyBet) — navigate directly to a share/ticket URL (least fragile).
  - else **type-and-submit**: optional `expandSelector` click (1xBet/22Bet hide the input behind a "Save/load events" toggle), `waitForSelector(inputSelector)`, `input.type(code, {delay:40})`, click `submitSelector` (or press Enter), then `waitForNavigation` if `adapter.navigatesOnSubmit` (1xBet/22Bet reload to apply the coupon).
- Waits for `adapter.waitFor` (soft — does not hard-fail).
- **Extraction** (`page.evaluate`, line 140): `resultSelector` container's `innerText` → `raw_text` (capped 8000 chars); each `rowSelector` row mapped via `adapter.fields.{teams,league,market,pick,kickoff}` (comma-separated CSS lists, first non-empty match wins). Rows filtered to those with `teams || pick`.
- `found = matches.length > 0` — **this is the validity signal**: a code that loads no selections is treated as invalid/expired.
- Always captures a **debug screenshot** into `SHOT_DIR` (served at `/shots/<file>`, 48h TTL prune), even on failure (`scraper.js:190`). On error, `err.step` records exactly which phase broke (`launch-browser`/`goto-codeUrl`/`expand-toggle`/`wait-input`/`type-code`/`submit`/`wait-navigation`/`wait-result`/`extract`/`screenshot`).
- Worker exception → `server.js:96` returns **HTTP 200 with `ok:false`** (+`step`, +`screenshot_url`) so the caller can still persist the failure.

---

## 4. Supported betting sites

Two parallel lists that **must be kept in sync** (`bettingSites.ts:1` says so explicitly):

| `src/lib/bettingSites.ts` `BETTING_SITES` (UI display order) | worker `adapters.js` key | load method | confirmation |
|---|---|---|---|
| `Betika` | `betika` | `codeUrl` `/en-ug/share/<code>` | confirmed live 2026-06-19 |
| `betPawa` | `betpawa` | type-submit | confirmed live 2026-06-19 (single + combo) |
| `1xBet` | `1xbet` (alias `onexbet`) | type-submit + expand toggle + `navigatesOnSubmit` | confirmed (code KSA6G) |
| `22Bet` | `22bet` (alias `twentytwobet`) | type-submit + `navigatesOnSubmit` | confirmed (code XLD6G) |
| `SportPesa` | `sportpesa` (alias `pesa`) | type-submit | confirmed (code HXHWHV) |
| `MozzartBet` | `mozzart` (alias `mozzartbet`) | `codeUrl` numeric ticket route | codeUrl confirmed; rows inferred |
| `SportyBet` | `sportybet` | `codeUrl` `/ug/sport/load_code/<code>` | **UNVERIFIED** (no capture) |
| `Betway` | `betway` | type-submit | **UNVERIFIED** placeholders |

- The `bettingSites.ts` list is ordered most-reliable first; the top 6 are HTML-confirmed, the last 2 best-effort.
- **Explicitly NOT supported** (documented at `adapters.js:186`): **Fortebet** (counter-only numeric i-ticket, not loadable online) and **Championbet** (ticket status needs code+PIN). Deliberately omitted so `/verify` returns a clear "unsupported site".
- `supportedSites()` (`adapters.js:217`) returns the adapter display names; surfaced in `/health` and in the 400 error message.

Per-adapter selectors and the rationale for each (which node packs market+pick, which carries an "NNNNNN. " league id prefix, etc.) are heavily commented in `adapters.js` — that commentary is itself load-bearing provenance and should survive the merge verbatim.

---

## 5. The normalized match/leg representation

There are **TWO** representations of a coded slip's contents, both stored in
`slip_verifications`:

1. **`matches`** (raw scrape) — `[{teams, league, market, pick, kickoff}]`, bookie-specific and messy. Produced by the scraper.
2. **`normalized`** (clean) — `NormalizedLeg[]` produced by the **Gemini normaliser** (`bet-code-worker/src/normalize.js`), only when `GEMINI_API_KEY` is set on the worker AND the code is valid (`server.js:82`). Best-effort: any failure (no key / timeout / bad JSON) is caught and leaves `/verify`'s contract intact (`server.js:85`).

### The Gemini normaliser (`bet-code-worker/src/normalize.js`)
- No SDK — a single `fetch` to the Gemini REST API (`v1beta …:generateContent`), key in `x-goog-api-key` header (never the URL). Env: `GEMINI_API_KEY` (required to enable), `GEMINI_MODEL` (default `gemini-3.1-flash-lite`), `GEMINI_BASE_URL`, `GEMINI_TIMEOUT_MS` (default 20000).
- Strict JSON enforced via `responseMimeType:'application/json'` + `responseSchema` (`RESPONSE_SCHEMA`, line 163), `temperature:0` (deterministic).
- Input given to the model (`normalizeSlip`, line 202): `{site, code, currentDate, matches, raw_text}` — `raw_text` is declared the "single source of truth"; `matches` are "hints".
- A long `SYSTEM_INSTRUCTION` (line 19) defines per-leg fields: split home/away (home always first), **canonical market codes** `1X2 | DC | OU | BTTS | DNB | AH | EH | CS | OTHER`, **pickSymbol** mapping (team→`1`/`2`, draw→`X`, `Over 2.5`, `Yes`/`No`, handicap `1 (-1.5)`, score `2:1`), `pickSide` (home/away/draw/n/a), `pickTeam`, `line`, `odds`, **kickoff as ISO-8601 +03:00 EAT** (year resolved from `currentDate`, never past), `kickoffRaw`, per-leg + slip `summary`, and a top-level `totalOdds`.
- Returns `{normalized[], totalOdds, summary}` (line 251).

### `NormalizedLeg` shape (`verifyCode.ts:13`)
`{teams, homeTeam, awayTeam, market, marketLabel, pickSymbol, pickSide, pickTeam, line, odds, kickoff, kickoffRaw, summary}`.

---

## 6. How parsed matches/legs land in the DB

### 6a. `recordVerification()` (`verifyCode.ts:67`) — the persistence core
Builds a `slip_verifications` row (line 84) from the worker result:
`betslip_id, betting_site, booking_code, matches (raw), normalized (Gemini legs),
summary, total_odds (coerced to numeric or null, line 78), raw_text,
match_count, found, status ('scraped' if ok else 'failed'), error, screenshot_url,
scraped_at`.

- **With `betslip_id`** → `upsert(..., {onConflict:'betslip_id'})` → ONE current row per slip.
- **Without `betslip_id`** (admin one-off check) → `insert` (appended; Postgres allows multiple NULLs under the unique index).

### 6b. Reflecting PROOF onto `betslips` (`verifyCode.ts:113`)
Only when `betslip_id` is present:
- **`found && matches.length`** → set on `betslips`:
  `verification_status='verified'`, `verified_at`, `game_count`,
  `markets` (canonical, from `normalized` if present else raw),
  `leagues` (from raw matches — the normaliser doesn't carry league),
  `earliest_kickoff` (min of parsed kickoffs, prefers normalized ISO),
  and `total_odds` if present. Prefers `normalized` over raw when available
  (`useNorm`, line 115). **Never un-verifies** an already-verified slip.
- **`ok` but NOT found** → bad/expired code → `db.rpc('record_failed_verify', {p_betslip_id})` (line 134): atomically bumps `verify_attempts` and flips a still-`pending` slip to `'failed'` (leaves `verified`/`rejected` alone).
- **Worker errored / unreachable** (`!ok`) → change nothing; slip stays `pending` for the poller to retry (does NOT increment `verify_attempts` — "not the code's fault").

### 6c. Tables/columns (dev/payments migrations)
- **`slip_verifications`** — created `supabase/migrations/20260610000004_slip_verifications.sql`. Columns: `id, betslip_id (FK→betslips, on delete cascade), betting_site, booking_code (not null), matches jsonb, raw_text, screenshot_url, match_count, found, status check('scraped','failed','verified'), error, scraped_at`. Unique index `uniq_slip_verif_betslip` on `betslip_id` (enables the upsert). Index `idx_slip_verif_code` on `booking_code`. **RLS enabled, NO anon policy → service-role only** (the normalized picks never reach the public feed).
- **0006 / `20260622120000_normalized_verification.sql`** (the migration named in the task; file header reads "0006") — adds `normalized jsonb not null default '[]'`, `summary text`, `total_odds numeric` to `slip_verifications`.
- **`verify_attempts` + `record_failed_verify()`** — `supabase/migrations/20260625120000_skip_verified_sync.sql`. Adds `betslips.verify_attempts int default 0`, partial index `idx_betslips_verify_retry on betslips(verification_status, verify_attempts) where result='pending'`, and the SQL function `record_failed_verify(p_betslip_id uuid) returns int` (bump counter + flip pending→failed, `where verification_status in ('pending','failed')`).
- **`betslip_secrets`** — `supabase/migrations/20260612120000_auth_paywall_overhaul.sql:59`. `betslip_id pk (FK→betslips), booking_code, betting_site, slip_image_url`. **RLS enabled, NO policy → service-role only.** This is where the booking code + site actually live (the overhaul moved them off `betslips`, nulling the old columns). The poller reads code+site from here.
- **`betslips`** proof columns (same migration): `verification_status check('pending','verified','failed','rejected')`, `verified_at, game_count, leagues jsonb, markets jsonb, earliest_kickoff`.
- **`betslip_legs`** — `supabase/migrations/20260610000001_init.sql:42`. Manual-entry legs (`match, league, pick, odds, match_time, result`); **not** populated by code verification (those land in `slip_verifications.normalized`). RLS gates them to finished-parent-only.

---

## 7. The poller (`src/app/api/slips/sync-codes/route.ts`)
- Auth: header `x-sync-token` == `SYNC_TOKEN`. Both `POST` and `GET` handlers.
- Kill switch: `SYNC_CODES_ENABLED=false` → no-op (used in prod because the scraper is blocked from datacenter IPs; sync runs from a LOCAL residential-IP stack against the same DB).
- Query (line 45): reads `betslip_secrets` joined `betslips!inner`, filters:
  `booking_code not null/≠''` AND `betslips.result='pending'` AND
  `betslips.verification_status in ('pending','failed')` AND
  `betslips.verify_attempts < SYNC_MAX_FAILED_RETRIES (default 5)`, `limit SYNC_BATCH (default 20)`.
  → re-`verifyAndRecord` each. **Skips already-verified slips** (a code's selections are immutable — re-scraping wastes the worker / risks IP blocks; this is the whole point of migration `20260625120000`).

---

## 8. How this composes with the bet worker (separation of concerns)
- The **worker is a separate service** (`bet-code-worker/`, its own `Dockerfile`/`package.json`/`README.md`) precisely because it needs a real browser (Puppeteer+Chromium) that Vercel can't run (README). Deployed independently (Hetzner/Coolify/Railway/Fly).
- Contract boundary: web ↔ worker is the `POST /verify` JSON shape (documented in `server.js:1` and `README.md`). `verifyCode.ts`'s `WorkerResult`/`NormalizedLeg` mirror it; `bettingSites.ts` mirrors `adapters.js`.
- The web app **never scrapes**; it only calls the worker, persists results, derives public proof, and gates reveal. The worker **never touches the DB**; it is a pure scrape+normalise function behind `x-worker-key`.
- Auth keys at each hop: web→worker `BET_CODE_WORKER_KEY`/`x-worker-key`; worker→Gemini `GEMINI_API_KEY`/`x-goog-api-key`; poller `SYNC_TOKEN`/`x-sync-token`; admin re-check `requireRole('admin')`; reveal gated by purchase (`x-buyer-key`/`?buyer=`) or owning tipster session.

---

## 9. Reveal path (`src/app/api/slips/[id]/reveal/route.ts`)
`GET /api/slips/[id]/reveal` — the unlock. Finished slips (`result in win|loss`)
are free to anyone; pending slips require an active purchase (`buyer_key`) OR the
owning tipster (session, matched via `tipsters.profile_id = auth.uid()` — note the
`profile_id` join, which the MEMORY flags as the **P0 legacy-NULL tipster-login**
risk). On authorization it returns, in parallel:
`betslip_secrets`(booking_code, betting_site, slip_image_url) +
`betslip_legs` + `slip_verifications`(matches, raw_text, **normalized**, summary,
total_odds). So the **normalized legs are the buyer-facing structured picks**.

---

## 10. Merge-critical preservation notes / risks
- **Two synced lists**: `src/lib/bettingSites.ts` ↔ `bet-code-worker/src/adapters.js`. Both must survive together; the adapter alias table and per-site selector commentary are load-bearing.
- **Filename vs header drift**: `20260622120000_normalized_verification.sql` is internally titled "0006" — harmless, but note when reconciling migration numbering against `main`'s `src/lib/schema.sql` baseline.
- `slip_verifications`, `betslip_secrets`, `verify_attempts`, `record_failed_verify()` are **dev/payments-only** objects absent from `main`'s schema baseline — they must be additively merged, not dropped.
- The normaliser's `SYSTEM_INSTRUCTION` contains two stacked prompt versions (the original spec at `normalize.js:19` plus an "Additonally" second spec at line 69 with a *different* response schema in prose); only `RESPONSE_SCHEMA` (line 163) actually governs output. Preserve as-is but flag for cleanup post-merge.
- `main` owns the football-API leg **settlement** (win/loss); dev/payments owns the **verification** (does the code resolve / what does it contain). These are orthogonal — settlement reads `betslips.result`, verification writes `verification_status`. The poller's `result='pending'` filter is the seam where the two meet: once `main`'s settlement marks a slip win/loss, this poller stops touching it.
