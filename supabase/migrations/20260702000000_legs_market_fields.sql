-- ============================================================================
-- 20260702000000 — betslip_legs market fields (team-total verification)
-- ============================================================================
-- PURPOSE
--   Screenshot-parsed legs need to distinguish a TEAM total ("Croatia Over 0.5
--   goals") from a MATCH total ("Over 2.5"). The parser now emits market /
--   market_subject / side / line per leg; these columns persist them so the
--   auto-verifier (src/lib/footballApi.ts) can settle a team total off that
--   team's goals instead of the match total.
--
-- TARGET
--   main's PROD DB (already has betslip_legs with real rows).
--
-- PROPERTIES
--   Idempotent      — add column IF NOT EXISTS.
--   Additive        — four nullable columns; existing rows get NULL and keep
--                     verifying via the legacy pick-string path (non-breaking).
--   Non-destructive — no data touched.
-- ============================================================================

alter table betslip_legs add column if not exists market         text;
alter table betslip_legs add column if not exists market_subject text;
alter table betslip_legs add column if not exists side           text;
alter table betslip_legs add column if not exists line           numeric(6,2);
