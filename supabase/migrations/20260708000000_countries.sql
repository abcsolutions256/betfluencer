-- ── Multi-country support (migration 0011) ────────────────────────
-- One codebase / one DB serves several markets, each on its own
-- subdomain (ug.betfluencer.org, ng.betfluencer.org, …). Per-country
-- config lives in `countries`; tipster visibility per market lives in
-- `tipster_countries` (many-to-many — a tipster can be in several).
--
-- STRICTLY ADDITIVE — staging and production share this database.
-- No existing table/row is altered or deleted. Every statement is
-- idempotent (if not exists / on conflict do nothing) so re-running is
-- safe. Full rollback = drop the two new tables:
--   drop table if exists tipster_countries; drop table if exists countries;
--
-- Uganda is the live market and the app-side default/fallback: it is
-- seeded payments_enabled=true + active=true; all other markets are
-- seeded inactive/coming-soon and stay non-public until flipped live
-- with a manual UPDATE (no deploy needed).

-- ── COUNTRIES (per-market config) ─────────────────────────────────
create table if not exists countries (
  code             text primary key,            -- ISO 3166-1 alpha-2, e.g. 'UG'
  name             text not null,
  subdomain        text not null unique,        -- 'ng' → ng.betfluencer.org
  currency_code    text not null,               -- ISO 4217, e.g. 'NGN'
  currency_symbol  text not null,               -- display prefix, e.g. '₦'
  betting_sites    text[] not null default '{}', -- ordered, most popular first
  payments_enabled boolean not null default false, -- false → free/stub unlock flow
  active           boolean not null default false, -- live market (geo-redirect target)
  coming_soon      boolean not null default true,  -- shown on picker, not clickable
  created_at       timestamptz not null default now()
);

-- ── TIPSTER ↔ COUNTRY link (many-to-many) ─────────────────────────
create table if not exists tipster_countries (
  tipster_id   uuid not null references tipsters(id) on delete cascade,
  country_code text not null references countries(code) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (tipster_id, country_code)
);

create index if not exists idx_tipster_countries_country
  on tipster_countries (country_code);

-- ── SEED all five markets ─────────────────────────────────────────
-- UG betting_sites order = the current BETTING_SITES order in
-- src/lib/bettingSites.ts (unchanged behaviour). Other markets reorder
-- the SAME eight sites by local popularity — never a different set,
-- so every site the bet-code worker supports stays reachable everywhere.
insert into countries
  (code, name, subdomain, currency_code, currency_symbol, betting_sites, payments_enabled, active, coming_soon)
values
  ('UG', 'Uganda',       'ug', 'UGX', 'UGX',
    array['Betika','betPawa','1xBet','22Bet','SportPesa','MozzartBet','SportyBet','Betway'],
    true,  true,  false),
  ('NG', 'Nigeria',      'ng', 'NGN', '₦',
    array['SportyBet','1xBet','Betway','22Bet','betPawa','MozzartBet','Betika','SportPesa'],
    false, false, true),
  ('GH', 'Ghana',        'gh', 'GHS', 'GH₵',
    array['SportyBet','Betway','1xBet','betPawa','22Bet','MozzartBet','Betika','SportPesa'],
    false, false, true),
  ('ZA', 'South Africa', 'za', 'ZAR', 'R',
    array['Betway','SportyBet','1xBet','22Bet','betPawa','MozzartBet','Betika','SportPesa'],
    false, false, true),
  ('KE', 'Kenya',        'ke', 'KES', 'KSh',
    array['Betika','SportPesa','betPawa','MozzartBet','1xBet','22Bet','SportyBet','Betway'],
    false, false, true)
on conflict (code) do nothing;

-- ── BACKFILL: every existing tipster belongs to Uganda ────────────
-- Current data untouched; UG views show exactly the tipsters they show
-- today. Idempotent via the composite PK + on conflict.
insert into tipster_countries (tipster_id, country_code)
select id, 'UG' from tipsters
on conflict (tipster_id, country_code) do nothing;

-- ── RLS: service-role only (matches the hardened posture) ─────────
-- No anon/authenticated policies → only the server (service role) reads
-- these; clients get country config via the API. Nothing sensitive here,
-- but we keep the "no using(true)" rule from migrations 0003/0005.
alter table countries         enable row level security;
alter table tipster_countries enable row level security;
