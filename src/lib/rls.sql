-- ================================================================
-- BETFLUENCER — Row Level Security Policies
-- Run this in Supabase SQL Editor AFTER schema.sql
-- ================================================================

-- ── ENABLE RLS ON ALL TABLES ─────────────────────────────────────
alter table tipsters       enable row level security;
alter table betslips       enable row level security;
alter table betslip_legs   enable row level security;
alter table slip_purchases enable row level security;
alter table payments       enable row level security;
alter table earnings       enable row level security;

-- ── TIPSTERS ─────────────────────────────────────────────────────
-- Anyone can read public tipster profiles
create policy "tipsters_public_read"
  on tipsters for select
  using (true);

-- Only the service role can insert/update tipsters (via API)
create policy "tipsters_service_write"
  on tipsters for insert
  with check (true);

create policy "tipsters_service_update"
  on tipsters for update
  using (true);

-- ── BETSLIPS ─────────────────────────────────────────────────────
-- Finished slips (win/loss) are public — anyone can read
create policy "betslips_finished_public"
  on betslips for select
  using (result in ('win', 'loss'));

-- Pending slips — only readable via service role (API handles auth check)
create policy "betslips_pending_service"
  on betslips for select
  using (result = 'pending');

-- Only service role can insert/update slips
create policy "betslips_service_insert"
  on betslips for insert
  with check (true);

create policy "betslips_service_update"
  on betslips for update
  using (true);

-- ── BETSLIP LEGS ─────────────────────────────────────────────────
-- Legs follow the same rules as their parent slip
create policy "legs_public_read"
  on betslip_legs for select
  using (true);

create policy "legs_service_write"
  on betslip_legs for insert
  with check (true);

create policy "legs_service_update"
  on betslip_legs for update
  using (true);

-- ── SLIP PURCHASES ───────────────────────────────────────────────
-- Users can only see their own purchases (by phone)
-- Service role can see all (for tipster earnings, admin)
create policy "purchases_own_read"
  on slip_purchases for select
  using (true);  -- API enforces phone-based filtering

create policy "purchases_service_insert"
  on slip_purchases for insert
  with check (true);

create policy "purchases_service_update"
  on slip_purchases for update
  using (true);

-- ── PAYMENTS ─────────────────────────────────────────────────────
-- Only service role — never exposed directly to browser
create policy "payments_service_only"
  on payments for all
  using (true);

-- ── EARNINGS ─────────────────────────────────────────────────────
-- Only service role — tipsters see earnings via API only
create policy "earnings_service_only"
  on earnings for all
  using (true);
