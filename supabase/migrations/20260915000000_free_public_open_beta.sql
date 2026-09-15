-- ── Free & public "open beta" (migration 0014) ────────────────────
-- Strategy pivot: open Betfluencer to everyone at no cost.
--   • Payments PAUSED in every market (payments_enabled=false) — the app's
--     free-stub unlock path takes over; the reveal API de-paywalls itself
--     wherever payments_enabled is false (see src/app/api/slips/[id]/reveal).
--   • All five markets go PUBLIC (active=true, coming_soon=false) so tipsters
--     can sign up in their own country and viewers reach every subdomain.
--   • Public tipster self-signup ENABLED.
--
-- STRICTLY ADDITIVE / idempotent (only UPDATEs existing rows + one settings
-- upsert). No schema change. FULLY REVERSIBLE — the mirror is at the bottom.
-- The ioTec payment stack is untouched and dormant; flipping payments_enabled
-- back on per market restores the paywall automatically (no code change).

-- Pause payments in ALL markets. Uganda is admin-locked in the panel
-- (/api/admin/countries → 403), so this DB-side UPDATE is the only way to
-- flip it.
update countries set payments_enabled = false;

-- Open every market to the public.
update countries set active = true, coming_soon = false;

-- Open public tipster self-signup (default had been closed).
insert into platform_settings (key, value)
values ('public_signups_enabled', 'true')
on conflict (key) do update set value = excluded.value;

-- ── ROLLBACK (run manually to end the open beta) ──────────────────
-- update countries set payments_enabled = true  where code = 'UG';
-- update countries set active = false, coming_soon = true
--   where code in ('NG','GH','ZA','KE');
-- insert into platform_settings (key, value) values ('public_signups_enabled','false')
--   on conflict (key) do update set value = excluded.value;
