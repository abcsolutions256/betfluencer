-- ============================================================
-- OVERHAUL — Supabase Auth + roles, verified-slip workflow,
-- secret-separated paywall, per-tipster commission.
-- ============================================================
-- Run AFTER 0001–0004. Requires Supabase Auth (the `auth` schema).

-- ── PROFILES (one row per auth user; carries the role) ───────────
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         text not null default 'user' check (role in ('user','tipster','admin')),
  email        text,
  display_name text default '',
  created_at   timestamptz default now()
);

-- Auto-create a profile when someone signs up (role defaults to 'user';
-- a tipster signup elevates the role via the API afterwards).
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end; $$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── TIPSTERS: link to a profile + per-tipster commission override ─
alter table tipsters add column if not exists profile_id      uuid references profiles(id) on delete set null;
alter table tipsters add column if not exists commission_rate numeric(4,3);   -- null = use the global default
create unique index if not exists uniq_tipsters_profile on tipsters(profile_id);
-- Auth moved to Supabase Auth; the legacy password_hash is no longer required.
alter table tipsters alter column password_hash drop not null;

-- ── BETSLIPS: verification status + public PROOF (no secret here) ─
alter table betslips add column if not exists verification_status text not null default 'pending'
  check (verification_status in ('pending','verified','failed','rejected'));
alter table betslips add column if not exists verified_at      timestamptz;
alter table betslips add column if not exists game_count       integer;                 -- # matches in the slip
alter table betslips add column if not exists leagues          jsonb default '[]'::jsonb; -- proof: competitions
alter table betslips add column if not exists markets          jsonb default '[]'::jsonb; -- proof: market types
alter table betslips add column if not exists earliest_kickoff timestamptz;

-- Existing manual/screenshot slips have no booking code to scrape — trust
-- them as verified so they stay listed. Booking-code slips stay 'pending'
-- until the worker confirms the code resolves.
update betslips set verification_status = 'verified', verified_at = now()
  where posting_mode in ('manual', 'screenshot') and verification_status = 'pending';

-- ── BETSLIP_SECRETS: post-purchase content ──────────────────────
-- booking code + site (booking-code slips) and the screenshot URL
-- (screenshot slips). Its own table so these NEVER sit as columns on
-- betslips and can't leak through a betslips select. Service-role only
-- (no RLS policy). A manual slip's picks live in betslip_legs, which RLS
-- already gates to finished-parent-only.
create table if not exists betslip_secrets (
  betslip_id     uuid primary key references betslips(id) on delete cascade,
  booking_code   text,
  betting_site   text,
  slip_image_url text
);

-- Move existing secrets out of betslips, then null those columns so the
-- secret lives ONLY in betslip_secrets.
insert into betslip_secrets (betslip_id, booking_code, betting_site, slip_image_url)
  select id, booking_code, betting_site, slip_image_url
  from betslips
  where (booking_code   is not null and booking_code   <> '')
     or (slip_image_url is not null and slip_image_url <> '')
  on conflict (betslip_id) do nothing;
update betslips set booking_code = null, betting_site = null, slip_image_url = null;

-- ── SLIP_PURCHASES: tie a purchase to the authenticated buyer ────
alter table slip_purchases add column if not exists buyer_id uuid references auth.users(id) on delete set null;
create index if not exists idx_slip_purchases_buyer on slip_purchases(buyer_id);

-- A slip can be bought by MANY users (one row each); the same user can't
-- double-buy — the purchase flow upserts on (betslip_id, buyer_id). NULL
-- buyer_ids (legacy) stay distinct under Postgres' default NULLS DISTINCT.
create unique index if not exists uniq_purchase_betslip_buyer
  on slip_purchases(betslip_id, buyer_id);

-- ── PLATFORM SETTINGS: seed the global commission ────────────────
insert into platform_settings (key, value) values ('platform_commission', '0.10')
  on conflict (key) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────
alter table profiles        enable row level security;
alter table betslip_secrets enable row level security;

-- Profiles: a user reads/updates only their own (admin uses service role).
drop policy if exists "profiles_self_read"   on profiles;
drop policy if exists "profiles_self_update" on profiles;
create policy "profiles_self_read"   on profiles for select using (id = auth.uid());
create policy "profiles_self_update" on profiles for update using (id = auth.uid());

-- betslip_secrets: NO anon/authenticated policy → service-role only. The
-- booking code / site / screenshot are reachable ONLY through the
-- purchase-checked API.

-- betslips: public may read VERIFIED slips (proof only — no secret columns
-- remain on this table) and finished ones. Pending/failed stay private.
drop policy if exists "betslips_finished_public" on betslips;
drop policy if exists "betslips_verified_public" on betslips;
create policy "betslips_verified_public" on betslips for select
  using (verification_status = 'verified' or result in ('win','loss'));

-- slip_purchases: a buyer may read their OWN purchases (by auth uid), so
-- "my purchases" works across devices. Writes stay service-role only.
drop policy if exists "purchases_own_read"    on slip_purchases;
drop policy if exists "purchases_owner_read"  on slip_purchases;
create policy "purchases_owner_read" on slip_purchases for select
  using (buyer_id = auth.uid());
