# Betfluencer — Code Review & Improvement Report

Date: 2026-06-10 · Reviewer: Paul · Scope: full repo on branch `dev/payments`.

This is the detailed findings behind [`TODO.md`](../TODO.md). Each item: where it is, why it matters, the fix. Severity: 🔴 blocker · 🟠 high · 🟡 medium · ⚪ cleanup.

---

## 1. What the app is
Football tipster marketplace, Uganda. Pay-per-slip over Mobile Money. Tipsters post betslips (manual legs or a screenshot parsed by Claude Vision); finished slips are free to view; pending slips are the paid product. Auto result-verification via api-football. Platform takes 10%, tipster 90%, paid out per transaction. Mobile-first PWA, Next.js 14 + Supabase (Postgres) + ioTec Pay.

## 2. Supabase status (the explicit question: "does it exist?")
**Partially.** What exists:
- Supabase client wired (`src/lib/supabase.ts`) — browser (anon) + server (service role).
- A full schema + RLS as **raw SQL** (`src/lib/schema.sql`, `src/lib/rls.sql`), run by hand in the SQL editor.
- DB query layer with mock fallback (`src/lib/db.ts`).

What's **missing / wrong:**
- ❌ No Supabase CLI project, no `supabase/migrations/` — no versioned, repeatable migrations. (README still says "paste schema.sql into the SQL editor".)
- ❌ Not using **Supabase Auth** — auth is hand-rolled (see §4).
- ❌ RLS is **open** — every policy is `using(true)` / `with check(true)`. Real protection is only that writes go through the service-role key server-side.
- ❌ `supabaseServer()` **hardcodes** the project URL `sooutpsbdgqelnnnfezp.supabase.co` instead of reading `NEXT_PUBLIC_SUPABASE_URL` — `src/lib/supabase.ts:13`.
- ❌ **Schema/code drift:** code queries `subscriptions`, `tips`, `tipster_stats`; the schema defines none of them.

## 3. Payments status (the explicit question: "check for payment code/ui")
**ioTec library: done. Wiring: broken. UI: absent.**

Migration history is layered and messy — three gateways have left traces:
| Layer | Evidence | State |
|---|---|---|
| Africa's Talking | `README.md`, `AT_*` keys in `.env`, `africastalking` dep | stale (SMS only, stubbed) |
| Flutterwave | `flutterwave-node-v3` dep, `src/types/flutterwave.d.ts`, `flw_ref` column, `.env.local.example` | stale remnant |
| **ioTec Pay** | `src/lib/payments.ts`, `IOTEC_*` keys in `.env` | **current/intended** |

### 🔴 3.1 Disbursement pays the buyer, not the tipster
`src/app/api/subscribe/route.ts:55`
```ts
const result = await disburseTipster({ phone: user_phone, grossAmount: gross, ref, tipsterName: tipster.name })
```
`phone` here is the **buyer's** number (`user_phone`). The tipster's 90% is sent back to the person who just paid. Must be the tipster's payout phone — which isn't even fetched (tipster comes from mock, has no phone). **This loses money on every real transaction.**

### 🔴 3.2 Buy flow is synchronous; MoMo is asynchronous
`src/app/api/subscribe/route.ts:45-59`. It calls `collectPayment` then immediately `disburseTipster`. A MoMo collection is **not** confirmed when the API returns — the user still has to approve the prompt on their phone, and confirmation arrives later via webhook. This code treats "request accepted" as "money received" and pays out against funds that may never land. It only "works" because demo mode returns instant success (`payments.ts:62`). Correct flow in [`PAYMENTS-IOTEC.md`](PAYMENTS-IOTEC.md): collect → persist pending → webhook confirms → then disburse + unlock.

### 🔴 3.3 No ledger rows are ever written
The webhook (`src/app/api/webhooks/flutterwave/route.ts:47-66`) **updates** `payments` and `slip_purchases` by reference — but **nothing inserts those rows.** Grep confirms: only reads/updates of `payments`/`slip_purchases`, no inserts. `subscribe` only calls `logEarning` (writes `earnings`) off mock data. So: no purchase record, no payment record, webhook updates zero rows, buyer never gets a durable unlock.

### 🟠 3.4 Buy flow runs on mock data
`src/app/api/subscribe/route.ts:33-39` resolves tipster + slip + price from `MOCK_TIPSTERS` / `MOCK_BETSLIPS`. Real prices/tipsters in the DB are ignored. A user could be charged the mock price, not the real one.

### 🟠 3.5 No purchase UI
`channel/[slug]/page.tsx` is read-only (profile, slip feed, follow). The "⚡ Pay per slip" box (`channel/[slug]/page.tsx:65`) is copy only. Nothing in the app POSTs to `/api/subscribe`. So `/api/subscribe` is an orphan endpoint. Payments cannot be triggered by a user today.

### 🟠 3.6 Webhook is mislabeled and trusts unsigned calls
- Path is `api/webhooks/flutterwave/` but the handler is ioTec — `src/app/api/webhooks/flutterwave/route.ts`. Rename to `api/webhooks/iotec`.
- `route.ts:30` `if (signature && !verifySignature(...))` — when **no** signature header is present, the request is accepted. An attacker can POST a forged "successful" payload with no signature and flip any payment to `confirmed`. Require a signature once `IOTEC_WEBHOOK_SECRET` is set; verify the real header name against ioTec docs (the code guesses `x-iotec-signature`/`x-webhook-signature`).
- `payments.ts:158 verifyIotecWebhook` always returns `true` (dead/duplicate of the route's check).
- No idempotency: a re-delivered webhook re-runs the unlock.

### 🟡 3.7 Disburse retry has no idempotency key
`subscribe/route.ts:53-59` retries `disburseTipster` 3×. If a disburse actually succeeded but the response was lost, the retry double-pays. ioTec disbursements need a stable idempotency reference per attempt.

## 4. Auth status
🟠 **Hand-rolled, three competing password schemes:**
- `src/lib/auth.ts` — salted **SHA-256** (`hashPassword`/`verifyPassword`). This is what the signup/login route actually uses (`api/tipster/auth/route.ts:45,69`).
- `src/lib/schema.sql:179` seed rows — pgcrypto **bcrypt** (`crypt(... gen_salt('bf'))`). These seed tipsters can never log in via the SHA-256 verifier.
- `bcryptjs` is a dependency but unused.
- → Pick one (recommend `bcryptjs`), fix the seed, delete the rest.

🔴 **Admin token is forgeable** — `src/lib/adminAuth.ts:18-23`:
```ts
export function isValidAdminToken(token: string): boolean {
  const decoded = Buffer.from(token, 'base64').toString()
  return decoded.startsWith('admin:')   // no secret, no signature
}
```
Anyone sending `x-admin-token: YWRtaW46` (`base64("admin:")`) is "admin". Also the default password `Betfluencer@Admin2026` is hardcoded in source (`adminAuth.ts:8,32`) and in `.env.local.example`. Sign the token (HMAC + server secret) or use a real session; remove the hardcoded default.

🟡 **No real sessions** — login returns `{id,name,username}` JSON; there's no signed cookie/JWT, so the tipster dashboard trusts a client-held id. Anyone can fetch another tipster's dashboard data by id.

## 5. Schema ↔ code drift
Tables **used in code** vs **defined in `schema.sql`**:

| Table | Defined? | Used in |
|---|---|---|
| tipsters, betslips, betslip_legs, slip_purchases, payments, earnings | ✅ | — |
| tipster_rankings (view) | ✅ | rankings, profile |
| **subscriptions** | ❌ | `db.ts` (getSubscriptionsByPhone, createSubscription, checkActiveSubscription) |
| **tips** | ❌ | `db.ts` (getTipsByTipster, createTip) |
| **tipster_stats** | ❌ | `api/admin/stats`, `api/tipster/[slug]/stats` |

`subscriptions` + `tips` are legacy (the model moved to per-slip — `types/index.ts:4` "SubPlan removed"). `tipster_stats` looks like a view that was meant to exist — the recent commits (`b5de27e`, `76ca178`, `b2b4f8b`) were patching errors around it and the `commission`/`platform_cut` column name. **Fix: delete the legacy queries, create the `tipster_stats` view (or compute inline), lock the column names.**

Also `types/index.ts` still describes the **old** model: `Subscription`, `Payment.subscription_id`, `EarningsRecord.source = "weekly sub"` — out of sync with the per-slip `slip_purchases`/`payments` schema. Update the types.

## 6. Repo hygiene
- ⚪ **Junk files committed** in the working tree — `git status` shows deletions of `a`, `p.user_phone)).size`, `r.id`, `s.result`, `since28)`. These are fragments of a shell/JS one-liner accidentally `git add`-ed as filenames. Clean: `git rm --cached <each>` (quote them) and commit.
- ⚪ **`.env` may be tracked** — confirm it's gitignored; it currently holds real-looking keys (ioTec, Supabase service role, Anthropic). If tracked, rotate those keys.
- ⚪ README + `.env.local.example` describe Africa's Talking / Flutterwave — neither matches the ioTec reality. Rewrite.
- ⚪ Vercel is the configured host (`vercel.json`) but the engagement plan was Hetzner + Coolify. Decide before go-live.

## 7. Suggested order of work (for 11 Jun)
1. §3.1 disburse-to-tipster fix + fetch real tipster/phone from DB.
2. §3.3 write `slip_purchases` + `payments` rows on collect.
3. §3.2 async flow: collect → pending → webhook confirm → disburse + unlock (`PAYMENTS-IOTEC.md`).
4. §3.6 rename + harden webhook (signature required, idempotent).
5. §3.5 buy UI on `channel/[slug]`.
6. §4 admin token + tipster session.
7. §5 kill legacy tables / add `tipster_stats`.
8. Then P1 (Supabase migrations, RLS, auth model) and P2 cleanup.

---

## 8. Resolved in the cleanup pass (2026-06-10)
Stale leftover code trashed; schema synced to the live DB. What changed:
- **Schema synced** (`schema.sql`) — added `betslips.betting_site` + `booking_code`, added `platform_settings` table, widened `posting_mode` check to include `booking_code`, made `total_odds`/`leg_count` nullable (match live).
- **Dead tables removed from code** — deleted `subscriptions` + `tips` queries from `db.ts`; `api/subscribe` GET now reads real `slip_purchases` (so the "Mine" page works).
- **`tipster_stats` → `tipster_rankings`** — it was a wrong name for the existing view; repointed `api/tipster` + `api/tipster/[slug]/stats`.
- **Gateway remnants gone** — pruned 7 unused deps (`flutterwave-node-v3`, `africastalking`, `axios`, `bcryptjs`, `clsx`, `postgres`, `@supabase/ssr`), deleted `flutterwave.d.ts` + `africastalking.d.ts` + unused `TipFeed.tsx`, removed dead `verifyIotecWebhook` from `payments.ts`, and **renamed the webhook route `flutterwave` → `iotec`**.
- **Types** — removed dead `Subscription`/`Payment`/`EarningsRecord`/`SubStatus`/`PayStatus`; kept `Tip` (client notifications only).
- **Docs** — rewrote `README.md` + `.env.local.example` to ioTec; removed junk index files (`a`, `r.id`, …).
- **Verified:** `npm run build` passes.

**Still open (NOT touched — these are fixes/features, not stale code):** the §3 payment-flow bugs (disburse target, async flow, ledger writes, no buy UI), §4 admin token + sessions, §3.6 unsigned webhook, and all of P1 (Supabase migrations / RLS / auth model). `payments.flw_ref` column kept as-is (rename needs a migration).
