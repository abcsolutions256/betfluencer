# bet-code-worker

Headless-Chrome microservice. Given a bookie **betting site** + **booking code**, it loads the code on that bookie and scrapes the **selected matches**, returning them as JSON so Betfluencer can verify what a slip actually contains.

Separate from the Next.js app on purpose — it needs a real browser (Puppeteer + Chromium), which Vercel can't run. Deploy it on Docker (Hetzner + Coolify, Railway, Fly, etc.).

## API
`POST /verify` — header `x-worker-key: <WORKER_API_KEY>`
```jsonc
// request
{ "betting_site": "SportyBet", "booking_code": "ABC123" }

// response
{
  "ok": true,
  "site": "SportyBet",
  "code": "ABC123",
  "matches": [
    { "teams": "Arsenal vs Chelsea", "league": "Premier League", "market": "1X2", "pick": "Arsenal", "kickoff": "Sat 18:30" }
  ],
  "raw_text": "…full text of the selections section (always returned as a fallback)…",
  "count": 1
}
```
On failure it still returns `200` with `{ ok:false, error, matches:[], raw_text:"" }` so the caller can record a failed attempt.

`GET /health` → `{ ok, active, sites }`.

## Run locally
```bash
cp .env.example .env
npm install
# local Chromium (mac): brew install chromium → set PUPPETEER_EXECUTABLE_PATH
npm run dev
curl -s localhost:8080/verify -H 'content-type: application/json' \
  -H "x-worker-key: $WORKER_API_KEY" \
  -d '{"betting_site":"SportyBet","booking_code":"ABC123"}' | jq
```

## Docker
```bash
docker build -t bet-code-worker .
docker run -p 8080:8080 -e WORKER_API_KEY=secret bet-code-worker
```

## How the Next app uses it
`POST /api/slips/verify-code` (admin-only) in the main app calls this worker, then writes the result to the `slip_verifications` table (migration `0004`). Set in the app's env:
```
BET_CODE_WORKER_URL=http://bet-code-worker:8080
BET_CODE_WORKER_KEY=<same as WORKER_API_KEY>
```

## Adding / fixing a bookie  ⚠️ important
Site configs live in [`src/adapters.js`](src/adapters.js). **1xBet, 22Bet, betPawa, SportPesa and MozzartBet** were built from real loaded-betslip HTML (selectors confirmed). **SportyBet and Betway** are still unverified placeholders. Bookie pages change often and most use anti-bot measures (Cloudflare, JS challenges, geo-blocks), so before trusting any adapter:
1. Open the bookie, load a real code, and inspect the DOM.
2. Set `codeUrl(code)` if the site has a direct "load code" URL (best — least fragile), otherwise `inputSelector` + `submitSelector`.
3. Set `resultSelector` (the selections container), `rowSelector`, and the per-`fields` selectors.

`raw_text` is always returned even when row parsing yields nothing, so a human (or an LLM step) can still verify from the section text while selectors are being tuned.

## Debug screenshots
Before it closes each page, the scraper saves a **full-page screenshot** — on success *and* failure — and the API returns it as `screenshot_url`. Open that URL to see exactly what Chrome saw; invaluable when an adapter's selectors are wrong or a bookie throws an anti-bot wall.
- Saved to `SCREENSHOT_DIR` (default `./screenshots`), served at `/shots/<file>`.
- Auto-pruned after `SCREENSHOT_TTL_HOURS` (default 48) so the disk doesn't fill.
- Behind a TLS proxy, set `PUBLIC_BASE_URL` (e.g. `https://worker.example.com`) so links are absolute + https.
- Persist across restarts by mounting a volume at `/app/screenshots`.
- Note: images/fonts are blocked for speed, so shots show layout + text (enough for selector debugging), not media.

## Caveats
- **Respect each bookie's Terms of Service** and local law before scraping in production. This is inherently fragile — treat broken adapters as expected maintenance.
- Runs Chrome with `--no-sandbox` (required in most containers). Keep the service on a private network / behind the API key; do not expose it publicly.
- One shared browser, capped at `MAX_CONCURRENT` scrapes. Scale by running more replicas behind a load balancer.
