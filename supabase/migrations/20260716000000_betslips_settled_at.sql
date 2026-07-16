-- ── 0013: betslips.settled_at ────────────────────────────────────
-- Additive: when a slip's result was last settled (win/loss/void).
-- NULL for pending slips. Stamped by the app at settle time
-- (api/verify, api/admin/settle, api/admin/review) and cleared when
-- an admin resets a slip back to pending.
--
-- Powers the marketplace "Wins" view: winning slips settled within a
-- rolling 24-hour window, computed at query time.
alter table betslips add column if not exists settled_at timestamptz;

-- Backfill already-settled slips with posted_at — the best available proxy.
-- Deliberately NOT now(): that would flood the new Wins view with every
-- historical win for 24h after deploy. With posted_at, old wins stay out
-- of the rolling window and all future settles are exact.
update betslips
  set settled_at = posted_at
  where result in ('win','loss','void') and settled_at is null;

-- Cheap partial index for the rolling-window wins query.
create index if not exists idx_betslips_settled_win
  on betslips (settled_at desc) where result = 'win';
