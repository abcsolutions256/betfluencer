# Spec: Free & Public "Open Beta" — payments paused, no paywall, all markets open

**Branch:** `feat/free-public-access` (off `production`) · **Status:** requirements ascertained; awaiting go-ahead to implement.

## Goal (from the pivot)

Open Betfluencer to the public **at no cost**: viewers/users see **all** picks (booking codes + screenshots) with **no unlock and no payment**, tipsters can **sign up in their own country**, across **all five markets**. Payments are **paused** (not removed) and fully reversible.

Chosen access model: **Fully public — no paywall** (the reveal gate is removed at the API layer; the DB-level `betslip_secrets` RLS stays closed).

---

## A. De-paywall the picks (core change)

- **A1 — Reveal endpoint** `src/app/api/slips/[id]/reveal/route.ts`: remove the purchase/owner gate (currently 403 "Not purchased" unless the buyer phone has an `active` purchase or the session owns the slip). Return the secret (`booking_code`, `betting_site`, `slip_image_url`) + legs/verification for **any** pending slip. Route stays **service-role** — so we serve the content freely *without* opening RLS.
- **A2 — Feed UI** `src/components/ui/BetslipFeed.tsx`: `canView` becomes always-true for pending slips → render `<SlipReveal>` directly; drop `InlineBuyGate` + `usePayment`/PaymentSheet from this path. No unlock click.
- **A3 — Feed API** `src/app/api/slips/route.ts`: keep it proof-only/lightweight; `<SlipReveal>` lazily fetches the now-public reveal per slip. (No need to inline secrets into the list.)
- **A4 — RLS** `src/lib/rls.sql`: **unchanged** — `betslip_secrets` stays service-role-only. Never add `using(true)` (landmine rule). De-gating happens only in the API route, which is the reversible seam.

## B. Pause payments (reversible)

- **B1** — `payments_enabled=false` for **all 5** markets. ⚠️ UG is hard-locked in `src/app/api/admin/countries/route.ts` (403), so this must be a **migration**, not the admin UI.
- **B2** — `payments/initiate` free-stub branch already handles `payments_enabled=false` (creates purchase, `amount_paid:0`, no earning/payout). With the feed de-paywalled, the buy flow is bypassed for content anyway; leave `initiate` intact/dormant. Hide residual "buy/price" CTAs (`BuySlipButton`, slips page).
- **B3** — ioTec code (`iotec.ts`, `transactions.ts`, webhook) untouched and dormant. Resume = flip `payments_enabled` back on.

## C. Open all markets

- **C1** — NG/GH/ZA/KE → `active=true, coming_soon=false` (same migration as B1). NG/GH/ZA/KE are not locked.
- **C2** — Middleware geo-redirect + `/welcome` picker automatically cover all `active` markets — no code change; they read `active` at request time.

## D. Public tipster signups, per country

- **D1** — `platform_settings.public_signups_enabled = 'true'` (currently OFF). Seed in the migration.
- **D2** — Signup already links the tipster to the active market via `linkTipsterToCountry` (subdomain → country). So a tipster on `ng.betfluencer.org/tipster/signup` is registered under NG. Verify signup is reachable/working on each subdomain.

## E. UX / copy

- **E1** — Relabel/remove unlock + price CTAs → "View picks" (free, instant). Files: `BetslipFeed.tsx` (`InlineBuyGate`), `BuySlipButton.tsx`, `PaymentSheet.tsx` usage.
- **E2** — About "Payments" section + hero chips + any "pay per slip" wording → an "open beta — free for now" note. Per-country copy lives in `countries.about_content` / `src/lib/aboutContent.ts`.
- **E3** — Post-slip form "set your price": keep the field but mark it inactive during open beta (or hide). Tipster dashboard earnings will read 0 — ensure it renders gracefully (free-stub writes no earning rows, so it's empty, not broken).

## F. Tests (merge gate)

- **F1** — `04-coded-slip-paywall.spec.ts`: currently asserts the code **never** leaks to the feed. Under fully-public this **inverts** → rewrite to assert the code **is** publicly revealable without purchase.
- **F2** — `05-guest-purchase.spec.ts`: "buy via PaymentSheet → reveal; fresh guest denied" → rewrite to "any visitor sees the picks free, no purchase, no denial."
- **F3** — `08-signups-closed.spec.ts`: still valid (it toggles the flag itself); update the "production default is OFF" comment.
- **F4** — New: assert `GET /api/slips/[id]/reveal` returns the secret with **no** buyer/session.

## G. Analytics

- **G1** — Free public views do **not** create `slip_purchases` rows (no value, adds noise) → fully anonymous viewing. `slip_purchases` remains only for the (dormant) paid path.

---

## Migration (new, 0014)

```sql
-- Open beta: pause payments everywhere, open all markets, open signups.
update countries set payments_enabled = false;                       -- incl. UG (admin-locked, so DB-side)
update countries set active = true, coming_soon = false;             -- NG/GH/ZA/KE go public
insert into platform_settings (key, value) values ('public_signups_enabled','true')
  on conflict (key) do update set value = excluded.value;
```
Reversal is the mirror (restore UG `payments_enabled=true`, re-close the four markets, signups off).

## ⚠️ Risks to accept before building

1. **Booking codes + screenshots become fully public and scrapeable.** Once published openly they're out — re-enabling the paywall later does **not** un-leak already-exposed codes. Competitors/scrapers can harvest every tipster's picks for free. This is inherent to "no paywall."
2. **Tipsters earn nothing** during open beta (understood — "no cost for now"). Their ranking/stats still work (settlement is unaffected).
3. **Paywall test coverage is inverted**, not just disabled — the merge gate changes meaning.

## Rollback

Everything is flag-driven + one API-gate change. To revert: restore the reveal-route gate, re-hide the feed picks, and run the mirror migration. The ioTec payment stack was never removed.

## Suggested implementation order

1. Migration 0014 (flags) — smallest, highest-leverage; makes markets/signups live immediately.
2. Reveal-route de-gate + feed UI (A1–A3) — the actual de-paywall.
3. Copy + CTA reframe (E).
4. Test rewrites (F) — keep the gate green.
5. `npm run test:e2e` + build, then stage → verify → production.
