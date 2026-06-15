# Betfluencer — Architecture & Infrastructure

How the app is built, how the pieces talk, and how it's deployed. Snapshot: 2026-06-12 (branch `dev/payments`/`dev/code`). For the working agreement + landmines see [`CLAUDE.md`](../CLAUDE.md); for the backlog see [`TODO.md`](../TODO.md).

---

## 1. What it is
A football **tipster marketplace** for Uganda. Tipsters post betslips (manual legs, a screenshot, or a bookie **booking code**). Finished slips (win/loss) are free to view; **pending slips are the paid product** — users pay per slip over **Mobile Money / Card** to unlock the picks. Platform takes **10%**, tipster gets **90%**, paid out per transaction (no funds held). Mobile-first PWA.

---

## 2. Runtime topology (3 services)
Everything runs from the root [`docker-compose.yml`](../docker-compose.yml).

```
                         ┌──────────────────────────────────────────────┐
   browser / PWA  ─────▶ │  web  (Next.js 14, :3000)                     │
                         │  - public pages, tipster + admin              │
                         │  - API routes (service-role DB access)        │
                         └───┬───────────────┬───────────────┬──────────┘
                             │ Postgres       │ HTTPS          │ HTTP (internal)
                             ▼                ▼                ▼
                     ┌──────────────┐  ┌────────────┐  ┌────────────────────────┐
                     │ Supabase     │  │ ioTec Pay  │  │ bet-code-worker (:8080) │
                     │ (Postgres)   │  │ MoMo+Card  │  │ headless Chrome scraper │
                     └──────────────┘  └────────────┘  └────────────────────────┘
                             ▲                                   ▲
                             │ POST /api/slips/sync-codes        │ /verify
                             │ (x-sync-token, every N s)         │
                         ┌───┴───────────┐                       │
                         │ sync (curl    │───────────────────────┘ (via web)
                         │ loop)         │
                         └───────────────┘
```

| Service | Image | Port | Role |
|---|---|---|---|
| **web** | `Dockerfile` (Next standalone, node:24) | 3000 (published) | The app: pages + API routes. Holds the Supabase **service-role** key + ioTec creds. |
| **bet-code-worker** | `bet-code-worker/Dockerfile` (node:24 + chromium) | 8080 (internal only) | Stateless Puppeteer API — loads a booking code on a bookie, scrapes matches, returns JSON + a debug screenshot. |
| **sync** | `curlimages/curl` | — | Loop: `POST web:3000/api/slips/sync-codes` every `SYNC_INTERVAL`s to keep coded slips fresh. |

Internal DNS: web → worker at `http://bet-code-worker:8080`; sync → web at `http://web:3000`. The worker is **not published** (private, behind `WORKER_API_KEY`). Screenshots persist in a named volume `screenshots:/app/screenshots` (served by the worker at `/shots`).

---

## 3. External services
- **Supabase** — Postgres only (no Supabase Auth). Accessed server-side via the **service-role key** (`supabaseServer()`), which **bypasses RLS**. The browser anon client exists but the app doesn't use it for data.
- **ioTec Pay** — Mobile Money (MTN/Airtel) + Card collections & disbursements. OAuth2 client-credentials (`id.iotec.io/connect/token`) → Bearer. Lib: `src/lib/iotec.ts`. Demo mode when `IOTEC_CLIENT_ID` is empty/`demo`.
- **Anthropic (Claude Vision)** — betslip screenshot → structured legs (`api/parse-slip`).
- **api-football** — auto-verify finished match results (`src/lib/footballApi.ts`, `api/verify` cron).
- **Africa's Talking** — SMS, configured but `sendSMS` is a stub that only logs.

---

## 4. Stack
Next.js 14.2.3 (App Router) · React 18 · TypeScript · Tailwind (inline styles + CSS vars). Supabase JS (service role). Worker: Node 24 + `puppeteer-core` + Debian chromium + Express. Money is **integer UGX** everywhere; phone normalised to `+256XXXXXXXXX`.

---

## 5. Data model (Postgres)
Migrations in [`supabase/migrations/`](../supabase/migrations/) (CLI: `npm run db:push`). Full reference in `src/lib/schema.sql`.

| Table | Purpose |
|---|---|
| `tipsters` | tipster accounts (phone + `password_hash`, verified tick, sport) |
| `betslips` | a slip: `posting_mode` (manual/screenshot/booking_code), `total_odds`, `result`, `slip_price`, `booking_code`, `betting_site` |
| `betslip_legs` | per-match legs of a manual slip |
| `slip_purchases` | a buyer's unlock of a slip (`user_phone` = normalised buyer identity, `status` pending→active) |
| `payments` | legacy ledger (superseded by `transactions`) |
| `earnings` | tipster earnings log |
| `transactions` | **ioTec ledger** — every collection + disbursement (`external_id`, `iotec_id`, status, method, amounts) |
| `slip_verifications` | bet-code worker results — `matches` jsonb, `raw_text`, `found`, `screenshot_url` (one current row per betslip, unique on `betslip_id`) |
| `platform_settings` | key/value config |
| `tipster_rankings` (view) | ranking = wins×avg-odds; powers home/rankings |

**RLS (migration `0003`):** anon can read only **finished** slips + their legs. Pending booking codes, purchases, financials (`payments`/`earnings`/`transactions`), and `tipsters` (password_hash) are **service-role-only**; anon can't read pending codes or forge a purchase. The app's service-role key bypasses RLS; the gate is the API.

---

## 6. Key flows

### 6.1 Reading slips (paid-content gating)
`GET /api/slips` and `GET /api/tipster/[slug]/slips` accept `?buyer=<phone|email>`. For **pending** slips, [`src/lib/entitlement.ts`](../src/lib/entitlement.ts) strips `booking_code`/`betting_site`/`slip_image_url`/`note` unless that buyer has an `active` `slip_purchases` row → returns `locked: true/false`. Finished slips are returned whole. Client sends `bf_phone` (stored on payment success) and refetches after a purchase; the UI uses the server `locked` flag as source of truth.

### 6.2 Payment (per-slip, ioTec)
```
BuySlipButton/usePayment → <PaymentSheet> (bottom sheet)
  → POST /api/payments/initiate
      → look up real slip + tipster from DB
      → INSERT transactions(pending) + slip_purchases(pending), link them
      → ioTec collect (MoMo prompt OR Card cardRedirectUrl)
  ← {transaction_id, external_id, status, card_redirect_url}
  → poll GET /api/payments/status?ext=…   (and/or)
  → POST /api/webhooks/iotec  (portal callback; verify x-iotec-callback-token + refetch status)
      → on success: fulfillTransaction()  (src/lib/fulfillment.ts)
           = mark slip_purchases active  +  disburse 90% to the TIPSTER's phone  +  logEarning   (idempotent)
```
Card payments return to `/pay/return`. Status/webhook both call the same idempotent `fulfillTransaction`. Files: `src/lib/iotec.ts`, `src/lib/transactions.ts`, `src/lib/fulfillment.ts`, `src/app/api/payments/*`, `src/app/api/webhooks/iotec`.

### 6.3 Booking-code verification + sync (keep slips current with bookies)
```
Tipster posts/updates a coded slip → POST /api/tips
   → verifyAndRecord()  (src/lib/verifyCode.ts, fire-and-forget)
        → POST bet-code-worker /verify { betting_site, booking_code }
             → Puppeteer loads the code on the bookie (adapters.js),
               scrapes matches[], raw_text, found, full-page screenshot
        → UPSERT slip_verifications (one current row per betslip)

sync container, every SYNC_INTERVAL:
   → POST /api/slips/sync-codes (x-sync-token)
        → re-verify pending coded slips (batch SYNC_BATCH) → upsert latest
```
Manual admin path: `POST /api/slips/verify-code` (admin token). Per-bookie selectors live in `bet-code-worker/src/adapters.js` (1xBet/22Bet/betPawa/SportPesa/MozzartBet HTML-confirmed; SportyBet/Betway unverified). The worker always returns `raw_text` + `screenshot_url` as debugging fallbacks.

### 6.4 Result auto-verification
`POST /api/verify` (Vercel-cron style, or call it): pulls pending manual slips whose matches have finished (api-football), updates `betslip_legs`/`betslips.result`. The DB auto-tick trigger updates tipster `verified`/`tick_type`.

---

## 7. Auth (current — weak, slated for overhaul)
- **Tipsters:** phone + password, hand-rolled (`src/lib/auth.ts` salted SHA-256). Login returns `{id,name,username}` — **no real session/token**. Three hash schemes have floated (SHA-256, pgcrypto bcrypt in seed, unused bcryptjs).
- **Admin:** single env password; token = `base64("admin:…")` — **forgeable** (`src/lib/adminAuth.ts`).
- **Buyers:** no accounts — identity is the phone/email used at purchase (so the `?buyer=` entitlement check trusts a presented phone). Full enforcement needs buyer OTP.

These are the main things to fix in the overhaul.

---

## 8. Infrastructure & deploy
- **Build:** `web` is a Next **standalone** image (`output:'standalone'`). `NEXT_PUBLIC_*` are inlined at build → passed as **build args** in compose; server secrets (service-role key, ioTec, worker url/key) are **runtime env**.
- **API routes that hit the DB must be dynamic** — `export const dynamic = 'force-dynamic'` (else `next build` prerenders them and `createClient` throws "supabaseKey is required" because secrets aren't build args). Applied to `api/slips` + `api/tipster`.
- **Ports:** web pins `PORT=3000` in compose `environment` (overrides any `PORT` in `.env`; the worker uses 8080). Don't put a shared `PORT` in `.env`.
- **Migrations to apply to the live DB before prod:** `0002` (transactions), `0003` (RLS lockdown), `0004` (slip_verifications). See [`supabase/README.md`](../supabase/README.md).
- **Hosting target:** Docker (Hetzner + Coolify / Railway). `vercel.json` is legacy — Vercel can't run the worker.
- **Env reference:** `.env.local.example` (web) + `bet-code-worker/.env.example` (worker). Shared secrets: `BET_CODE_WORKER_KEY` (= worker `WORKER_API_KEY`), `SYNC_TOKEN`.

Run the whole stack:
```bash
docker compose up --build         # web :3000 + worker (internal) + sync poller
```

---

## 9. Directory map
```
src/app/            pages (page · rankings · mine · channel/[slug] · slips · channels · advertise · about)
  tipster/          login · signup · dashboard
  admin/            dashboard (Transactions tab)
  pay/return/       card-payment return
  api/              payments/* · webhooks/iotec · slips · slips/verify-code · slips/sync-codes
                    tips · verify · parse-slip · tipster/* · admin/* · ads/*
src/lib/            iotec · transactions · fulfillment · verifyCode · entitlement · supabase · db
                    auth · adminAuth · footballApi · rateLimit · schema.sql · rls.sql
src/components/ui/  PaymentSheet · BuySlipButton · BetslipFeed · …
src/hooks/          usePayment · useNotifications
supabase/migrations/  0001 init · 0002 transactions · 0003 rls-lockdown · 0004 slip_verifications
bet-code-worker/    server.js · scraper.js · adapters.js · Dockerfile · docker-compose.yml
Dockerfile · docker-compose.yml      full stack
```

---

## 10. Notes for the overhaul
- The new building blocks now exist and are reusable: **payments** (ioTec lib + sheet + ledger), **server-side gating** (`entitlement.ts`), **code verification + sync** (`verifyCode.ts` + worker), **Docker stack**.
- Weakest current areas (expect to touch): auth/sessions (tipster + buyer), how verified `matches` surface in the UI (currently only stored in `slip_verifications`, not shown), and reconciling the "booking code" slip with its scraped legs.
- `payments` table + `flw_ref` are legacy (superseded by `transactions`).
