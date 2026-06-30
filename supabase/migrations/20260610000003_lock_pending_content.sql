-- ============================================================
-- 0003 — Lock pending-slip content to paid buyers (RLS hardening)
-- ============================================================
-- GOAL: only buyers who have paid can access a pending slip's
-- booking_code / betting_site / picks.
--
-- The app reads/writes ONLY with the Supabase service-role key
-- (server-side, in the API routes) — and the service role BYPASSES
-- RLS. So the public `anon` key (shipped in the browser) must be able
-- to read NOTHING sensitive and write NOTHING. Previously every table
-- had `using(true)` / `with check(true)` policies, meaning anyone with
-- the anon key could read pending booking codes directly from the DB
-- (`/rest/v1/betslips?result=eq.pending`) or even INSERT a fake
-- `active` slip_purchases row to unlock a code. This closes both.
--
-- After this migration the anon role can read ONLY finished (win/loss)
-- slips and their legs — which are free to view. Everything else is
-- service-role-only. The API still gates pending content by payment
-- (src/lib/entitlement.ts).

-- Make sure RLS is actually ON (no-op if already enabled).
alter table betslips       enable row level security;
alter table betslip_legs   enable row level security;
alter table slip_purchases enable row level security;
alter table payments       enable row level security;
alter table earnings       enable row level security;
alter table tipsters       enable row level security;
alter table transactions   enable row level security;

-- Drop every anon-open policy.
drop policy if exists "betslips_finished_public"  on betslips;
drop policy if exists "betslips_pending_service"  on betslips;
drop policy if exists "betslips_service_insert"   on betslips;
drop policy if exists "betslips_service_update"   on betslips;

drop policy if exists "legs_public_read"   on betslip_legs;
drop policy if exists "legs_service_write"  on betslip_legs;
drop policy if exists "legs_service_update" on betslip_legs;
drop policy if exists "legs_finished_public" on betslip_legs;   -- replay-safe: re-created below

drop policy if exists "purchases_own_read"       on slip_purchases;
drop policy if exists "purchases_service_insert"  on slip_purchases;
drop policy if exists "purchases_service_update"  on slip_purchases;

drop policy if exists "payments_service_only"     on payments;
drop policy if exists "earnings_service_only"     on earnings;
drop policy if exists "transactions_service_only" on transactions;

drop policy if exists "tipsters_public_read"    on tipsters;
drop policy if exists "tipsters_service_write"   on tipsters;
drop policy if exists "tipsters_service_update"  on tipsters;

-- Re-create ONLY the safe public reads: finished slips are free to view.
create policy "betslips_finished_public" on betslips for select
  using (result in ('win', 'loss'));

-- Legs are readable by the public only when their parent slip is finished.
create policy "legs_finished_public" on betslip_legs for select
  using (exists (
    select 1 from betslips b
    where b.id = betslip_legs.betslip_id
      and b.result in ('win', 'loss')
  ));

-- No other policies. With RLS enabled and no permissive policy, the anon /
-- authenticated roles are DENIED by default on:
--   • pending betslips + their legs   (the paid product — booking codes)
--   • slip_purchases                  (buyer phones + entitlement; can't be forged)
--   • payments / earnings / transactions (financials, buyer phones)
--   • tipsters                        (was leaking password_hash to anon)
-- The service-role key (server-side API) bypasses RLS and remains the only
-- way in — gating pending content by an active purchase.
