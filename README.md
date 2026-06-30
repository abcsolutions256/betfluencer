# Betfluencer

Football **tipster marketplace** for Uganda. Tipsters post betslips; users **pay per slip** over Mobile Money to unlock the picks. Finished slips (win/loss) are free to view. Mobile-first PWA.

> New here? Read **[CLAUDE.md](CLAUDE.md)** for the architecture + known issues, **[TODO.md](TODO.md)** for the backlog, and **[docs/](docs/)** for the payment + improvement detail.

## Stack
- **Next.js 14** (App Router) + React 18 + TypeScript + Tailwind
- **Supabase** — Postgres only, via the service-role key (not Supabase Auth)
- **ioTec Pay** — Mobile Money (MTN + Airtel UG), collections + disbursements
- **Claude Vision** (`@anthropic-ai/sdk`) — betslip screenshot parsing
- **api-football** — auto-verify match results
- **Vercel** — hosting + cron

## Quick start
```bash
npm install
cp .env.local.example .env.local   # fill in Supabase + ioTec keys
npm run dev                         # http://localhost:3000
```
Leave `IOTEC_CLIENT_ID` empty (or `demo`) to run payments in demo mode — no real charges.

## Database
No Supabase CLI migrations yet (on the backlog). Set up by hand:
1. Supabase project → SQL Editor
2. Run `src/lib/schema.sql` (tables, indexes, auto-tick trigger, `tipster_rankings` view, seed)
3. Run `src/lib/rls.sql` (RLS policies)

Tables: `tipsters`, `betslips`, `betslip_legs`, `slip_purchases`, `payments`, `earnings`, `platform_settings`. View: `tipster_rankings`.

## Payment flow (ioTec, per-slip)
```
Buyer taps "Unlock" → POST /api/subscribe
  → insert pending slip_purchases + payments
  → ioTec collect (MoMo prompt to buyer)
Buyer approves → ioTec → POST /api/webhooks/iotec (signed)
  → mark payment confirmed → unlock slip_purchases → disburse 90% to tipster → log earning
  → on disburse failure: refund buyer
```
Platform takes 10% at transaction time; no funds held. **Status:** the ioTec library (`src/lib/payments.ts`) is in place; the end-to-end wiring is still being built — see [docs/PAYMENTS-IOTEC.md](docs/PAYMENTS-IOTEC.md) and [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md).

## Structure
```
src/
  app/
    page.tsx · channels · rankings · mine · channel/[slug]   ← public
    tipster/{login,signup,dashboard}                          ← tipster
    admin                                                     ← admin
    api/
      subscribe          ← buy (collect) + buyer purchases
      tips               ← post betslips (manual or booking-code)
      parse-slip         ← Claude Vision screenshot → slip
      verify             ← cron: auto-verify results
      webhooks/iotec     ← ioTec payment confirmation
      tipster/* · admin/* · ads/*
  lib/
    supabase.ts · db.ts · payments.ts (ioTec) · auth.ts · adminAuth.ts
    footballApi.ts · schema.sql · rls.sql
  types/ · components/ · hooks/
```

## Deploy
```bash
npx vercel
```
Add the env vars in the Vercel dashboard; point the ioTec webhook at `https://<domain>/api/webhooks/iotec`.
