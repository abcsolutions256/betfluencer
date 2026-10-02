-- ── Settlement audit trail (migration 0016) ───────────────────────
-- Every change to a slip's/leg's settlement — whether an admin manual
-- override or an automated re-grade — records an immutable audit row here.
-- This is what lets an admin AUDIT auto-verification decisions after the fact
-- and safely overturn them, with a full who/what/when/why history.
--
-- Additive only: new table, no change to existing settlement columns. The
-- authoritative result still lives on betslips.result / betslip_legs.result;
-- this table is the append-only log beside it.

create table if not exists betslip_settlement_audit (
  id          uuid primary key default gen_random_uuid(),
  betslip_id  uuid not null references betslips(id) on delete cascade,
  leg_id      uuid references betslip_legs(id) on delete set null,
  actor       text not null default 'admin',   -- who: 'admin' | 'system'
  source      text not null,                    -- 'manual_override' | 'regrade' | 'auto'
  field       text not null default 'result',   -- 'result' | 'leg_result' | 'verification_status'
  old_value   text,
  new_value   text,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_settlement_audit_slip
  on betslip_settlement_audit (betslip_id, created_at desc);

-- RLS: service-role only (no anon/authenticated policy). The admin panel reads
-- and writes it through the service-role client behind requireRole('admin'),
-- exactly like betslip_secrets. Never expose this to the public API.
alter table betslip_settlement_audit enable row level security;
