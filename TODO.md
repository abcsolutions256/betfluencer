# TODO — Betfluencer

Ordered by priority. Deadline reference: **11 June 2026** (ABC Solutions, payments-live milestone). Today is 10 June — tight, so P0 is "what makes a real shilling move correctly end to end."

Detail + file:line for everything below is in [`docs/IMPROVEMENTS.md`](docs/IMPROVEMENTS.md). ioTec flow spec in [`docs/PAYMENTS-IOTEC.md`](docs/PAYMENTS-IOTEC.md).

---

## P0 — launch blockers (payments must work + not lose money)

### Payments (the actual job) — DONE 2026-06-10 (real ioTec Pay)
- [x] **Disburse to the tipster** — `fulfillTransaction` pays `tipster.phone` (90%), fetched from the DB. Money bug fixed.
- [x] **Async flow** — `initiate` (collect) → `webhooks/iotec` / `status` poll (confirm) → `fulfillTransaction` (unlock + payout). No disburse before confirmation.
- [x] **Ledger rows** — `transactions` table tracks every collection + payout; pending `slip_purchases` created on initiate, flipped to `active` on success.
- [x] **DB-driven** — real slip price + tipster + phone from Postgres; no mock in the payment path.
- [x] **Buy UI** — `<PaymentSheet>` (bottom sheet, MoMo + Card) + `usePayment()` hook + `<BuySlipButton>`, wired into `BetslipFeed` and `slips`. Card returns to `/pay/return`.
- [x] **Webhook** — at `api/webhooks/iotec`; security-header check + **status refetch** (never trusts the payload); idempotent via `slip_purchases.status`.
- [x] **Reconcile / status poll** — `GET /api/payments/status` refetches from ioTec and fulfils on success, covering missed webhooks.
- [x] **Unlock check on read** (2026-06-10) — `/api/slips` + `/api/tipster/[slug]/slips` strip `booking_code`/`betting_site`/`slip_image_url`/`note` for pending slips unless `?buyer=` (phone/email) has an `active` purchase (`src/lib/entitlement.ts`). Client sends the paid identity (`bf_phone`) + refetches on unlock. *(Follow-up: tipster owner-view of own codes needs real tipster sessions.)*
- [ ] Apply `supabase/migrations/0002_transactions.sql` to the live DB + set `IOTEC_*` env before going live (works in **demo mode** now).
- [ ] Confirm ioTec's real callback header name + payload field names against the portal/docs.

### Security (don't ship these)
- [ ] **Admin auth is forgeable** — `base64("admin:…")` passes. Sign the token (HMAC with a server secret) or use a real session. Remove the hardcoded default password from `adminAuth.ts`. *(still open)*
- [x] **Webhook signature** — `webhooks/iotec` rejects when the callback security header doesn't match `IOTEC_WEBHOOK_SECRET` (skips only in demo) and re-verifies by refetching status.
- [x] **Webhook idempotency** — re-delivery is a no-op once `slip_purchases.status` is `active`.
- [x] **RLS hardened — paid-only code access** (2026-06-10, migration `0003` + `rls.sql`): anon can read only finished slips/legs; pending booking codes, purchases, financials, and `tipsters` (password_hash) are service-role-only; anon can't forge an `active` purchase. **Apply `0003` to the live DB.**
- [ ] **Buyer identity is unauthenticated** — the API trusts `?buyer=<phone|email>`. Someone who knows a paying buyer's phone could fetch their unlocked code. Full fix = buyer OTP/session.

### Schema ↔ code mismatch (causes silent failures)
- [x] **`tipster_stats` fixed** (2026-06-10) — wrong name for the `tipster_rankings` view; repointed `api/tipster` + `api/tipster/[slug]/stats`.
- [x] **Removed dead `subscriptions` + `tips` queries** from `db.ts` (per-slip model); `api/subscribe` GET now reads real `slip_purchases`.
- [x] **Schema synced to live DB** — added `betslips.betting_site`/`booking_code` + `platform_settings`, widened `posting_mode` check, nullable odds/legs.
- [ ] Confirm `payments`/`earnings` column names stay locked (earnings now uses `commission`, matches live).

---

## P1 — Supabase: models, migrations, auth (the explicit ask)
- [x] **Supabase CLI migrations adopted** (2026-06-10) — `supabase/config.toml` + `migrations/20260610000001_init.sql` + `..0002_transactions.sql`; npm scripts `db:push`/`db:new`/`db:reset`/`migrate`; see `supabase/README.md`. (Live DB: apply `0002` once — instructions in the README.)
- [ ] **Decide the auth model.** Today it's a hand-rolled phone+password with **three** competing hash schemes (SHA-256 in `auth.ts`, pgcrypto bcrypt in the seed, `bcryptjs` dep). Pick one:
  - Option A (fast): keep custom auth, standardise on `bcryptjs`, fix the seed, add real signed sessions (cookie/JWT) instead of returning bare `{id,name}`.
  - Option B (cleaner): move tipsters to **Supabase Auth** (phone OTP) and turn RLS on properly.
- [ ] **Real RLS.** Current policies are all `using(true)` = open; the only thing protecting data is that writes go through the service role. If the anon key ever touches a sensitive table, it's exposed. Tighten once auth model is set.
- [ ] **Fix `supabaseServer()`** — it hardcodes the project URL; read it from env so staging/prod don't cross wires.

## P1 — correctness / data
- [ ] `api/verify` calls `supabaseServer()` with no null guard — will throw if env missing. Guard it like `db.ts` does.
- [ ] Confirm the auto-tick trigger + `tipster_rankings` score logic against real data (wins×avg_odds can rank a 1-slip fluke above a steady tipster).

## P2 — cleanup / polish
- [x] **Removed Flutterwave + Africa's Talking remnants** (2026-06-10): pruned `flutterwave-node-v3`, `africastalking` + 5 other unused deps (`axios`, `bcryptjs`, `clsx`, `postgres`, `@supabase/ssr`); deleted `.d.ts` shims + unused `TipFeed.tsx` + dead `verifyIotecWebhook`; renamed webhook route `flutterwave`→`iotec`. *(Left: rename `payments.flw_ref`→`provider_ref` — needs a migration.)*
- [x] **Rewrote `README.md` + `.env.local.example`** to ioTec reality.
- [x] **Cleaned the junk files** from the index (`a`, `r.id`, `s.result`, `p.user_phone)).size`, `since28)`).
- [ ] **Implement `sendSMS`** (slip-unlocked + refund templates already exist) via Africa's Talking or ioTec messaging.
- [ ] Add a secret-free `.env.example` and confirm `.env` is gitignored (check it isn't tracked).

## Backlog (separate quote / later)
- [ ] **Bet-code verification worker** (Puppeteer posts codes to bookie sites) — fragile, its own discovery + price. Not in this milestone.
- [ ] Subscription expiry cron (only if a channel-subscription model is reintroduced — currently per-slip).
- [ ] Kenya (M-Pesa) / Tanzania expansion.
