-- ============================================================
-- 0006 — persist the Gemini-normalised slip JSON
-- ============================================================
-- The bet-code worker's /verify now returns a `normalized` array
-- (canonical market, pick symbol 1/X/2, home=1/away=2, ISO kickoff,
-- odds) plus a `summary` and `total_odds`. We store them next to the
-- raw scrape in slip_verifications so a slip's real contents are
-- verifiable and can be revealed to a buyer post-purchase.
--
-- slip_verifications is ALREADY service-role-only (RLS enabled, no anon
-- policy — migration 0004), so the picks in `normalized` never reach the
-- public feed. Public PROOF on betslips (game_count / markets /
-- earliest_kickoff / total_odds) is derived from this normalised data;
-- the picks themselves surface only via /api/slips/[id]/reveal after a
-- purchase.

alter table slip_verifications add column if not exists normalized jsonb not null default '[]'::jsonb;
alter table slip_verifications add column if not exists summary    text;
alter table slip_verifications add column if not exists total_odds numeric;
