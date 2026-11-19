create extension if not exists pgcrypto with schema extensions;

-- Référentiels (22 pays, 19 devises validés)
create table public.currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  decimals smallint not null check (decimals in (0,2,3)),
  name text not null,
  label text not null
);
create table public.countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  currency_code text not null references public.currencies(code)
);

-- Utilisateurs (identité Pi vérifiée côté serveur)
create table public.users (
  id uuid primary key default gen_random_uuid(),
  pi_uid text not null unique,
  pi_username text,
  created_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  country_code text not null references public.countries(code),
  default_currency text not null references public.currencies(code),
  mode text not null default 'pi_only' check (mode in ('pi_only','web')),
  address text,
  tax_id text,
  contact text,
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 365),
  payment_instructions text,
  legal_mentions text,
  created_at timestamptz not null default now()
);
create index businesses_owner_idx on public.businesses(owner_id);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  country_code text references public.countries(code),
  address text,
  tax_id text,
  contact text,
  created_at timestamptz not null default now()
);
create index clients_business_idx on public.clients(business_id);

create table public.invoice_counters (
  business_id uuid not null references public.businesses(id) on delete cascade,
  series text not null,
  last_number bigint not null default 0,
  primary key (business_id, series)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  kind text not null default 'invoice' check (kind in ('invoice','credit_note')),
  original_invoice_id uuid references public.invoices(id),
  number text,
  status text not null default 'draft' check (status in
    ('draft','issued','sent','pending_payment','partially_paid','paid','overdue','cancelled','credit_issued')),
  currency_code text not null references public.currencies(code),
  tax_mode text not null default 'exclusive' check (tax_mode in ('exclusive','inclusive')),
  issue_date date,
  due_date date,
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  tax_total_minor bigint not null default 0 check (tax_total_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),
  note text,
  created_at timestamptz not null default now(),
  check (total_minor = subtotal_minor + tax_total_minor),
  check (kind = 'invoice' or original_invoice_id is not null),
  check (status = 'draft' or number is not null),
  unique (business_id, number)
);
create index invoices_business_idx on public.invoices(business_id, created_at desc);
create index invoices_client_idx on public.invoices(client_id);
create index invoices_original_idx on public.invoices(original_invoice_id);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  position integer not null check (position >= 1),
  description text not null check (length(description) between 1 and 500),
  quantity_milli bigint not null check (quantity_milli >= 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  discount_type text check (discount_type in ('percent','fixed')),
  discount_value bigint check (discount_value >= 0),
  tax_rate_bps integer not null check (tax_rate_bps between 0 and 100000),
  gross_minor bigint not null check (gross_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  base_minor bigint not null check (base_minor >= 0),
  unique (invoice_id, position)
);

-- Liens de partage : seul le hash du jeton est stocké
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index share_links_invoice_idx on public.share_links(invoice_id);

-- Tentatives de paiement Pi (distinctes du statut de la facture)
create table public.pi_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id),
  pi_payment_id text not null unique,
  network text not null check (network in ('Pi Network','Pi Testnet')),
  amount_pi numeric(20,7) not null check (amount_pi > 0),
  rate_pi_per_unit numeric(30,12),
  rate_source text,
  rate_at timestamptz,
  payer_pi_uid text,
  status text not null default 'created' check (status in ('created','approved','completed','cancelled','failed')),
  txid text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index pi_payments_invoice_idx on public.pi_payments(invoice_id);

-- Déclarations de paiement hors Pi (mode web) : vérification manuelle
create table public.payment_declarations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  reference_note text,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  declared_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index payment_declarations_invoice_idx on public.payment_declarations(invoice_id);

-- Lignes figées dès que la facture n'est plus un brouillon
create function public.guard_lines_when_issued() returns trigger
language plpgsql set search_path = '' as $$
declare inv uuid; st text;
begin
  inv := coalesce(new.invoice_id, old.invoice_id);
  select status into st from public.invoices where id = inv;
  if st is not null and st <> 'draft' then
    raise exception 'Les lignes d''une facture émise ne sont pas modifiables';
  end if;
  return coalesce(new, old);
end $$;
create trigger invoice_lines_guard before insert or update or delete on public.invoice_lines
  for each row execute function public.guard_lines_when_issued();

-- Numéro de facture atomique, jamais réutilisé
create function public.next_invoice_number(p_business uuid, p_series text) returns bigint
language sql set search_path = '' as $$
  insert into public.invoice_counters (business_id, series, last_number)
  values (p_business, p_series, 1)
  on conflict (business_id, series)
  do update set last_number = public.invoice_counters.last_number + 1
  returning last_number;
$$;
revoke execute on function public.next_invoice_number(uuid, text) from public, anon, authenticated;
revoke execute on function public.guard_lines_when_issued() from public, anon, authenticated;

-- RLS activée partout, aucune politique publique : seul le serveur (clé de service) accède aux données
alter table public.currencies enable row level security;
alter table public.countries enable row level security;
alter table public.users enable row level security;
alter table public.businesses enable row level security;
alter table public.clients enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.share_links enable row level security;
alter table public.pi_payments enable row level security;
alter table public.payment_declarations enable row level security;
