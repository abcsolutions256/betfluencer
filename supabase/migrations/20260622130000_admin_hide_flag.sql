-- ============================================================
-- 0007 — admin manual "hidden" flag on betslips
-- ============================================================
-- Kickoff times aren't reliable across bookies (some don't expose them), so
-- slips are no longer auto-hidden by kickoff. Instead the marketplace shows
-- ALL verified slips, and an admin manually removes stale/expired ones by
-- flipping this flag. Public feeds exclude hidden=true; the owning tipster
-- still sees them on their dashboard (tagged "Hidden").

alter table betslips add column if not exists hidden boolean not null default false;
create index if not exists idx_betslips_hidden on betslips(hidden) where hidden;
