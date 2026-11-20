-- Frais de service payés en Pi par l'entreprise qui facture : frais par facture ou abonnement.
create table public.service_payments (
  id uuid primary key default gen_random_uuid(),
  pi_payment_id text not null unique,
  kind text not null check (kind in ('invoice_fee','subscription')),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  network text not null check (network in ('Pi Network','Pi Testnet')),
  amount_pi text not null,
  payer_pi_uid text not null,
  status text not null default 'created' check (status in ('created','approved','completed','cancelled','failed')),
  txid text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index service_payments_invoice_idx on public.service_payments (invoice_id) where kind = 'invoice_fee' and status = 'completed';
alter table public.service_payments enable row level security;

create table public.service_subscriptions (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  active_until timestamptz not null
);
alter table public.service_subscriptions enable row level security;
