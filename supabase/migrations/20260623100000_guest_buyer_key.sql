-- ============================================================
-- 0009 — anonymous (no-login) buyers: identify by a localStorage key
-- ============================================================
-- Buyers no longer log in. Each browser generates a random id stored in
-- localStorage ("bf_guest") and sends it as the x-buyer-key header; purchases
-- are keyed on it instead of auth.users. buyer_id stays (nullable) for any
-- legacy logged-in purchases. NOTE: localStorage is per-browser, so a guest's
-- purchases don't follow them across devices.

alter table slip_purchases add column if not exists buyer_key text;
create index if not exists idx_slip_purchases_buyer_key on slip_purchases(buyer_key);

-- One purchase row per slip + guest key (data integrity; the API also guards).
create unique index if not exists uniq_purchase_betslip_buyerkey on slip_purchases(betslip_id, buyer_key);
