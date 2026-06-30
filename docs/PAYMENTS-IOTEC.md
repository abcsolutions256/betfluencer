# ioTec Pay — correct payment flow

Spec for wiring per-slip Mobile Money the right way. Replaces the synchronous mock flow in `api/subscribe`. Docs: https://pay.iotec.io/api-docs/index.html

## Principle
A MoMo collection is **asynchronous**. `collect` only sends the prompt; the money is confirmed later by a **webhook** (or by polling status). **Never disburse or unlock before the collection is confirmed.**

## Env (already in `.env`)
```
IOTEC_BASE_URL=https://pay.iotec.io
IOTEC_CLIENT_ID=...
IOTEC_CLIENT_SECRET=...
IOTEC_WALLET_ID=...
IOTEC_WEBHOOK_SECRET=...        # add — used to verify webhook signature
PLATFORM_COMMISSION=0.10
```
Demo mode: when `IOTEC_CLIENT_ID` is empty/`demo`, `payments.ts` returns instant success — keep for local dev, but the flow below must be correct for real keys.

## Flow
```
Buyer taps "Unlock — UGX X" on a pending slip
  └─ POST /api/subscribe { slip_id, user_phone, user_name }
       1. Look up slip + tipster from the DB (NOT mock). Get real price + tipster payout phone.
       2. ref = `slip-{slip_id}-{uuid}`   (unique, stored)
       3. INSERT slip_purchases (status='pending')   ← keyed by ref
          INSERT payments       (status='pending', provider_ref=ref, tipster_id, gross/commission/tipster split)
       4. collectPayment({ phone: user_phone, amount: price, ref })   ← sends MoMo prompt
       5. return { ref, status: 'pending' }   ← DO NOT disburse here

Buyer approves prompt on phone
  └─ ioTec → POST /api/webhooks/iotec   (signed)
       1. verify signature (reject if missing/invalid once secret is set)
       2. idempotency: if payment already 'confirmed', return 200 and stop
       3. on success:
            UPDATE payments SET status='confirmed'
            UPDATE slip_purchases SET status='active'          ← buyer is now unlocked
            disburseTipster({ phone: TIPSTER.phone, grossAmount, ref })   ← to the TIPSTER
            logEarning(...)
          on failure:
            UPDATE payments/slip_purchases SET status='failed'

Frontend
  └─ poll GET /api/subscribe/status?ref=...  until 'active' | 'failed'   (or check on next load)
       reveal slip picks when slip_purchases for (phone, slip) is 'active'
```

## Safety rules
1. **Disburse to the tipster's phone**, fetched from the DB — never `user_phone`.
2. **Disburse only after confirmation** (in the webhook / status handler), not in the collect request.
3. **Idempotent webhook** — same `ref` delivered twice must not double-unlock or double-pay. Guard on current `payments.status`.
4. **Idempotent disbursement** — use a stable per-payment reference (`{ref}-payout`) so a retry can't double-pay if ioTec already accepted it; check status before retrying.
5. **Refund on disburse failure** — after N failed disbursements, `refundUser` + mark `refunded` + SMS. (Already sketched in `subscribe/route.ts`; move it into the confirmation handler.)
6. **Reconcile** — a cron/sweep that calls `checkTransactionStatus` for `pending` payments older than a few minutes, in case a webhook is missed. ioTec demo `checkTransactionStatus` returns `success`.
7. **Verify the real webhook contract** — header name + payload field names. The current code guesses `x-iotec-signature` / `x-webhook-signature` and fields `{reference,status,transactionId,amount,phone}`. Confirm against the ioTec dashboard/docs before launch.

## Unlock check (reading a paid slip)
A pending slip's picks must only be returned to a buyer with an `active` `slip_purchases` row for that `(slip_id, user_phone)`. Public/finished slips (win/loss) stay free. Enforce in the API, not the client.

## DB note
Rename `payments.flw_ref` → `payments.provider_ref` (Flutterwave leftover). Add a unique index on it for idempotent webhook lookups.

## What to delete from the current code
- The synchronous disburse block in `subscribe/route.ts` (move to webhook).
- Mock tipster/slip resolution in the buy path.
- `verifyIotecWebhook` in `payments.ts` (dead — the route does the real check).
