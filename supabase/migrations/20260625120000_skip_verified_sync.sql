-- ── Skip already-verified slips in the code-sync poller ───────────
-- A booking code's selections are immutable, so once a slip is
-- verified (has its match information) re-scraping it on every sync
-- cycle gains nothing and wastes scraper resources / risks IP blocks.
-- The poller now syncs only slips that still lack match info:
--   • verification_status 'pending'  → always retry
--   • verification_status 'failed'   → retry up to N times (counter below)
--   • 'verified' / 'rejected'        → never re-scraped
--
-- `verify_attempts` counts failed scrape attempts (worker ran but found
-- no selections — a bad/expired code). A worker that errors / is
-- unreachable does NOT increment it (not the code's fault).

alter table betslips
  add column if not exists verify_attempts int not null default 0;

-- Helps the poller's filter (result='pending' + status + attempts).
create index if not exists idx_betslips_verify_retry
  on betslips (verification_status, verify_attempts)
  where result = 'pending';

-- Atomically record one failed verification attempt: bump the counter and
-- flip a still-'pending' slip to 'failed'. Never touches 'verified' or
-- 'rejected' slips (the WHERE clause excludes them). Returns the new count.
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
