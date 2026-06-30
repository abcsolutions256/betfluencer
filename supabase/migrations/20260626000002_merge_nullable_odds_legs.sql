-- ============================================================================
-- MERGE 20260626000002 — betslips.total_odds / leg_count → DROP NOT NULL (C1)
-- ============================================================================
-- PURPOSE
--   main's prod betslips declares total_odds and leg_count as NOT NULL
--   (total_odds numeric(8,2) NOT NULL; leg_count integer NOT NULL default 1).
--   A booking_code slip has NO odds/legs until the bet-code worker scrapes it,
--   so NOT NULL is incompatible with the booking-code feature. dev's nullable
--   version must win (collision C1). This loosens both constraints.
--
-- TARGET
--   main's PROD DB (already has betslips with the NOT NULL columns + real rows).
--
-- PROPERTIES
--   Idempotent      — DROP NOT NULL is a no-op once already dropped; safe twice.
--   Additive        — loosens a constraint only.
--   Non-destructive — existing non-null rows still satisfy the looser constraint;
--                     no data is touched. The leg_count default 1 is preserved.
-- ============================================================================

alter table betslips alter column total_odds drop not null;
alter table betslips alter column leg_count  drop not null;
