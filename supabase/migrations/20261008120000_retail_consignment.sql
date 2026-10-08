-- Retail consignment (sale-or-return to GST-registered shops). Spec:
-- docs/superpowers/specs/2026-10-08-retail-consignment-design.md.
-- Admin/internal tier (CLAUDE.md, Database Security Conventions): no grants to
-- anon/authenticated, RLS forced, no policies. Written only through the
-- functions in 20261008120100_retail_consignment_functions.sql (service role),
-- which /api/admin/retail/* calls after getUser() + isAdmin().
-- Idempotent, so scripts/sql/test-retail.sql can load it again.

create table if not exists public.retailers (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (length(trim(legal_name)) between 1 and 200),
  trade_name text check (trade_name is null or length(trade_name) <= 200),
  gstin text not null unique check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  state_code text generated always as (left(gstin, 2)) stored,
  address text not null check (length(trim(address)) between 1 and 500),
  contact_name text check (contact_name is null or length(contact_name) <= 100),
  phone text check (phone is null or length(phone) <= 20),
  email text check (email is null or length(email) <= 200),
  our_share_pct numeric(5, 2) not null default 75 check (our_share_pct > 0 and our_share_pct < 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consignment_docs (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.retailers(id) on delete restrict,
  kind text not null check (kind in ('challan', 'sale', 'return')),
  status text not null default 'draft' check (status in ('draft', 'issued', 'cancelled')),
  -- Null until issued; a sale with no lines ("nothing sold") stays null when issued.
  number text unique,
  doc_date date not null,
  period text check (period is null or period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  share_pct numeric(5, 2) check (share_pct is null or (share_pct > 0 and share_pct < 100)),
  note text check (note is null or length(note) <= 500),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  cancelled_at timestamptz,
  constraint consignment_docs_period_only_for_sales check ((kind = 'sale') = (period is not null)),
  -- Drafts are deleted, never cancelled, so anything past draft was issued.
  constraint consignment_docs_issued_has_time check (status = 'draft' or issued_at is not null)
);

create unique index if not exists consignment_docs_one_open_sale
  on public.consignment_docs (retailer_id, period)
  where kind = 'sale' and status <> 'cancelled';
create index if not exists consignment_docs_retailer_idx
  on public.consignment_docs (retailer_id, kind, status);
create index if not exists consignment_docs_date_idx
  on public.consignment_docs (kind, doc_date);

create table if not exists public.consignment_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.consignment_docs(id) on delete cascade,
  variant_slug text not null references public.product_variants(slug) on update cascade on delete restrict,
  product_name text not null,
  size text not null,
  quantity integer not null check (quantity > 0),
  -- Challan lines: the MRP on the tag. Sale and return lines: copied from their batch.
  mrp_paise integer not null check (mrp_paise > 0),
  -- Required on sale and return lines: the issued challan line (batch) they draw on.
  batch_line_id uuid references public.consignment_lines(id) on delete restrict,
  -- Sale lines only, set when the sale is issued.
  unit_price_paise integer check (unit_price_paise is null or unit_price_paise > 0)
);

create index if not exists consignment_lines_doc_idx on public.consignment_lines (doc_id);
create index if not exists consignment_lines_batch_idx on public.consignment_lines (batch_line_id);
create index if not exists consignment_lines_variant_idx on public.consignment_lines (variant_slug);

create table if not exists public.retailer_payments (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.retailers(id) on delete restrict,
  doc_id uuid references public.consignment_docs(id) on delete restrict,
  amount_paise integer not null check (amount_paise > 0),
  paid_on date not null,
  method text not null check (method in ('upi', 'bank', 'cash')),
  reference text check (reference is null or length(reference) <= 100),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists retailer_payments_retailer_idx on public.retailer_payments (retailer_id);

-- Gap-free numbering per series and financial year, like invoice_counters.
create table if not exists public.consignment_counters (
  series text not null check (series in ('CBC', 'CBR', 'RET')),
  financial_year text not null check (financial_year ~ '^[0-9]{2}-[0-9]{2}$'),
  last_seq integer not null check (last_seq > 0),
  primary key (series, financial_year)
);

-- What each shop still holds of each batch (issued challan line):
-- sent − issued sales − issued returns. Computed, never stored.
create or replace view public.retailer_batch_balances
with (security_invoker = true) as
select l.id as batch_line_id,
       d.retailer_id,
       l.variant_slug,
       l.product_name,
       l.size,
       l.mrp_paise,
       d.doc_date as sent_on,
       d.number as challan_number,
       l.quantity as sent,
       l.quantity - coalesce((
         select sum(u.quantity)
           from public.consignment_lines u
           join public.consignment_docs ud on ud.id = u.doc_id
          where u.batch_line_id = l.id
            and ud.status = 'issued'
       ), 0)::integer as held
  from public.consignment_lines l
  join public.consignment_docs d on d.id = l.doc_id
 where d.kind = 'challan'
   and d.status = 'issued';

do $$
declare t text;
begin
  foreach t in array array['retailers', 'consignment_docs', 'consignment_lines',
                           'retailer_payments', 'consignment_counters'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end $$;
revoke all on table public.retailer_batch_balances from public, anon, authenticated;

grant select, insert, update on table public.retailers to service_role;
grant select, insert, update, delete on table public.consignment_docs to service_role;
grant select, insert, update, delete on table public.consignment_lines to service_role;
grant select, insert, delete on table public.retailer_payments to service_role;
grant select, insert, update on table public.consignment_counters to service_role;
grant select on table public.retailer_batch_balances to service_role;
