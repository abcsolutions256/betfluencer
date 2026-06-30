-- ── slip_purchases: allow a 'pending' status (created before payment confirms) ─
alter table slip_purchases drop constraint if exists slip_purchases_status_check;
alter table slip_purchases add  constraint slip_purchases_status_check
  check (status in ('pending','active','refunded'));
alter table slip_purchases alter column status set default 'pending';

-- ── TRANSACTIONS (ioTec Pay — tracks every collection/disbursement) ─
create table if not exists transactions (
  id                 uuid primary key default uuid_generate_v4(),
  iotec_id           text unique,                       -- ioTec collection id (= status requestId)
  external_id        text unique not null,              -- our reconciliation ref
  type               text not null default 'collection' check (type in ('collection','disbursement')),
  method             text check (method in ('momo','card')),
  category           text default 'MobileMoney',
  purpose            text default 'slip_purchase',
  betslip_id         uuid references betslips(id) on delete set null,
  tipster_id         uuid references tipsters(id) on delete set null,
  slip_purchase_id   uuid references slip_purchases(id) on delete set null,
  user_phone         text,
  user_email         text,
  payer              text,
  amount             integer not null,
  currency           text not null default 'UGX',
  status             text not null default 'pending'
                     check (status in ('pending','processing','success','failed','cancelled')),
  iotec_status       text,
  status_message     text,
  card_redirect_url  text,
  transaction_charge numeric(12,2),
  raw                jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists idx_transactions_external on transactions(external_id);
create index if not exists idx_transactions_iotec    on transactions(iotec_id);
create index if not exists idx_transactions_status   on transactions(status, created_at desc);
create index if not exists idx_transactions_betslip  on transactions(betslip_id);

-- keep updated_at fresh
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists transactions_set_updated_at on transactions;
create trigger transactions_set_updated_at
  before update on transactions
  for each row execute function set_updated_at();

alter table transactions enable row level security;
drop policy if exists "transactions_service_only" on transactions;
create policy "transactions_service_only" on transactions for all using (true);
