# CLAUDE.md — Betfluencer (Bet Influence)

Guide for Claude Code / any agent working in this repo. Read this first. Full system + infra walkthrough in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); backlog in [`TODO.md`](TODO.md).

## What this is
Football **tipster marketplace** for Uganda. Tipsters post betslips; users **pay per slip** over Mobile Money to unlock the picks. Finished slips (win/loss) are free to view; pending slips are the paid product. Mobile-first PWA. Client is **ABC Solutions** (Abdallah Kambugu). Sister product **Visit Africa** (travel site, SEO work) is a separate repo.

Business model: **pay-per-slip**, not subscriptions. Platform takes **10%** commission at transaction time, tipster gets 90%. No funds held — collect from buyer, disburse to tipster, refund if disbursement fails.

## Stack
- **Next.js 14.2.3** App Router + **React 18** + **TypeScript** + **Tailwind** (inline styles + CSS vars in `globals.css`).
- **Supabase = Postgres only** (accessed via `@supabase/supabase-js` service-role key). **Not** using Supabase Auth.
- **ioTec Pay** — Mobile Money (MTN + Airtel UG), collections + disbursements. Lib: `src/lib/payments.ts`.
- **Anthropic SDK** — betslip screenshot parsing (`@anthropic-ai/sdk`, `api/parse-slip`).
- **api-football** — auto-verify match results (`src/lib/footballApi.ts`, `api/verify` cron).
- **Africa's Talking** — SMS (configured in `.env`, but `sendSMS` is currently a stub that only logs).
- Host: **Vercel** (`vercel.json`, cron). Note: the brain plan was Hetzner + Coolify — confirm target before deploy.

## Commands
```bash
npm run dev      # local dev → http://localhost:3000
npm run build    # production build
npm run start    # serve build
npm run lint     # eslint (next lint)
```
No test setup yet.

## Database
No Supabase CLI / `supabase/` migrations dir. Schema is two raw SQL files run by hand in the Supabase SQL editor:
- `src/lib/schema.sql` — tables, indexes, auto-tick trigger, `tipster_rankings` view, seed data.
- `src/lib/rls.sql` — RLS policies (currently all `using(true)` — effectively open; the API is the real gate via the service-role key).

**Tables defined:** `tipsters`, `betslips`, `betslip_legs`, `slip_purchases`, `payments`, `earnings`, `platform_settings`. View: `tipster_rankings`. `schema.sql` matches the live DB as of 2026-06-10 (incl. `betslips.betting_site` / `booking_code`).

Note: the dead `subscriptions` / `tips` queries were removed (per-slip model); `tipster_stats` was a wrong name for the `tipster_rankings` view — now fixed.

## Layout
- `src/app/page.tsx` channels home · `rankings` · `mine` (phone lookup) · `channel/[slug]` (tipster profile, read-only) · `channels` · `advertise` · `about` · `admin`.
- `src/app/tipster/` — `login`, `signup`, `dashboard`, `page`.
- `src/app/api/` — `payments/initiate` + `payments/status` (ioTec buy + poll), `webhooks/iotec` (confirm), `admin/transactions`, `subscribe` (GET purchases only), `tips`, `verify`, `parse-slip`, `tipster/*`, `admin/*`, `ads/*`.
- `src/lib/` — `iotec.ts` (ioTec client), `transactions.ts` (transactions CRUD), `fulfillment.ts` (unlock + payout), `supabase.ts`, `db.ts` (queries + mock fallback), `payments.ts` (re-exports iotec), `auth.ts` (tipster pwd), `adminAuth.ts`, `footballApi.ts`, `mockData.ts`, `rateLimit.ts`.
- `src/types/` — `index.ts`, `betslip.ts`, `ads.ts` + `.d.ts` shims.

## Conventions
- API routes: `NextResponse.json`, **zod** `safeParse` on input, `rateLimit(name, ip)` at the top of mutating routes.
- DB access only server-side via `supabaseServer()` (service role). Browser uses the anon client (`supabase`).
- `db.ts` pattern: `const db = supabaseServer(); if (!db) return MOCK…` — the mock fallback is how it runs with no DB.
- Money is **integer UGX** everywhere (no decimals). Phone normalised to `+256XXXXXXXXX` (`normalisePhone`).
- Commission = `PLATFORM_COMMISSION` env (default `0.10`).
- **API routes that touch the DB must `export const dynamic = 'force-dynamic'`** — otherwise `next build` prerenders them and `supabaseServer()` runs with no service key (secrets aren't build args) → "supabaseKey is required" (fails the Docker build). Done for `api/slips` + `api/tipster`.
- **Docker:** `web` pins `PORT=3000` in compose `environment` (the worker uses 8080; a shared `PORT` in `.env` would leak in via `env_file`). `NEXT_PUBLIC_*` are build args; server secrets are runtime env.

## Payments (ioTec Pay — implemented 2026-06-10)
- **Client:** `src/lib/iotec.ts` — OAuth2 via `id.iotec.io/connect/token` → Bearer; `collect`/`getCollectionStatus`/`disburse`/`getWalletBalance`; **demo mode** when `IOTEC_CLIENT_ID` is empty/`demo` (no real charges, polling resolves to success).
- **Flow:** buy button → `POST /api/payments/initiate` (creates pending `transactions` + `slip_purchases`, calls ioTec collect — MoMo = phone prompt, Card = `card_redirect_url`) → confirm via `POST /api/webhooks/iotec` (security-header check **+ status refetch**, never trusts the payload) or `GET /api/payments/status` polling → `fulfillTransaction` unlocks the purchase, disburses 90% to the **tipster's** phone, logs the earning (idempotent on `slip_purchases.status`).
- **UI:** `usePayment()` hook + `<PaymentSheet>` (bottom sheet that persists until terminal) + `<BuySlipButton>`; wired into `BetslipFeed` and `slips`. Card payments return to `/pay/return`.
- **Ledger:** every collection + payout is a row in `transactions`; admin → **Transactions** tab.
- **Before production:** apply `supabase/migrations/20260610000002_transactions.sql` to the live DB and set `IOTEC_*` env (incl. `IOTEC_AUTH_URL`, `IOTEC_WEBHOOK_SECRET` = the callback security header configured in the ioTec portal).

## Bet-code verification worker (built 2026-06-10)
Separate Dockerized service in [`bet-code-worker/`](bet-code-worker/) — Vercel can't run headless Chrome. It's a **stateless** Puppeteer API: `POST /verify { betting_site, booking_code }` → loads the code on the bookie → returns selected `matches[]` + `raw_text` + `found` + a debug `screenshot_url`. Selectors for 1xBet/22Bet/betPawa/SportPesa/MozzartBet are HTML-confirmed (`src/adapters.js`); SportyBet/Betway unverified. Env: `BET_CODE_WORKER_URL` + `BET_CODE_WORKER_KEY`. Keep it on a private network behind the key.

**Auto-sync (2026-06-12):** posting/updating a booking-code slip (`/api/tips`) fires `verifyAndRecord` ([`src/lib/verifyCode.ts`](src/lib/verifyCode.ts)) → worker → upserts `slip_verifications` (one current row per betslip, unique on `betslip_id`). The `sync` container polls `POST /api/slips/sync-codes` (header `x-sync-token: SYNC_TOKEN`) every `SYNC_INTERVAL`s to keep pending coded slips current with the bookies.

**Full stack:** root [`docker-compose.yml`](docker-compose.yml) runs `web` + `bet-code-worker` + `sync`. The web image is a Next **standalone** build (`output:'standalone'`, [`Dockerfile`](Dockerfile)); `NEXT_PUBLIC_*` are build args, server secrets are runtime env. `docker compose up --build`.

## Known landmines (still open — read before touching auth)
Full detail in [`docs/IMPROVEMENTS.md`](docs/IMPROVEMENTS.md). The old buy-flow bugs (disburse-to-buyer, mock data, no UI, unsigned webhook) were fixed in the ioTec rebuild above. Remaining:
1. **Admin token is forgeable** — `base64("admin:…")` passes `isValidAdminToken`; default password hardcoded in `adminAuth.ts`. (P0)
2. **Password scheme mismatch** — `auth.ts` uses salted SHA-256; seed rows use pgcrypto bcrypt. Pick one.
3. **Hardcoded Supabase project URL** in `supabaseServer()` — ignores `NEXT_PUBLIC_SUPABASE_URL`.
4. **RLS hardened 2026-06-10** (migration `0003` + `rls.sql`): anon can read only finished slips + their legs; pending booking codes, purchases, payments, earnings, transactions, and `tipsters` (password_hash) are service-role-only, and anon can't forge a purchase. **Apply `0003` to the live DB** — until then the public anon key can read pending codes directly. Never reintroduce `using(true)` policies.
5. **Unlock check — done 2026-06-10:** the slip-list APIs (`/api/slips`, `/api/tipster/[slug]/slips`) strip `booking_code`/`betting_site`/`slip_image_url`/`note` from **pending** slips unless the caller's `?buyer=` (phone/email) has an `active` `slip_purchases` row (`src/lib/entitlement.ts`). The tipster dashboard shows its own pending codes as "hidden until sold" — a tipster can't yet be securely told apart from a buyer (needs real tipster sessions). Still open: tipster owner-view.
6. Legacy `payments` table + `flw_ref` column are superseded by `transactions` — leave or drop later.

## Don't
- `.env` is the source of truth for live keys; `README.md` + `.env.local.example` are now aligned to ioTec (fixed 2026-06-10).
- Don't add new tables in code without adding them to `schema.sql` (it now mirrors the live DB — keep it that way).
- The accidental junk paths (`a`, `r.id`, `s.result`, …) were removed from the index 2026-06-10 — don't let them creep back.
