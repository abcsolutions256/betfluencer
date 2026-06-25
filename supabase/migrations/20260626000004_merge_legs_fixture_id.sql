-- ============================================================================
-- MERGE 20260626000004 — betslip_legs.fixture_id (activates getFixtureById path)
-- ============================================================================
-- PURPOSE
--   main:src/lib/footballApi.ts:110-114 has a preferred but DEAD settlement path
--   (getFixtureById via leg.fixture_id) that never runs because no fixture_id
--   column exists on either branch. Adding betslip_legs.fixture_id bigint
--   (nullable) activates the reliable football-API settlement path and lets the
--   bet-code worker pin the exact API-Football fixture for a scraped leg.
--
-- TARGET
--   main's PROD DB (already has betslip_legs with real rows).
--
-- PROPERTIES
--   Idempotent      — add column IF NOT EXISTS.
--   Additive        — a single nullable column.
--   Non-destructive — existing rows get NULL fixture_id; no data touched.
-- ============================================================================

alter table betslip_legs add column if not exists fixture_id bigint;
