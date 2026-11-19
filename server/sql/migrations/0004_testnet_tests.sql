-- Tests Testnet exigés par la core team : une tentative par compte et par type (envoi A2U / réception U2A).
-- À supprimer avant le Mainnet avec le code de test.
create table public.testnet_tests (
  pi_uid text not null,
  kind text not null check (kind in ('payout','receive')),
  payment_id text,
  txid text,
  status text not null default 'started' check (status in ('started','done','failed')),
  created_at timestamptz not null default now(),
  primary key (pi_uid, kind)
);
alter table public.testnet_tests enable row level security;
