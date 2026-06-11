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
  id          uuid primary key default uuid_generate_v4(),
  betslip_id  uuid references betslips(id) on delete cascade,
  match       text not null,
  league      text default '',
  pick        text not null,
  odds        numeric(5,2) not null,
  match_time  timestamptz,
  result      text default 'pending' check (result in ('pending','win','loss'))
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
