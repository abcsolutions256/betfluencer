# dev/payments — BET WORKER (Verifier 1 / entry validation)

Provenance analysis for the additive `main` ← `dev/payments` merge. **This entire feature is dev/payments-only.** Confirmed absent from `main`:
- `git ls-tree -r --name-only main -- bet-code-worker` → empty (no worker dir on main).
- `git ls-tree -r --name-only main -- src/app/api/slips/` → only `route.ts`; **no** `verify-code/`, **no** `sync-codes/` on main.

Merge rule: **add the whole `bet-code-worker/` service, the two API routes, `src/lib/verifyCode.ts`, and the worker+sync wiring in the compose files — verbatim. No feature may be lost.** Nothing here conflicts with main (main never touched these paths).

---

## 1. True nature of the service

It is **NOT a Postgres/queue worker.** It is a **standalone, stateless HTTP microservice** — its own Node process, its own `package.json`, its own Dockerfile/image — that drives **headless Chrome (Puppeteer + Debian chromium)** to load a bookie *booking/share code* on the real betting site and scrape back the selected matches. It exists as a separate service on purpose: Vercel can't run headless Chrome, so this is deployed as a separate Docker container on a private network.

- Process entry: `bet-code-worker/src/server.js` — an **Express** app listening on `:8080` (`PORT` env, default 8080).
- Runtime: Node 24, `puppeteer-core` `^23.10.4` driving system chromium at `/usr/bin/chromium` (`PUPPETEER_EXECUTABLE_PATH`). `puppeteer-core` (not `puppeteer`) → no bundled Chromium download; `PUPPETEER_SKIP_DOWNLOAD=true` in the Dockerfile.
- Deps (`bet-code-worker/package.json`): only `express` + `puppeteer-core`. `"type":"module"` (ESM), `engines.node >=24`. Scripts: `start` = `node src/server.js`, `dev` = `node --watch src/server.js`.
- **Stateless** re. business data — writes nothing to Postgres itself. Its only persistence is **debug PNG screenshots** on a local dir/volume. All DB writes happen on the *web* side (`recordVerification` in `verifyCode.ts`).

Source files (all under `bet-code-worker/src/`):
- `server.js` (Express API, auth, concurrency gate, screenshot serving) — 112 lines.
- `scraper.js` (Puppeteer browser mgmt + the scrape state machine + screenshots) — 240 lines.
- `adapters.js` (per-bookie selector configs + site-name normalisation) — 218 lines.
- `normalize.js` (optional Gemini LLM normaliser of scraped output) — 257 lines.

---

## 2. HTTP API surface (`server.js`)

### `POST /verify`
- **Auth:** header `x-worker-key: <WORKER_API_KEY>`. `authed()` (server.js:46) rejects with `401 {ok:false,error:'unauthorized'}` when `WORKER_API_KEY` is set and the header doesn't match. **If `WORKER_API_KEY` is empty, auth is skipped** (open) — so the key MUST be set in any non-local deploy.
- **Body:** `{ betting_site, booking_code }`. Missing either → `400 {ok:false,error:'betting_site and booking_code are required'}`. Unknown site (no adapter) → `400 {ok:false,error:'Unsupported site "X". Supported: …'}` (server.js:63-66).
- **Concurrency gate** (server.js:37-44, 68/98): a tiny in-process semaphore caps simultaneous scrapes at `MAX_CONCURRENT` (env `MAX_CONCURRENT`/`MAX`, default 2) because each Chrome page is heavy. `acquire()` before scrape, `release()` in `finally`.
- **Case handling** (server.js:75): the **site key is lowercased** before scrape, but the **booking code's case is preserved** (`String(booking_code).trim()`) — some bookies (Betika `KkxPBu`) use case-sensitive codes whose share URL 404s if lowercased.
- **Success:** `res.json({ ok:true, ...result, ...enrich, screenshot_url })` (server.js:91). `result` is the scraper output (§4); `enrich` is the optional Gemini normalisation (§5); `screenshot_url` is the absolute URL of the debug shot.
- **Failure (scrape threw):** still **HTTP 200** with `{ ok:false, betting_site, booking_code, error, step, matches:[], raw_text:'', count:0, screenshot_url }` (server.js:96). This is deliberate — the caller (`callWorker`) records a failed attempt rather than throwing. `step` names the exact failing stage (launch-browser / goto-codeUrl / wait-input / type-code / submit / wait-navigation / wait-result / extract / screenshot).

### `GET /health`
- `res.json({ ok:true, active, sites: supportedSites() })` (server.js:54). No auth. Used by the Docker `HEALTHCHECK` and ops.

### `GET /shots/<file>` (static)
- `app.use('/shots', express.static(SHOT_DIR))` (server.js:28). Serves the debug screenshots. `shotUrl()` (server.js:31-35) builds the absolute URL from `PUBLIC_BASE_URL` (set behind a TLS proxy) or the request's `protocol://host`.

### Graceful shutdown
- `SIGINT`/`SIGTERM` → `server.close()` + `shutdown()` (closes the shared Chrome) so the browser doesn't leak on container stop (server.js:104-111).

---

## 3. How it validates that a booking code "works" (`scraper.js`)

`scrapeCode({ site, code })` is a **logged step state-machine**. Each `step` variable is set before the action so a thrown error reports exactly where it broke, and a full-page screenshot is captured on both success and failure.

1. **Shared browser, isolated context per scrape.** One Chromium is launched lazily and reused (`getBrowser()`, scraper.js:22-42, args incl. `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu`). But **each scrape gets a fresh `browser.createBrowserContext()` (incognito)** (scraper.js:66) — critical, because bookies persist the betslip in `localStorage`; a reused profile would carry the previous code's selections into the next request and hide the empty-state code input. UA + viewport are set (scraper.js:74-75). `pageerror`/`requestfailed` are logged to explain missing selectors.
2. **Load the code — two strategies (per adapter):**
   - **`codeUrl(code)` direct URL** (best, least fragile): `page.goto(url, {waitUntil:'networkidle2', timeout:NAV_TIMEOUT})` (scraper.js:79-83). Used by Betika, MozzartBet, SportyBet.
   - **type-and-submit** (scraper.js:84-128): goto `adapter.url`; optionally click `expandSelector` first (1xBet/22Bet hide the code input behind a "Save/load events" toggle); `waitForSelector(inputSelector)`; `input.type(code,{delay:40})`; click `submitSelector` (or press Enter); if `navigatesOnSubmit` (1xBet), absorb the reload with `waitForNavigation` so the later `page.evaluate` doesn't throw "Execution context destroyed".
3. **Wait for results** (scraper.js:132-137): `waitForSelector(adapter.waitFor)` — does **not** hard-fail if missing; logs a warning and still returns whatever text is on the page.
4. **Extract** (scraper.js:139-166, inside `page.evaluate`): `resultSelector` → container; `rowSelector` → rows; per-row `fields.{teams,league,market,pick,kickoff}` via comma-list-aware `cellText`. Rows are kept only if `teams || pick`. Always grabs `rawText` (container `innerText` or `document.body.innerText`, sliced to **8000 chars**) as a fallback.
5. **`found` = `matches.length > 0`** (scraper.js:181). This is **the validation signal**: did entering this code on this bookie return selections? `found:true` ⇒ the code is real/valid and we scraped its legs; `found:false` ⇒ invalid/expired code, an anti-bot wall, or stale selectors.
6. **Screenshot before close** (scraper.js:171-173, `capture()` scraper.js:207-219): full-page PNG into `SHOT_DIR`, filename `${site}-${code}-${ts}.png` (sanitised, ≤60 chars). Never throws. `pruneOldShots()` deletes shots older than `SCREENSHOT_TTL_HOURS` (default 48h) so the disk doesn't fill. **Images/fonts are NOT blocked** in the current code (the README's "blocked for speed" note is aspirational) — shots are real full-page renders.
7. Page + context are always closed in `finally` (scraper.js:198-201).

**Return shape** (scraper.js:178-186): `{ site, code, found, matches, raw_text, count, screenshot }` (`screenshot` = bare filename; server turns it into `screenshot_url`).

Tuning env: `NAV_TIMEOUT_MS` (default 45000), `PUPPETEER_EXECUTABLE_PATH` (default `/usr/bin/chromium`), `SCREENSHOT_DIR` (default `./screenshots`), `SCREENSHOT_TTL_HOURS` (default 48).

---

## 4. Normalized output shape

**Scraper-level match** (one per selected leg), `matches[]`:
```
{ teams, league, market, pick, kickoff }   // all strings, "" when a field has no selector/text
```
Several bookies pack market+pick into one node ("1X2: W1"); leagues often carry a "NNNNNN. " id prefix; kickoff is often "".

**Top-level `/verify` success response:**
```
{ ok:true, site, code, found, matches:[…], raw_text, count, screenshot_url,
  // + Gemini fields when enabled & found (see §5):
  normalized:[…], totalOdds, summary }
```

**`/verify` failure response (still HTTP 200):**
```
{ ok:false, betting_site, booking_code, error, step, matches:[], raw_text:'', count:0, screenshot_url }
```

---

## 5. Optional Gemini normalisation (`normalize.js`)

Best-effort LLM post-processing that rewrites the messy, bookie-specific `matches`/`raw_text` into a clean machine-readable shape. **Entirely optional and non-blocking:**
- Enabled only when `GEMINI_API_KEY` is set (`normaliseEnabled()`), and only run when `result.found` is true (server.js:82). Any failure (no key, HTTP error, timeout, non-JSON) is caught and logged; **`/verify`'s base contract is untouched** (server.js:83-88).
- Single `fetch` to the Gemini REST API (`x-goog-api-key` header — key never in URL), `responseMimeType:'application/json'` + `responseSchema` to force strict JSON, `temperature:0` for determinism, `AbortController` timeout (`GEMINI_TIMEOUT_MS`, default 20000).
- Env: `GEMINI_API_KEY` (enable), `GEMINI_MODEL` (default `gemini-3.1-flash-lite`), `GEMINI_BASE_URL` (default Google Generative Language v1beta), `GEMINI_TIMEOUT_MS`.
- Adds to the response: `normalized[]` (per-leg `{teams,homeTeam,awayTeam,market(canonical 1X2|DC|OU|BTTS|DNB|AH|EH|CS|OTHER),marketLabel,pickSymbol(1/X/2/"Over 2.5"/Yes…),pickSide(home|away|draw|n/a),pickTeam,line,odds,kickoff(ISO-8601 +03:00 EAT),kickoffRaw,summary}`), `totalOdds`, `summary`.
- The long `SYSTEM_INSTRUCTION` encodes the team-side / market / pick-symbol / kickoff / odds rules (home=team1=symbol"1", away=team2=symbol"2", raw_text is source of truth over matches).

**Merge note:** `normalize.js` and the Gemini layer are dev/payments work that post-dates the README (README still describes the worker as raw-scrape-only). The `GEMINI_API_KEY` env is **missing from `bet-code-worker/.env.example`** (it lives in `.env.local.example:40`, root `docker-compose.yml:88` comment, and `docker-compose.prod.yml:64`). Minor doc gap — not a blocker, but worth noting so the worker's own `.env.example` gets the key documented post-merge.

---

## 6. Which betting sites it adapts (`adapters.js`)

`adapters` map keyed by normalised site slug. `getAdapter(site)` (adapters.js:201) lowercases + strips non-alnum, then maps aliases. `supportedSites()` returns display names.

| Adapter key | Display name | Strategy | Confidence |
|---|---|---|---|
| `1xbet` (alias `onexbet`) | 1xBet | type+submit; `expandSelector` `.coupon-loader-toggle`; `navigatesOnSubmit` | **confirmed** (code KSA6G) |
| `22bet` (alias `twentytwobet`) | 22Bet | type+submit | **confirmed** (code XLD6G) |
| `betpawa` (alias `pawa`) | betPawa | type+submit; handles single + combo legs; kebab-case data-test-ids | **confirmed 2026-06-19** (MZHM3IA, V8V72AV) |
| `betika` | Betika | **`codeUrl`** → `/en-ug/share/<code>` | **confirmed 2026-06-19** (KkxPBu) |
| `sportpesa` (alias `pesa`) | SportPesa | type+submit | **confirmed** (HXHWHV) |
| `mozzart` (alias `mozzartbet`) | MozzartBet | **`codeUrl`** → `/en/ticket-status-sport/<code>` | codeUrl confirmed; row selectors inferred |
| `sportybet` | SportyBet | **`codeUrl`** → `/ug/sport/load_code/<code>` | **UNVERIFIED** placeholder |
| `betway` | Betway | type+submit | **UNVERIFIED** placeholder |

Per-adapter keys: `name`, `url`, optional `codeUrl(code)`, `expandSelector`, `navigatesOnSubmit`, `inputSelector`, `submitSelector`, `waitFor`, `resultSelector`, `rowSelector`, `fields{teams,league,market,pick,kickoff}`. Comma-separated selectors are valid CSS lists (first match wins); empty-string fields are intentional (scraper skips them).

**Deliberately NOT supported** (adapters.js:186-198, documented): **Fortebet** (i-ticket numeric counter code, not loadable online) and **Championbet** (ticket-status needs code+PIN of a placed ticket). Omitted on purpose so `/verify` returns a clear "unsupported site" instead of silently failing.

---

## 7. How the web app calls the worker (the integration)

**Transport: HTTP, internal-network, behind a shared key.** The web app reaches the worker over plain HTTP at a URL from env — there is **no queue, no Redis** (a Redis-queue rearchitecture was built then reverted; do not reintroduce). Two shared secrets bind the services:
- `BET_CODE_WORKER_URL` (web) → e.g. `http://bet-code-worker:8080` (internal Docker DNS).
- `BET_CODE_WORKER_KEY` (web) **must equal** `WORKER_API_KEY` (worker) — sent as the `x-worker-key` header.

**Core bridge: `src/lib/verifyCode.ts`** (the single chokepoint; absent from main):
- `callWorker(betting_site, booking_code)` (verifyCode.ts:48-62): `POST {BET_CODE_WORKER_URL}/verify` with `x-worker-key`, body `{betting_site,booking_code}`, **`AbortSignal.timeout(90_000)`** (a scrape can take ~53s on invalid 1xBet codes). **Never throws** — returns a failed-shaped `WorkerResult` if `BET_CODE_WORKER_URL` is unset or the worker is unreachable.
- `recordVerification({betslip_id,betting_site,booking_code,result})` (verifyCode.ts:67-139): upserts into **`slip_verifications`** (one row per betslip, `onConflict:'betslip_id'`; manual no-id checks are `insert`ed). Persists `matches`, `normalized` (Gemini legs — secret), `summary`, `total_odds` (coerced to number), `raw_text`, `match_count`, `found`, `status` (`scraped`/`failed`), `error`, `screenshot_url`, `scraped_at`. Then **reflects onto `betslips`**:
  - `found && matches.length` → `verification_status='verified'`, sets public PROOF (`game_count`, `markets`, `leagues`, `earliest_kickoff`, `total_odds`) — derived from `normalized` when present, else raw matches. Never un-verifies.
  - worker ran but found nothing (`result.ok`, not found) → `db.rpc('record_failed_verify', {p_betslip_id})` — atomically counts the attempt + flips a still-`pending` slip to `failed`.
  - worker errored/unreachable → changes nothing, leaves slip `pending` for the poller to retry.
- `verifyAndRecord(betslip_id, betting_site, booking_code)` (verifyCode.ts:142-146): `callWorker` then `recordVerification`. **The single entry point all three callers use.**

**Three web callers of `verifyAndRecord`:**
1. **`POST /api/tips`** (auto-trigger, fire-and-forget) — when a tipster posts/updates a booking-code slip. (Caller lives in main-adjacent app code; the `verifyAndRecord` it calls is dev/payments.)
2. **`POST /api/slips/verify-code`** (`src/app/api/slips/verify-code/route.ts`, dev/payments-only) — **admin-only manual** re-verify. `requireRole('admin')` gate; zod `{betting_site, booking_code, betslip_id?}`; `503` if `BET_CODE_WORKER_URL` unset; returns `{ok,found,count,matches,raw_text,screenshot_url,error}`.
3. **`POST|GET /api/slips/sync-codes`** (`src/app/api/slips/sync-codes/route.ts`, dev/payments-only) — **the poller**. Auth header `x-sync-token: <SYNC_TOKEN>`. Reads pending coded slips from **`betslip_secrets`** (service-role-only; the overhaul moved `booking_code`/`betting_site` off `betslips`), joined to `betslips` filtered `result='pending' AND verification_status IN (pending,failed) AND verify_attempts < SYNC_MAX_FAILED_RETRIES` (default 5), `LIMIT SYNC_BATCH` (default 20). Loops `verifyAndRecord` per row. **Kill switch:** `SYNC_CODES_ENABLED='false'` short-circuits to `{ok:true,disabled:true}` — used in prod because the scraper is **blocked from datacenter IPs**, so prod runs code-sync from a local/residential-IP stack against the same DB. (`verify-code/route.ts` and `sync-codes/route.ts` reproduced in §2-3 of the route files above.)

**The `sync` container** (root `docker-compose.yml:98-117`): `curlimages/curl`, waits for `web` healthy, then every `SYNC_INTERVAL`s (default 300) curls `POST web:3000/api/slips/sync-codes` (with `x-sync-token`) **and** `POST web:3000/api/payments/reconcile`. It does **not** talk to the worker directly — it pokes the web app, which calls the worker.

Data flow:
```
tipster posts coded slip ─→ /api/tips ─┐
admin manual re-verify ─→ /api/slips/verify-code (requireRole admin) ─┤
sync container (every N s) ─→ /api/slips/sync-codes (x-sync-token) ────┤
                                                                       ▼
                                                          verifyAndRecord()  (src/lib/verifyCode.ts)
                                                                       │ callWorker(): POST /verify  x-worker-key
                                                                       ▼
                                          bet-code-worker :8080  (Express + Puppeteer + chromium)
                                            └ scrapeCode → adapters.js → bookie → matches[] + raw_text + found + screenshot
                                            └ normalize.js (Gemini, optional) → normalized[] + summary + totalOdds
                                                                       │ JSON
                                                                       ▼
                                          recordVerification(): upsert slip_verifications + reflect betslips (verified/failed proof)
```

---

## 8. Deploy / infra (preserve in merge)

- **`bet-code-worker/Dockerfile`:** `node:24-bookworm-slim` + Debian `chromium` + headless shared libs; `PUPPETEER_SKIP_DOWNLOAD=true`, `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`; runs as **non-root** `app` user; pre-creates `/app/screenshots` (chowned so a mounted volume is writable); `HEALTHCHECK` hits `/health`; `CMD node src/server.js`.
- **`bet-code-worker/docker-compose.yml`** (standalone) and the **worker + sync services in the root `docker-compose.yml`** (`bet-code-worker` at :8080 internal, hot-reload `./bet-code-worker/src` volume, `screenshots` named volume; `sync` curl loop). `docker-compose.prod.yml` wires `GEMINI_API_KEY`.
- **Env contract:** worker = `WORKER_API_KEY`, `PORT`(8080), `MAX_CONCURRENT`, `NAV_TIMEOUT_MS`, `SCREENSHOT_DIR`, `SCREENSHOT_TTL_HOURS`, `PUBLIC_BASE_URL`(opt), `PUPPETEER_EXECUTABLE_PATH`, `GEMINI_*`(opt). Web side = `BET_CODE_WORKER_URL`, `BET_CODE_WORKER_KEY`(=`WORKER_API_KEY`), `SYNC_TOKEN`, `SYNC_BATCH`, `SYNC_MAX_FAILED_RETRIES`, `SYNC_CODES_ENABLED`, `SYNC_INTERVAL`.
- **Verified working 2026-06-25** (per CLAUDE.md): live `/verify` 22Bet → `found=true` + Gemini normalize; 1xBet machinery works (~53s on invalid codes via `navigatesOnSubmit` timeout). Datacenter IPs blocked → prod sets `SYNC_CODES_ENABLED=false` and runs sync from a residential IP.

---

## 9. Merge checklist (additive — nothing on main collides)

KEEP, verbatim, all dev/payments-only:
- [ ] Whole `bet-code-worker/` dir (`src/{server,scraper,adapters,normalize}.js`, `package.json`, `package-lock.json`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`, `.dockerignore`).
- [ ] `src/lib/verifyCode.ts` (the bridge — `callWorker`/`recordVerification`/`verifyAndRecord`).
- [ ] `src/app/api/slips/verify-code/route.ts` and `src/app/api/slips/sync-codes/route.ts`.
- [ ] Root `docker-compose.yml` `bet-code-worker` + `sync` services and `screenshots` volume; `docker-compose.prod.yml` worker block (`GEMINI_API_KEY`).
- [ ] Worker/sync env keys in `.env.local.example` (incl. `GEMINI_API_KEY` line) and the worker's own `.env.example`.

DEPENDENCIES the worker integration assumes exist post-merge (owned by the auth/paywall overhaul, also dev/payments — verify they merge in too):
- `betslip_secrets` table (holds `booking_code`/`betting_site` for the sync poller — moved off `betslips`).
- `betslips` columns: `verification_status`, `verify_attempts`, `game_count`, `markets`, `leagues`, `earliest_kickoff`, `verified_at`, `total_odds`, `result`.
- `slip_verifications` columns: `normalized`, `summary`, `total_odds` (added beyond main's `0004` baseline).
- DB function `record_failed_verify(p_betslip_id)`.
- `requireRole('admin')` from `@/lib/auth/session` (used by `verify-code`).

POST-MERGE doc nit (non-blocking): add `GEMINI_API_KEY` to `bet-code-worker/.env.example`; README still describes the worker as raw-scrape-only (predates `normalize.js`).
