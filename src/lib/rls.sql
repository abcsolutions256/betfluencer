-- ================================================================
-- BETFLUENCER — Row Level Security Policies
-- Run in the Supabase SQL Editor AFTER schema.sql.
-- ================================================================
-- Model: the app touches the DB ONLY with the service-role key
-- (server-side, in API routes). The service role BYPASSES RLS, so it
-- always has full access. The public `anon` key (shipped to the
-- browser) must read NOTHING sensitive and write NOTHING.
--
-- Therefore the anon role is granted ONLY:
--   • read finished (win/loss) betslips + their legs — free to view.
-- Everything else (pending slips' booking codes, purchases, payments,
-- earnings, transactions, tipsters incl. password_hash) has NO anon
-- policy, so RLS denies it by default. Pending-slip content is gated
-- by payment in the API (src/lib/entitlement.ts).
--
-- ⚠️ Do NOT add `using(true)` / `with check(true)` policies here — that
-- re-opens the data to anyone holding the public anon key.

-- ── ENABLE RLS ON ALL TABLES ─────────────────────────────────────
alter table tipsters       enable row level security;
alter table betslips       enable row level security;
alter table betslip_legs   enable row level security;
alter table slip_purchases enable row level security;
alter table payments       enable row level security;
alter table earnings       enable row level security;
alter table platform_settings enable row level security;
-- transactions: enabled in migration 0002.

-- ── BETSLIPS ─────────────────────────────────────────────────────
-- Public can read ONLY finished slips. Pending slips (the paid
-- product) are service-role-only — served, and payment-gated, by the API.
create policy "betslips_finished_public" on betslips for select
  using (result in ('win', 'loss'));
-- (no anon insert/update/select-pending — service role only.)

-- ── BETSLIP LEGS ─────────────────────────────────────────────────
-- Legs are public only when their parent slip is finished.
create policy "legs_finished_public" on betslip_legs for select
  using (exists (
    select 1 from betslips b
    where b.id = betslip_legs.betslip_id
      and b.result in ('win', 'loss')
  ));

-- ── SLIP PURCHASES ───────────────────────────────────────────────
-- Service-role only. No anon read (buyer phones) and — critically —
-- no anon insert/update, so nobody can forge an 'active' purchase to
-- unlock a code. (No policies = denied for anon.)

-- ── PAYMENTS · EARNINGS · TRANSACTIONS ───────────────────────────
-- Financial data + buyer phones. Service-role only (no policies).

-- ── TIPSTERS ─────────────────────────────────────────────────────
-- Service-role only — the table holds password_hash. Public tipster
-- info is exposed via the tipster_rankings view + the API, never the
-- raw table. (No policies = denied for anon.)

-- ── PLATFORM SETTINGS ────────────────────────────────────────────
-- Service-role only (admin-managed via the API). (No policies.)
