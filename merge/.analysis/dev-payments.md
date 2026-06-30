# dev/payments — ioTec LIVE PAYMENTS (provenance for additive merge)

Branch under analysis: `stag` (== `dev/payments`). dev/payments OWNS the entire payments
stack. `main` has NO ioTec code — it still carries the OLD Flutterwave + Africa's Talking
stack that dev/payments deleted/replaced. **On merge, dev/payments must WIN for every file
below; none of main's payment files may resurrect.**

---

## 1. Files owned by dev/payments (preserve fully)

Core lib
- `src/lib/iotec.ts` (281 ln) — ioTec Pay v1 client (OAuth2, collect/status/disburse/wallet, SMS templates, demo mode).
- `src/lib/payments.ts` (1 ln) — barrel: `export * from './iotec'`. (Replaces main's big Flutterwave `payments.ts`.)
- `src/lib/transactions.ts` (90 ln) — `transactions` table data layer (CRUD + lookups).
- `src/lib/fulfillment.ts` (119 ln) — post-success: unlock purchase + pay tipster + log earning.
- `src/types/payments.ts` (84 ln) — shared payment contract + status normaliser.

API routes
- `src/app/api/payments/initiate/route.ts` (139 ln) — POST: start a guest per-slip purchase.
- `src/app/api/payments/status/route.ts` (56 ln) — GET: poll/refresh + fulfil-on-success.
- `src/app/api/payments/reconcile/route.ts` (72 ln) — POST/GET: sync-token cron sweep of stranded collections.
- `src/app/api/webhooks/iotec/route.ts` (71 ln) — POST: ioTec callback (auth → refetch → fulfil).
- `src/app/api/slips/[id]/reveal/route.ts` (62 ln) — GET: the paywall unlock (gated content).
- `src/app/api/subscribe/route.ts` (working tree) — now ONLY a GET "my purchases" list (the
  legacy POST collect/disburse body described in docs is GONE). Keep dev/payments version.

Frontend
- `src/hooks/usePayment.ts` (71 ln) — promise-based driver for one shared PaymentSheet.
- `src/components/ui/PaymentSheet.tsx` (411 ln) — bottom-sheet form + poll + states.
- `src/components/ui/BuySlipButton.tsx` (60 ln) — "Unlock — UGX X" button.
- `src/components/ui/SlipReveal.tsx` (91 ln) — renders unlocked content from /reveal.
- `src/app/pay/return/page.tsx` (66 ln) — card-flow PegPay return page (polls status).
- `src/lib/guestId.ts` — anonymous buyer identity (`bf_guest` localStorage → `x-buyer-key`).

Docs
- `docs/PAYMENTS-IOTEC.md` (65 ln) — spec. NOTE: doc is aspirational/older (references
  `/api/subscribe` POST, `payments` table, `provider_ref`, signature headers) and does NOT
  match the shipped code (which uses `/api/payments/*`, `transactions` table, demo short-circuit,
  shared callback token). Treat code as source of truth, not the doc.

Migrations (formal, dev/payments owns `supabase/migrations/*`)
- `20260610000002_transactions.sql` — creates `transactions` + indexes + `set_updated_at` trigger;
  loosens `slip_purchases.status` check to `('pending','active','refunded')` default `'pending'`.
- `20260623090000_fix_slip_purchases_buyer.sql` — `buyer_id` + `uniq_purchase_betslip_buyer`.
- `20260623100000_guest_buyer_key.sql` — `buyer_key` column + `idx_slip_purchases_buyer_key`
  + `uniq_purchase_betslip_buyerkey (betslip_id, buyer_key)`.
- (`slip_purchases` base table from `20260610000001_init.sql`; `earnings`/`payments`/`platform_settings` there too.)

---

## 2. Deleted on dev/payments (must NOT come back from main)

Confirmed present in `main` tree, ABSENT from dev/payments working tree:
- `main:src/app/api/webhooks/flutterwave/route.ts`  → replaced by `webhooks/iotec`.
- `main:src/types/flutterwave.d.ts`                  → gone.
- `main:src/types/africastalking.d.ts`              → gone (AT SMS provider dropped; see `sendSMS` stub in iotec.ts).
- main's old `src/app/api/subscribe/route.ts` (synchronous mock collect/disburse) → replaced by GET-only purchases list.
- main's `src/lib/payments.ts` (Flutterwave client) → replaced by 1-line barrel re-exporting iotec.
- `payments.flw_ref` column lingers in `init.sql` `payments` table (Flutterwave leftover); the
  `payments` table itself is now UNUSED by dev/payments (the `transactions` table superseded it).
  Only `flutterwave`/`flw` ref remaining in dev/payments tree is inside `src/lib/schema.sql`
  (main's schema baseline) — a merge-conflict hotspot.

Other main-only API files unrelated to payments but absent from this tree (admin/login,
admin/pending-slips, admin/settle, tipster/auth, apitest, fixturetest, verify-debug,
adminAuth.ts) — flagged for the auth/admin analysts, not this area; noting so they are not
mistaken as payment deletions.

---

## 3. The ioTec client (`src/lib/iotec.ts`)

- **Auth**: OAuth2 `client_credentials` against `IOTEC_AUTH_URL` (default `https://id.iotec.io/connect/token`).
  Token cached in module scope (`cachedToken`/`tokenExpiry`), refreshed when within 60s of expiry.
- **apiFetch**: Bearer token on every call to `IOTEC_BASE_URL` (default `https://pay.iotec.io`);
  parses JSON defensively; NEVER throws (network errors → `{ok:false,status:0}`).
- **Demo mode**: `isDemoMode()` true when `IOTEC_CLIENT_ID` empty or `=== 'demo'`. Every network
  call short-circuits to deterministic success (`collect`→`Pending`, status→`Success`, disburse→`Success`).
- **collect(args)** → `POST /api/collections/collect`. Body fields: `category` (default `MobileMoney`),
  `currency: env('IOTEC_CURRECY')` [NOTE: env key is misspelled **IOTEC_CURRECY**, no "N"],
  `walletId: env('IOTEC_WALLET_ID')`, `externalId`, `payer`, `payerName`, `payerNote`, `amount`,
  `transactionChargesCategory: 'ChargeWallet'`, `redirectUrl`. Returns `{id, status, statusMessage, cardRedirectUrl, raw}`.
- **getCollectionStatus(requestId)** → `GET /api/collections/status/:id`.
- **getCollectionByExternalId(externalId)** → `GET /api/collections/external-id/:extId`.
- **disburse(args)** → `POST /api/disbursements/disburse` (category MobileMoney, currency hardcoded `UGX`,
  walletId, externalId, payee, payeeName, amount, note carried as `payerNote`).
- **getDisbursementStatus(txnId)** → `GET /api/disbursements/status/:id`.
- **getWalletBalance()** → `GET /api/wallet-balance/:walletId`.
- **sendSMS / smsTemplates** — stub that only `console.log`s (real SMS provider not wired; AT removed).

---

## 4. The full live flow

INITIATE — `POST /api/payments/initiate`
1. Rate-limit (`rateLimit('payments', ip)`), require non-empty `x-buyer-key` header (guest id).
2. Zod-validate `{betslip_id, method('momo'|'card'), payer, payer_name?}`.
3. Load betslip (`slip_price, tipster_id, result, verification_status`).
   - 404 if missing; reject if `verification_status !== 'verified'`; reject if `result !== 'pending'`
     (settled slips are free to view).
4. Load tipster; enforce `amount >= MIN_AMOUNT_UGX (500)`.
5. Already-owned guard: `slip_purchases` for `(betslip_id, buyer_key)` with `status='active'` → 409.
6. Resolve payer: momo → `normalisePhone(payer)` (stored as `+256…`, ioTec payer = digits w/o `+`);
   card → must be a valid email (payer = email).
7. `external_id = 'bf-' + base36(now) + '-' + rand6`.
8. `createTransaction({external_id, amount, method, category:'MobileMoney', purpose:'slip_purchase',
   betslip_id, tipster_id, user_phone, user_email, payer, status:'pending'})`.
9. Record pending purchase BEFORE charging (explicit lookup → insert/update on
   `(betslip_id, buyer_key)`, per-step error reporting via `abort()`; on failure marks txn `failed`).
   Fields: `tipster_id, user_phone(=phone|email|payer), user_name, amount_paid, status:'pending'`.
10. Link txn → purchase (`updateTransaction(txn.id, {slip_purchase_id})`).
11. `collect({…, redirectUrl: ${NEXT_PUBLIC_APP_URL}/pay/return?ext=external_id})`.
12. On `!ok` → txn `failed` + return `{status:'failed', message}`. On ok → update txn with
    `iotec_id`, normalised `status`, `iotec_status`, `card_redirect_url`, `status_message`, `raw`;
    return `PaymentResult {transaction_id, external_id, status, card_redirect_url, message}`.

STATUS — `GET /api/payments/status?ext=|id=`
- Resolve txn by external_id then id. If non-terminal, refetch from ioTec
  (`getCollectionStatus(iotec_id)` else `getCollectionByExternalId`), update row, and on FIRST
  `success` call `fulfillTransaction(txn)`. Returns normalized status snapshot.

WEBHOOK — `POST /api/webhooks/iotec`
- Auth: if `IOTEC_WEBHOOK_SECRET` set, require it via `x-iotec-callback-token` header OR
  `Authorization: Bearer`. No secret → skipped (demo/sandbox).
- Parse `{id, externalId, status}` — body is NOT trusted. Find txn by ioTec id then externalId
  (unknown txn → `200 {received:true}` so ioTec stops retrying).
- Re-verify by `getCollectionStatus(id)`; authoritative = refetch status else posted status.
  Update txn; on `success` → `fulfillTransaction`. Always `200` except unexpected error → `500`
  (so ioTec retries).

RECONCILE — `POST|GET /api/payments/reconcile` (driven by the `sync` container)
- Auth: `x-sync-token === SYNC_TOKEN` (same token as slips/sync-codes) else 401.
- Selects `type='collection'`, status in `('pending','processing')`, `created_at` between
  now-48h and now-60s (skip fresh to avoid racing the client poll; skip stale ioTec finalised),
  `limit RECONCILE_BATCH (default 25)`. For each: refetch, update if changed, fulfil on success.
  Returns `{ok, checked, updated, fulfilled}`. ← Safety net for buyers who close the tab.

FULFILLMENT — `fulfillTransaction(txn)` (idempotent; never throws)
1. Only runs when `txn.status==='success'`.
2. Idempotency: if linked `slip_purchase_id` is already `status='active'` → no-op return.
3. Unlock buyer: `slip_purchases SET status='active'` for `slip_purchase_id`.
4. Pay tipster (wrapped in try so payout failure never bubbles):
   - rate = tipster.`commission_rate` override → `platform_settings.platform_commission` →
     `process.env.PLATFORM_COMMISSION` → `'0.10'`.
   - `commission = round(amount*rate)`, `tipsterAmount = amount - commission`,
     payee = `tipster.phone` with `+` stripped.
   - `createTransaction(type:'disbursement', external_id: ${txn.external_id}-payout, method:'momo',
     purpose:'tipster_payout', status:'pending')`.
   - `disburse(...)`; reconcile that payout txn with `iotec_id` + normalised status/raw.
   - `logEarning({tipster_id, amount:tipsterAmount, gross:amount, commission, plan:'slip', user_phone})`
     — recorded regardless of payout transport outcome.

REVEAL (paywall) — `GET /api/slips/[id]/reveal`
- Finished slips (`result` win/loss) → content free to anyone.
- Pending slips → returned ONLY if: buyer has an `active` `slip_purchases` row for
  `(betslip_id, buyer_key)` (via `x-buyer-key` header / `?buyer=`), OR the logged-in owning tipster
  (`getSessionUser()` + `tipsters.profile_id === user.id`). Else `403 Not purchased`.
- Content joined service-role from `betslip_secrets` (booking_code, betting_site, slip_image_url),
  `betslip_legs`, `slip_verifications` (matches, raw_text, normalized, summary, total_odds).

---

## 5. Paywall / guest-buyer model

- Buyers do NOT log in. Identity = random `bf_guest` UUID in localStorage → sent as `x-buyer-key`
  (`src/lib/guestId.ts buyerHeader()`).
- Purchases keyed on `(betslip_id, buyer_key)` (unique index `uniq_purchase_betslip_buyerkey`).
- LIMITATION (documented in code): localStorage is per-browser — purchases don't follow a buyer
  across devices; clearing site data loses access.
- `buyer_id` (auth.users) column retained nullable for legacy logged-in purchases.
- Client also stores `bf_phone` on success (PaymentSheet.tsx:163) — comment references an
  `entitlement.ts`, but reveal gates on `buyer_key`, not phone (the phone is incidental).

---

## 6. Tables / columns this area owns or touches

`transactions` (NEW, migration 0002) — id, iotec_id (unique), external_id (unique, our ref),
type(collection|disbursement), method(momo|card), category, purpose, betslip_id, tipster_id,
slip_purchase_id, user_phone, user_email, payer, amount(int UGX), currency, status
(pending|processing|success|failed|cancelled), iotec_status, status_message, card_redirect_url,
transaction_charge, raw(jsonb), created_at, updated_at(trigger). RLS `transactions_service_only USING(true)`.

`slip_purchases` (init + 0002 + 0008 + 0009) — id, betslip_id, tipster_id, user_phone, user_name,
amount_paid, status(pending|active|refunded, default pending), purchased_at, buyer_id(nullable),
**buyer_key** (guest id). Unique on (betslip_id, buyer_key) AND (betslip_id, buyer_id).

`earnings` (init) — written by `logEarning`: tipster_id, betslip_id?, amount, gross, commission,
plan, user_phone, created_at.

`platform_settings` (init) — key/value; reads `platform_commission`.

`tipsters` — reads `name, phone, commission_rate, profile_id, username`.

`betslips` — reads `slip_price, tipster_id, result, verification_status, total_odds, game_count`.

`betslip_secrets` / `betslip_legs` / `slip_verifications` — read by reveal (service-role).

LEGACY/UNUSED by dev/payments: `payments` table (init) still has `flw_ref` (Flutterwave) — the
`transactions` table replaced it. Mark for cleanup but harmless to keep.

---

## 7. Env keys (NAMES ONLY)

IOTEC_AUTH_URL, IOTEC_BASE_URL, IOTEC_CLIENT_ID, IOTEC_CLIENT_SECRET, IOTEC_WALLET_ID,
**IOTEC_CURRECY** (sic — misspelled, used as the collect currency), IOTEC_WEBHOOK_SECRET,
NEXT_PUBLIC_APP_URL, PLATFORM_COMMISSION, RECONCILE_BATCH, SYNC_TOKEN.

---

## 8. Merge risks / bugs

- **Conflict hotspot**: `src/lib/schema.sql` (main baseline) still contains Flutterwave + `flw`
  references and likely an older `slip_purchases`/no-`transactions` shape. dev/payments relies on
  `supabase/migrations/*` (authoritative). Reconcile so `transactions` + `buyer_key` survive and the
  Flutterwave columns/types don't reintroduce dead code.
- **Do not let main resurrect** `webhooks/flutterwave/route.ts`, `types/flutterwave.d.ts`,
  `types/africastalking.d.ts`, the old `payments.ts`, or the old `subscribe` POST body.
- **Bug (pre-existing, low)**: `listTransactions` paginates with `.range(offset+1, offset+limit-1)`
  (transactions.ts:86) — off-by-one drops the first row and shortens the page. Admin-only listing.
- **Bug (low)**: `IOTEC_CURRECY` env misspelling — must be set with the same typo or collect sends
  empty currency; verify `.env` matches.
- **Doc drift**: `docs/PAYMENTS-IOTEC.md` describes `/api/subscribe`, `payments` table, `provider_ref`,
  and signature-header verification that the shipped code does NOT implement (code uses shared
  callback token + refetch). Update doc or treat code as truth post-merge.
- **Reconcile depends on the `sync` service + SYNC_TOKEN** (shared with slips/sync-codes) — ensure the
  sync container config is merged so stranded payments still get swept.
