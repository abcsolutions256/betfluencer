-- ============================================================
-- 0004 — slip_verifications (bet-code worker results)
-- ============================================================
-- Stores what the headless-Chrome worker scraped for a booking code:
-- the structured matches + the raw section text, so a slip's real
-- contents can be verified against what the tipster claims.

create table slip_verifications (
  id           uuid primary key default uuid_generate_v4(),
  betslip_id   uuid references betslips(id) on delete cascade,   -- optional link
  betting_site text,
  booking_code text not null,
  matches      jsonb not null default '[]'::jsonb,   -- [{teams,league,market,pick,kickoff}]
  raw_text     text default '',                      -- fallback: the section's text
  screenshot_url text,                               -- debug screenshot from the worker
  match_count  integer not null default 0,
  found        boolean not null default false,   -- did entering the code return selections?
  status       text not null default 'scraped'
               check (status in ('scraped','failed','verified')),
  error        text,
  scraped_at   timestamptz default now()
);

-- One current verification row per betslip (upserted on betslip_id).
-- Postgres allows multiple NULLs, so manual one-off checks still append.
create unique index uniq_slip_verif_betslip on slip_verifications(betslip_id);
create index idx_slip_verif_code on slip_verifications(booking_code);

-- Service-role only (written by the API; never read by the anon key).
alter table slip_verifications enable row level security;
