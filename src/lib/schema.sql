-- ================================================================
-- BETFLUENCER — Database Schema (per-slip model, no subscriptions)
-- Run in Supabase SQL Editor
-- ================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── TIPSTERS ─────────────────────────────────────────────────────
create table tipsters (
  id             uuid primary key default uuid_generate_v4(),
  name           text not null,
  username       text unique not null,
  phone          text unique not null,
  password_hash  text not null,
  description    text default '',
  sport          text default '',
  verified       boolean default false,
  tick_type      text default null check (tick_type in ('earned','paid',null)),
  created_at     timestamptz default now()
);

-- ── BETSLIPS ─────────────────────────────────────────────────────
create table betslips (
  id                   uuid primary key default uuid_generate_v4(),
  tipster_id           uuid references tipsters(id) on delete cascade,
  posting_mode         text not null check (posting_mode in ('manual','screenshot','booking_code')),
  total_odds           numeric(8,2),
  leg_count            integer,
  result               text default 'pending' check (result in ('pending','win','loss')),
  slip_price           integer not null default 1000,
  note                 text default '',
  slip_image_url       text default '',
  result_image_url     text default '',
  result_proof_pending boolean default false,
  posted_at            timestamptz default now(),
  betting_site         text default null,   -- booking_code mode: which bookie
  booking_code         text default null    -- shareable bookie slip code
);

-- ── BETSLIP LEGS (manual mode) ───────────────────────────────────
create table betslip_legs (
  id             uuid primary key default uuid_generate_v4(),
  betslip_id     uuid references betslips(id) on delete cascade,
  match          text not null,
  league         text default '',
  pick           text not null,
  odds           numeric(5,2) not null,
  match_time     timestamptz,
  result         text default 'pending' check (result in ('pending','win','loss')),
  fixture_id     bigint,        -- cached API-Football fixture id (cheap re-settles)
  market         text,          -- match_result | match_total | team_total | btts | ...
  market_subject text,          -- team/player the pick applies to ('match' = whole match)
  side           text,          -- over | under | yes | no | home | draw | away | null
  line           numeric(6,2)   -- numeric threshold (e.g. 0.5) or null
);

-- ── SLIP PURCHASES ───────────────────────────────────────────────
-- Per-slip purchases — no subscriptions
create table slip_purchases (
  id           uuid primary key default uuid_generate_v4(),
  betslip_id   uuid references betslips(id) on delete cascade,
  tipster_id   uuid references tipsters(id),
  user_phone   text not null,
  user_name    text default '',
  amount_paid  integer not null,
  status       text default 'pending' check (status in ('pending','active','refunded')),
  purchased_at timestamptz default now()
);

-- ── PAYMENTS ─────────────────────────────────────────────────────
create table payments (
  id                 uuid primary key default uuid_generate_v4(),
  purchase_id        uuid references slip_purchases(id),
  user_phone         text not null,
  tipster_id         uuid references tipsters(id),
  gross_amount       integer not null,
  commission_amount  integer not null,
  tipster_amount     integer not null,
  status             text default 'pending'
                     check (status in ('pending','confirmed','failed','refunded')),
  flw_ref            text default '',
  payout_attempts    integer default 0,
  created_at         timestamptz default now()
);

-- ── EARNINGS LOG ─────────────────────────────────────────────────
create table earnings (
  id           uuid primary key default uuid_generate_v4(),
  tipster_id   uuid references tipsters(id) on delete cascade,
  betslip_id   uuid references betslips(id),
  amount       integer not null,
  gross        integer not null,
  commission   integer not null,
  plan         text not null default 'slip',
  user_phone   text not null,
  created_at   timestamptz default now()
);

-- ── PLATFORM SETTINGS ─────────────────────────────────────────────
-- Simple key/value config (e.g. public_signups_enabled). Admin-managed.
create table platform_settings (
  key   text primary key,
  value text not null
);

-- ── INDEXES ──────────────────────────────────────────────────────
create index idx_betslips_tipster    on betslips(tipster_id, posted_at desc);
create index idx_legs_betslip        on betslip_legs(betslip_id);
create index idx_purchases_phone     on slip_purchases(user_phone);
create index idx_purchases_tipster   on slip_purchases(tipster_id);
create index idx_earnings_tipster    on earnings(tipster_id, created_at desc);

-- ── AUTO TICK FUNCTION ────────────────────────────────────────────
create or replace function update_tipster_tick()
returns trigger as $$
declare
  wins_count   integer;
  avg_o        numeric;
  current_tick text;
begin
  select count(*) into wins_count
  from (
    select result from betslips
    where tipster_id = new.tipster_id
    order by posted_at desc limit 10
  ) last10
  where result = 'win';

  select coalesce(round(avg(total_odds)::numeric,1),0) into avg_o
  from betslips
  where tipster_id = new.tipster_id
    and result = 'win'
    and posted_at > now() - interval '7 days';

  select tick_type into current_tick from tipsters where id = new.tipster_id;

  if wins_count >= 7 and avg_o >= 2.0 and current_tick is null then
    update tipsters set verified = true, tick_type = 'earned' where id = new.tipster_id;
  end if;

  if wins_count <= 4 and current_tick = 'earned' then
    update tipsters set verified = false, tick_type = null where id = new.tipster_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger tipster_tick_trigger
after update of result on betslips
for each row execute function update_tipster_tick();

-- ── RANKINGS VIEW ─────────────────────────────────────────────────
create or replace view tipster_rankings as
select
  t.id, t.name, t.username, t.description, t.sport,
  t.verified, t.tick_type,
  coalesce((
    select count(*) from slip_purchases p
    where p.tipster_id = t.id and p.status = 'active'
  ), 0) as subscriber_count,
  coalesce((
    select count(*) from (
      select result from betslips where tipster_id = t.id
      order by posted_at desc limit 10
    ) l where result = 'win'
  ), 0) as wins_last_10,
  coalesce((
    select round(avg(total_odds)::numeric,1)
    from betslips where tipster_id = t.id
      and result = 'win'
      and posted_at > now() - interval '7 days'
  ), 1.0) as avg_odds,
  coalesce((
    select count(*) from (
      select result from betslips where tipster_id = t.id
      order by posted_at desc limit 10
    ) l where result = 'win'
  ), 0) *
  coalesce((
    select round(avg(total_odds)::numeric,1)
    from betslips where tipster_id = t.id
      and result = 'win'
      and posted_at > now() - interval '7 days'
  ), 1.0) as score
from tipsters t
order by score desc;

-- ── SEED DATA ─────────────────────────────────────────────────────
insert into tipsters (name, username, phone, password_hash, description, sport, verified, tick_type)
values
  ('Enzo Kampala', 'EnzoKampala', '+256700000001', crypt('demo1234', gen_salt('bf')), 'Data-driven picks. High odds, high precision.', 'Premier League · Champions League', true,  'earned'),
  ('Nairobi King', 'NairobiKing', '+256700000002', crypt('demo1234', gen_salt('bf')), 'Premier League specialist since 2019.',          'Premier League only',               true,  'paid'),
  ('StatAttack',   'StatAttack',  '+256700000003', crypt('demo1234', gen_salt('bf')), 'Stats-based, consistent returns.',               'All European leagues',              false, null),
  ('BetWise UG',   'BetWiseUG',   '+256700000004', crypt('demo1234', gen_salt('bf')), 'Uganda Premier League expert.',                  'AFCON · UPL · Premier League',      false, null);

-- ── TRANSACTIONS (ioTec Pay — tracks every collection/disbursement) ─
create table transactions (
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

create index idx_transactions_external on transactions(external_id);
create index idx_transactions_iotec    on transactions(iotec_id);
create index idx_transactions_status   on transactions(status, created_at desc);
create index idx_transactions_betslip  on transactions(betslip_id);

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger transactions_set_updated_at
  before update on transactions
  for each row execute function set_updated_at();

alter table transactions enable row level security;
create policy "transactions_service_only" on transactions for all using (true);

-- ── COUNTRIES (multi-market config — migration 0011) ──────────────
-- One row per market; each market lives on its own subdomain. Uganda
-- (UG) is the live default/fallback; other markets stay inactive /
-- coming-soon until flipped live. payments_enabled=false → the free
-- stub unlock flow instead of ioTec.
create table countries (
  code             text primary key,            -- ISO 3166-1 alpha-2, e.g. 'UG'
  name             text not null,
  subdomain        text not null unique,        -- 'ng' → ng.betfluencer.org
  currency_code    text not null,               -- ISO 4217, e.g. 'NGN'
  currency_symbol  text not null,               -- display prefix, e.g. '₦'
  betting_sites    text[] not null default '{}', -- ordered, most popular first
  payments_enabled boolean not null default false,
  active           boolean not null default false,
  coming_soon      boolean not null default true,
  created_at       timestamptz not null default now(),
  -- Per-market About-page copy (migration 0012). Shape = AboutContent in
  -- src/lib/aboutContent.ts; null → the app falls back to the code copy.
  about_content    jsonb
);

-- Tipster ↔ country visibility (many-to-many). Every pre-expansion
-- tipster is backfilled into UG.
create table tipster_countries (
  tipster_id   uuid not null references tipsters(id) on delete cascade,
  country_code text not null references countries(code) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (tipster_id, country_code)
);

create index idx_tipster_countries_country on tipster_countries (country_code);

-- Service-role only (no anon policies) — clients read country config via the API.
alter table countries         enable row level security;
alter table tipster_countries enable row level security;
