-- ============================================================
-- 0008 — ensure slip_purchases buyer linkage (0005 was partially applied)
-- ============================================================
-- Symptom: buying a slip created NO slip_purchases row (the table stayed
-- empty) and /reveal returned "Not purchased". Cause: /api/payments/initiate
-- upserts the purchase with buyer_id + onConflict(betslip_id,buyer_id), but
-- migration 0005's slip_purchases changes (buyer_id column + the unique index)
-- weren't applied to this DB, so the upsert errored. These statements are
-- idempotent and safe to run anytime.

alter table slip_purchases add column if not exists buyer_id uuid references auth.users(id) on delete set null;
create index if not exists idx_slip_purchases_buyer on slip_purchases(buyer_id);

-- The ON CONFLICT target the purchase upsert needs (one row per slip+buyer).
create unique index if not exists uniq_purchase_betslip_buyer on slip_purchases(betslip_id, buyer_id);
