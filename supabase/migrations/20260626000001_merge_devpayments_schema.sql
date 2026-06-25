-- ============================================================================
-- MERGE 20260626000001 — CONSOLIDATED dev/payments bring-up (ADDITIVE)
-- ============================================================================
-- PURPOSE
--   Bring main's EXISTING prod DB up to the merged schema by ADDING every
--   dev/payments object that main lacks. This single migration consolidates the
--   additive parts of dev migrations 0002 / 0004 / 0005 / 0006 / 0007 / 0008 /
--   0009 / 0010 into one replay-safe file. (platform_settings + transactions +
--   slip_verifications + betslip_secrets + profiles + auth trigger + the new
--   betslips/tipsters/slip_purchases columns + record_failed_verify() + the
--   platform_commission seed + RLS hardening.)
--
-- WHY NOT REPLAY THE DEV MIGRATIONS DIRECTLY?
--   dev's 20260610000001_init / 000002 / 000004 use plain `create table` (no
--   IF NOT EXISTS). Replaying them on main's already-populated prod DB would
--   ERROR ("relation already exists") and could re-seed tipsters. This migration
--   instead re-expresses ONLY the missing objects, every statement idempotent.
--
-- TARGET
--   main's PROD DB. It ALREADY HAS: tipsters, betslips, betslip_legs,
--   slip_purchases, payments, earnings, tipster_rankings (+ live tipster_stats),
--   update_tipster_tick() + trigger, the base indexes, and main's permissive RLS.
--   Those are NOT recreated here — only what main lacks is added.
--
-- ⚠️ PREREQUISITE — SUPABASE AUTH MUST BE ENABLED FIRST ⚠️
--   The `profiles` table FKs `auth.users(id)`, the `handle_new_user` trigger
--   fires on `auth.users`, and `slip_purchases.buyer_id` FKs `auth.users(id)`.
--   Supabase Auth (the `auth` schema) MUST be ENABLED on main's project BEFORE
--   applying this migration — otherwise the `profiles` FK / trigger creation
--   fails. Enable it in the project dashboard (config.toml `[auth] enabled=true`)
--   before running. No `auth.*` tables are hand-created; Supabase provisions them.
--
-- PROPERTIES
--   Idempotent      — create table/index IF NOT EXISTS, add column IF NOT EXISTS,
--                     drop policy if exists before create policy, create or
--                     replace function, do-blocks for CHECK changes.
--   Additive        — only adds tables / columns / indexes / policies.
--   Non-destructive — NO drop table, NO truncate. The one data move
--                     (betslip_secrets, §5) is COPY-THEN-NULL: secrets are copied
--                     INTO betslip_secrets before the betslips copies are nulled,
--                     so the secret data is never lost.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — platform_settings  (dev 0001; main lacks it)
-- ============================================================================
create table if not exists platform_settings (
  key   text primary key,
  value text not null
);


-- ============================================================================
-- SECTION 2 — transactions (ioTec) + indexes + set_updated_at() + trigger + RLS
--             (dev 0002)
-- ============================================================================
create table if not exists transactions (
  id                 uuid primary key default uuid_generate_v4(),
  iotec_id           text unique,                       -- ioTec collection id (= status requestId)
  external_id        text unique not null,              -- our reconciliation ref
  type               text not null default 'collection' check (type in ('collection','disbursement')),
  method             text check (method in ('momo','card')),
  category           text default 'MobileMoney',
  purpose            text default 'slip_purchase',
  betslip_id         uuid references betslips(id) on delete set null,
  tipster_id         uuid references tipsters(id) on delete set null,
  slip_purchase_id   uuid references slip_purchases(id) on delete set null,
  user_phone         text,
  user_email         text,
  payer              text,
  amount             integer not null,
  currency           text not null default 'UGX',
  status             text not null default 'pending'
                     check (status in ('pending','processing','success','failed','cancelled')),
  iotec_status       text,
  status_message     text,
  card_redirect_url  text,
  transaction_charge numeric(12,2),
  raw                jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists idx_transactions_external on transactions(external_id);
create index if not exists idx_transactions_iotec    on transactions(iotec_id);
create index if not exists idx_transactions_status   on transactions(status, created_at desc);
create index if not exists idx_transactions_betslip  on transactions(betslip_id);

-- keep updated_at fresh
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists transactions_set_updated_at on transactions;
create trigger transactions_set_updated_at
  before update on transactions
  for each row execute function set_updated_at();

alter table transactions enable row level security;
-- SECURITY (merge hardening): the `transactions` table holds financial data —
-- buyer phones/emails, amounts, and raw ioTec payment payloads. dev shipped this
-- as `for all using(true)`, which under RLS is permissive to ALL roles including
-- the anon key (a data leak). We DROP that policy and leave the table RLS-enabled
-- with NO policy = default-deny, matching `payments`/`earnings`. All app access to
-- transactions goes through the service-role key (supabaseServer()), which bypasses
-- RLS, so no functional access is lost. (Reviewer MEDIUM finding; db-harmonization §5.)
drop policy if exists "transactions_service_only" on transactions;

-- slip_purchases.status: allow 'pending' (created before payment confirms) and
-- flip the default to 'pending' (dev 0002 / collision C3). CHECK is WIDENED, never
-- narrowed — existing 'active'/'refunded' rows remain valid.
alter table slip_purchases drop constraint if exists slip_purchases_status_check;
alter table slip_purchases add  constraint slip_purchases_status_check
  check (status in ('pending','active','refunded'));
alter table slip_purchases alter column status set default 'pending';


-- ============================================================================
-- SECTION 3 — slip_verifications (bet-code worker scrape results)
--             (dev 0004 + normalized/summary/total_odds from dev 0006)
-- ============================================================================
create table if not exists slip_verifications (
  id           uuid primary key default uuid_generate_v4(),
  betslip_id   uuid references betslips(id) on delete cascade,   -- optional link
  betting_site text,
  booking_code text not null,
  matches      jsonb not null default '[]'::jsonb,   -- [{teams,league,market,pick,kickoff}]
  raw_text     text default '',                      -- fallback: the section's text
  screenshot_url text,                               -- debug screenshot from the worker
  match_count  integer not null default 0,
  found        boolean not null default false,       -- did entering the code return selections?
  status       text not null default 'scraped'
               check (status in ('scraped','failed','verified')),
  error        text,
  scraped_at   timestamptz default now()
);

-- dev 0006: persist the Gemini-normalised slip JSON + summary + total_odds.
alter table slip_verifications add column if not exists normalized jsonb not null default '[]'::jsonb;
alter table slip_verifications add column if not exists summary    text;
alter table slip_verifications add column if not exists total_odds numeric;

-- One current verification row per betslip (upserted on betslip_id). Postgres
-- allows multiple NULLs so manual one-off checks still append.
create unique index if not exists uniq_slip_verif_betslip on slip_verifications(betslip_id);
create index if not exists idx_slip_verif_code on slip_verifications(booking_code);

-- Service-role only (written by the API; never read by the anon key).
alter table slip_verifications enable row level security;


-- ============================================================================
-- SECTION 4 — profiles + handle_new_user() trigger  (dev 0005; needs auth schema)
-- ============================================================================
-- One row per Supabase Auth user; carries the role. REQUIRES the `auth` schema
-- (see PREREQUISITE header).
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         text not null default 'user' check (role in ('user','tipster','admin')),
  email        text,
  display_name text default '',
  created_at   timestamptz default now()
);

-- Auto-create a profile when someone signs up (role defaults to 'user'; a tipster
-- signup elevates the role via the API afterwards).
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


-- ============================================================================
-- SECTION 5 — betslip_secrets + the COPY-THEN-NULL data move (collision C2)
-- ============================================================================
-- Post-purchase content (booking code + site + screenshot URL) isolated into its
-- own service-role-only table so these NEVER sit as columns on betslips and can't
-- leak through a betslips select.
--
-- main's LIVE betslips HAS booking_code / betting_site / slip_image_url columns
-- holding REAL secret data. This step COPIES that data INTO betslip_secrets FIRST,
-- then NULLs the betslips copies. The copy precedes the null so NO secret is lost.
-- Guard: only NULL the betslips columns if they exist (they may already be moved).
create table if not exists betslip_secrets (
  betslip_id     uuid primary key references betslips(id) on delete cascade,
  booking_code   text,
  betting_site   text,
  slip_image_url text
);

do $$
begin
  -- Only attempt the move if betslips still carries the secret columns. (After a
  -- prior run, or on a DB where dev 0005 already moved them, these columns may be
  -- absent — in which case there is nothing to move.)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'betslips'
      and column_name = 'booking_code'
  ) then
    -- 1) COPY secrets out of betslips into betslip_secrets (preserve the data).
    insert into betslip_secrets (betslip_id, booking_code, betting_site, slip_image_url)
      select id, booking_code, betting_site, slip_image_url
      from betslips
      where (booking_code   is not null and booking_code   <> '')
         or (slip_image_url is not null and slip_image_url <> '')
      on conflict (betslip_id) do nothing;

    -- 2) Only AFTER the copy, NULL the betslips copies so the secret lives ONLY
    --    in betslip_secrets. (We null rather than drop the columns — non-destructive
    --    to the table structure; the data is already safe in betslip_secrets.)
    update betslips set booking_code = null, betting_site = null, slip_image_url = null;
  end if;
end $$;

-- RLS: betslip_secrets has NO anon/authenticated policy → service-role only.
alter table betslip_secrets enable row level security;


-- ============================================================================
-- SECTION 6 — tipsters: profile_id + commission_rate + drop password_hash NOT NULL
--             (dev 0005, collision C4)
-- ============================================================================
alter table tipsters add column if not exists profile_id      uuid references profiles(id) on delete set null;
alter table tipsters add column if not exists commission_rate numeric(4,3);   -- null = use the global default
create unique index if not exists uniq_tipsters_profile on tipsters(profile_id);
-- Auth moved to Supabase Auth; the legacy password_hash is no longer required.
-- (Column is KEPT — preserves old bcrypt hashes; we only drop its NOT NULL.)
alter table tipsters alter column password_hash drop not null;


-- ============================================================================
-- SECTION 7 — betslips: verification status + public PROOF columns + hidden +
--             verify_attempts  (dev 0005 / 0007 / 0010)
-- ============================================================================
alter table betslips add column if not exists verification_status text not null default 'pending'
  check (verification_status in ('pending','verified','failed','rejected'));
alter table betslips add column if not exists verified_at      timestamptz;
alter table betslips add column if not exists game_count       integer;                  -- # matches in the slip
alter table betslips add column if not exists leagues          jsonb default '[]'::jsonb; -- proof: competitions
alter table betslips add column if not exists markets          jsonb default '[]'::jsonb; -- proof: market types
alter table betslips add column if not exists earliest_kickoff timestamptz;

-- dev 0007: admin manual "hidden" flag + partial index.
alter table betslips add column if not exists hidden boolean not null default false;
create index if not exists idx_betslips_hidden on betslips(hidden) where hidden;

-- dev 0010: skip-verified-sync poller retry budget + partial index.
alter table betslips add column if not exists verify_attempts int not null default 0;
create index if not exists idx_betslips_verify_retry
  on betslips (verification_status, verify_attempts)
  where result = 'pending';

-- Existing manual/screenshot slips have no booking code to scrape — trust them as
-- verified so they stay listed. Booking-code slips stay 'pending' until the worker
-- confirms. (Idempotent: only touches rows still at the default 'pending'.)
update betslips set verification_status = 'verified', verified_at = now()
  where posting_mode in ('manual', 'screenshot') and verification_status = 'pending';


-- ============================================================================
-- SECTION 8 — slip_purchases: buyer_id + buyer_key + unique indexes
--             (dev 0005 / 0008 buyer_id; dev 0009 buyer_key)
-- ============================================================================
-- buyer_id: authenticated buyer link (legacy logged-in purchases). Nullable.
alter table slip_purchases add column if not exists buyer_id uuid references auth.users(id) on delete set null;
create index if not exists idx_slip_purchases_buyer on slip_purchases(buyer_id);
-- ON CONFLICT target for the purchase upsert (one row per slip + buyer). NULL
-- buyer_ids stay distinct under Postgres' default NULLS DISTINCT.
create unique index if not exists uniq_purchase_betslip_buyer
  on slip_purchases(betslip_id, buyer_id);

-- buyer_key: guest/localStorage identity ("bf_guest" → x-buyer-key header).
alter table slip_purchases add column if not exists buyer_key text;
create index if not exists idx_slip_purchases_buyer_key on slip_purchases(buyer_key);
create unique index if not exists uniq_purchase_betslip_buyerkey
  on slip_purchases(betslip_id, buyer_key);


-- ============================================================================
-- SECTION 9 — record_failed_verify() function  (dev 0010)
-- ============================================================================
-- Atomically record one failed verification attempt: bump the counter and flip a
-- still-'pending' slip to 'failed'. Never touches 'verified'/'rejected'. Returns
-- the new count.
create or replace function record_failed_verify(p_betslip_id uuid)
returns int
language sql
as $$
  update betslips
     set verify_attempts = verify_attempts + 1,
         verification_status = case
           when verification_status = 'pending' then 'failed'
           else verification_status
         end
   where id = p_betslip_id
     and verification_status in ('pending', 'failed')
  returning verify_attempts;
$$;


-- ============================================================================
-- SECTION 10 — seed platform_settings('platform_commission','0.10')  (dev 0005)
-- ============================================================================
insert into platform_settings (key, value) values ('platform_commission', '0.10')
  on conflict (key) do nothing;


-- ============================================================================
-- SECTION 11 — RLS HARDENING  (dev 0003 + 0005)
-- ============================================================================
-- Replace main's permissive `using(true)` policies with dev's hardened set.
-- Dropping a policy governs ACCESS, not rows — non-destructive to DATA.
--
-- After this section the anon / authenticated roles can read ONLY:
--   • verified or finished betslips (proof only — secrets are in betslip_secrets)
--   • legs whose parent slip is finished
--   • a buyer's own purchases (buyer_id = auth.uid())
--   • a user's own profile
-- Everything else (tipsters / payments / earnings / transactions /
-- slip_verifications / betslip_secrets / platform_settings) is service-role only.

-- Ensure RLS is ON everywhere (no-op if already enabled).
alter table tipsters          enable row level security;
alter table betslips          enable row level security;
alter table betslip_legs      enable row level security;
alter table slip_purchases    enable row level security;
alter table payments          enable row level security;
alter table earnings          enable row level security;
alter table platform_settings enable row level security;

-- ── Drop main's permissive `using(true)` policies (drop if exists = safe) ──
drop policy if exists "tipsters_public_read"      on tipsters;
drop policy if exists "tipsters_service_write"     on tipsters;
drop policy if exists "tipsters_service_update"    on tipsters;

drop policy if exists "betslips_finished_public"   on betslips;
drop policy if exists "betslips_pending_service"   on betslips;
drop policy if exists "betslips_service_insert"    on betslips;
drop policy if exists "betslips_service_update"    on betslips;
drop policy if exists "betslips_verified_public"   on betslips;

drop policy if exists "legs_public_read"           on betslip_legs;
drop policy if exists "legs_service_write"          on betslip_legs;
drop policy if exists "legs_service_update"         on betslip_legs;
drop policy if exists "legs_finished_public"        on betslip_legs;

drop policy if exists "purchases_own_read"         on slip_purchases;
drop policy if exists "purchases_service_insert"    on slip_purchases;
drop policy if exists "purchases_service_update"    on slip_purchases;
drop policy if exists "purchases_owner_read"        on slip_purchases;

drop policy if exists "payments_service_only"      on payments;
drop policy if exists "earnings_service_only"      on earnings;

-- ── Re-create dev's hardened policies ──
-- betslips: public may read VERIFIED slips (proof only — no secret columns remain
-- on this table) and finished ones. Pending/failed stay private.
create policy "betslips_verified_public" on betslips for select
  using (verification_status = 'verified' or result in ('win','loss'));

-- Legs are readable by the public only when their parent slip is finished.
create policy "legs_finished_public" on betslip_legs for select
  using (exists (
    select 1 from betslips b
    where b.id = betslip_legs.betslip_id
      and b.result in ('win', 'loss')
  ));

-- slip_purchases: a buyer may read their OWN purchases (by auth uid). Writes stay
-- service-role only.
create policy "purchases_owner_read" on slip_purchases for select
  using (buyer_id = auth.uid());

-- profiles: a user reads/updates only their own (admin uses service role).
alter table profiles enable row level security;
drop policy if exists "profiles_self_read"   on profiles;
drop policy if exists "profiles_self_update" on profiles;
create policy "profiles_self_read"   on profiles for select using (id = auth.uid());
create policy "profiles_self_update" on profiles for update using (id = auth.uid());

-- tipsters / payments / earnings / platform_settings: NO policy → service-role
-- only (default-deny under RLS). The service-role key (server-side API) bypasses
-- RLS and remains the only way in.

-- ============================================================================
-- END MERGE 20260626000001
-- ============================================================================
