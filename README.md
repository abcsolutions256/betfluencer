# Betfluencer

Football tipster marketplace for Uganda. Built with Next.js, Supabase, and Africa's Talking.

## Stack
- **Frontend + Backend**: Next.js 14 (App Router)
- **Database + Auth**: Supabase
- **Payments + SMS**: Africa's Talking
- **Hosting**: Vercel

## Quick start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
```bash
cp .env.local.example .env.local
```
Fill in your Supabase and Africa's Talking credentials.

### 3. Set up the database
- Go to your Supabase project → SQL Editor
- Paste and run the contents of `src/lib/schema.sql`
- This creates all tables, indexes, RLS policies, and the rankings view

### 4. Run locally
```bash
npm run dev
```
Open http://localhost:3000

### 5. Deploy to Vercel
```bash
npx vercel
```
Add your environment variables in the Vercel dashboard.

---

## Project structure

```
src/
  app/
    page.tsx                  ← Channels (home page)
    rankings/page.tsx          ← Rankings
    mine/page.tsx              ← My subscriptions (phone lookup)
    channel/[slug]/page.tsx    ← Tipster profile + subscribe flow
    tipster/
      login/page.tsx           ← Tipster login
      signup/page.tsx          ← Tipster signup
      dashboard/page.tsx       ← Tipster dashboard
    api/
      subscribe/route.ts       ← Payment collection + disbursement
      tipster/[slug]/route.ts  ← Tipster public profile API
      tipster/auth/route.ts    ← Tipster login + signup API
      tips/route.ts            ← Post tips + SMS notifications
  components/
    layout/Navigation.tsx      ← TopBar + BottomNav
    ui/index.tsx               ← TipsterCard, TipRow, WinRate, etc.
  lib/
    supabase.ts                ← Supabase client (browser + server)
    payments.ts                ← Africa's Talking: collect, disburse, SMS
    schema.sql                 ← Full database schema
  types/index.ts               ← All TypeScript types
```

---

## Payment flow

```
User pays → STK push (Africa's Talking collect API)
         → Platform confirms receipt
         → Disburse 90% to tipster (disbursement API)
         → If 3 failures → refund user in full
         → On success → create subscription → unlock channel → send SMS
```

Platform takes 10% at transaction time. Tipster receives 90% instantly. No funds held.

---

## Key APIs

### Africa's Talking
- Sign up: https://africastalking.com
- Docs: https://developers.africastalking.com
- Covers MTN Uganda + Airtel Uganda in one integration

### Supabase
- Sign up: https://supabase.com
- Create a new project, copy URL + anon key to .env.local

---

## Next steps
- [ ] Africa's Talking webhook for async payment confirmation
- [ ] Subscription expiry cron job (Vercel cron)
- [ ] Admin dashboard
- [ ] Expand to Kenya (M-Pesa) and Tanzania (Tigo, Airtel)
