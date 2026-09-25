-- Stall pickup orders: fulfilment method, pickup statuses, GST invoice
-- numbering, stock commitment on payment confirmation, and guards that stop a
-- customer's own session from confirming a payment.
-- Spec: docs/superpowers/specs/2026-09-25-stall-pickup-orders-design.md
--
-- No begin/commit on purpose: scripts/sql/test-pickup-orders.sql loads this
-- file inside a rolled-back transaction. Apply it as one transaction:
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20260925000000_stall_pickup_orders.sql
-- Every statement is idempotent, so the test harness can re-run it after it
-- has been applied.

-- ---------------------------------------------------------------------------
-- 1. orders: fulfilment, buyer name, invoice and stock columns
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists fulfilment_method text not null default 'delivery',
  add column if not exists customer_name text,
  add column if not exists invoice_number text,
  add column if not exists invoice_date timestamptz,
  add column if not exists place_of_supply text,
  add column if not exists stock_committed_at timestamptz;

alter table public.orders alter column shipping_address drop not null;

alter table public.orders drop constraint if exists orders_fulfilment_method_check;
alter table public.orders add constraint orders_fulfilment_method_check
  check (fulfilment_method in ('delivery', 'pickup'));

alter table public.orders drop constraint if exists orders_delivery_requires_address;
alter table public.orders add constraint orders_delivery_requires_address
  check (fulfilment_method = 'pickup' or shipping_address is not null);

alter table public.orders drop constraint if exists orders_pickup_has_no_delivery_charge;
alter table public.orders add constraint orders_pickup_has_no_delivery_charge
  check (fulfilment_method = 'delivery' or delivery_charge = 0);

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('payment_pending', 'verifying_payment', 'payment_confirmed', 'processing',
                    'ready_for_pickup', 'collected', 'shipped', 'delivered', 'cancelled', 'refunded'));

alter table public.orders drop constraint if exists orders_pickup_statuses_only_for_pickup;
alter table public.orders add constraint orders_pickup_statuses_only_for_pickup
  check (status not in ('ready_for_pickup', 'collected') or fulfilment_method = 'pickup');

alter table public.orders drop constraint if exists orders_shipping_statuses_only_for_delivery;
alter table public.orders add constraint orders_shipping_statuses_only_for_delivery
  check (status not in ('shipped', 'delivered') or fulfilment_method = 'delivery');

alter table public.orders drop constraint if exists orders_place_of_supply_format;
alter table public.orders add constraint orders_place_of_supply_format
  check (place_of_supply is null or place_of_supply ~ '^[0-9]{2}$');

create unique index if not exists orders_invoice_number_key on public.orders (invoice_number);
create index if not exists orders_pickup_queue_idx
  on public.orders (status, created_at) where fulfilment_method = 'pickup';

-- The legacy session-confirm path copies checkout_sessions into orders.
alter table public.checkout_sessions
  add column if not exists fulfilment_method text not null default 'delivery';
alter table public.checkout_sessions drop constraint if exists checkout_sessions_fulfilment_method_check;
alter table public.checkout_sessions add constraint checkout_sessions_fulfilment_method_check
  check (fulfilment_method in ('delivery', 'pickup'));

-- ---------------------------------------------------------------------------
-- 2. payments: cash is a payment method
-- ---------------------------------------------------------------------------
alter table public.payments drop constraint if exists payments_payment_method_check;
alter table public.payments add constraint payments_payment_method_check
  check (payment_method in ('credit_card', 'debit_card', 'net_banking', 'upi', 'wallet',
                            'cod', 'emi', 'bank_transfer', 'cash'));

-- ---------------------------------------------------------------------------
-- 3. Admin/internal tier tables: service_role only, no client grants
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_counters (
  financial_year text primary key check (financial_year ~ '^[0-9]{2}-[0-9]{2}$'),
  last_seq integer not null check (last_seq > 0)
);
alter table public.invoice_counters enable row level security;
alter table public.invoice_counters force row level security;
revoke all on public.invoice_counters from anon, authenticated;

create table if not exists public.order_status_events (
  id bigserial primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  actor_admin_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists order_status_events_order_idx
  on public.order_status_events (order_id, created_at desc);
create index if not exists order_status_events_actor_idx
  on public.order_status_events (actor_admin_id);
alter table public.order_status_events enable row level security;
alter table public.order_status_events force row level security;
revoke all on public.order_status_events from anon, authenticated;
revoke all on sequence public.order_status_events_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Financial year label, e.g. '25-26'. The year starts 1 April, IST.
-- ---------------------------------------------------------------------------
create or replace function public.gst_financial_year(p_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select lpad((s.y % 100)::text, 2, '0') || '-' || lpad(((s.y + 1) % 100)::text, 2, '0')
    from (select extract(year from ((p_at at time zone 'Asia/Kolkata') - interval '3 months'))::int as y) s
$$;
revoke all on function public.gst_financial_year(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4b. Order line → variant. The server-resolved sku first, then
--     (product, size) for lines written before sku was populated. Null when
--     the line matches no variant (e.g. an admin-app item without a size).
-- ---------------------------------------------------------------------------
create or replace function public.order_item_variant_slug(p_sku text, p_product_id text, p_size text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select v.slug from public.product_variants v where v.slug = p_sku),
    (select v.slug from public.product_variants v
      where v.product_slug = p_product_id and v.size_slug = lower(p_size)
      order by v.slug
      limit 1)
  )
$$;
revoke all on function public.order_item_variant_slug(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Stock + invoice on payment confirmation
--    Unpaid → paid: decrement each line's variant (never below 0) and issue
--    the invoice number. Paid → unpaid/cancelled/refunded: return the stock.
-- ---------------------------------------------------------------------------
create or replace function public.orders_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  paid   constant text[] := array['payment_confirmed', 'processing', 'ready_for_pickup',
                                  'collected', 'shipped', 'delivered'];
  item record;
  fy text;
  seq int;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Entering a paid state from any unpaid one (payment_pending,
  -- verifying_payment, or a reinstated cancelled/refunded order).
  if not (old.status = any(paid)) and new.status = any(paid) then
    if new.stock_committed_at is null then
      for item in
        select oi.name, oi.size, oi.quantity,
               public.order_item_variant_slug(oi.sku, oi.product_id, oi.size) as variant_slug
          from public.order_items oi
         where oi.order_id = new.id
         order by variant_slug
      loop
        -- A line that matches no variant is left untracked rather than
        -- blocking the confirmation of a real payment.
        continue when item.variant_slug is null;
        update public.product_variants v
           set stock_quantity = v.stock_quantity - item.quantity
         where v.slug = item.variant_slug
           and v.stock_quantity >= item.quantity;
        if not found then
          raise exception 'OUT_OF_STOCK:%', trim(item.name || ' ' || coalesce(item.size, ''))
            using errcode = 'P0001';
        end if;
      end loop;
      new.stock_committed_at := now();
    end if;

    if new.invoice_number is null then
      fy := public.gst_financial_year(now());
      insert into public.invoice_counters as c (financial_year, last_seq)
      values (fy, 1)
      on conflict (financial_year) do update set last_seq = c.last_seq + 1
      returning c.last_seq into seq;
      new.invoice_number := 'CB/' || fy || '/' || lpad(seq::text, greatest(4, length(seq::text)), '0');
      new.invoice_date := now();
    end if;
  end if;

  -- Leaving a paid state (webhook revert, cancel, refund): return the stock.
  if old.status = any(paid)
     and not (new.status = any(paid))
     and new.stock_committed_at is not null then
    for item in
      select oi.quantity,
             public.order_item_variant_slug(oi.sku, oi.product_id, oi.size) as variant_slug
        from public.order_items oi
       where oi.order_id = new.id
       order by variant_slug
    loop
      continue when item.variant_slug is null;
      update public.product_variants v
         set stock_quantity = v.stock_quantity + item.quantity
       where v.slug = item.variant_slug;
    end loop;
    new.stock_committed_at := null;
  end if;

  return new;
end;
$$;
revoke all on function public.orders_on_status_change() from public, anon, authenticated;

drop trigger if exists orders_on_status_change on public.orders;
create trigger orders_on_status_change
  before update of status on public.orders
  for each row execute function public.orders_on_status_change();

-- ---------------------------------------------------------------------------
-- 6. Client-write guards. SECURITY INVOKER on purpose: current_user is the
--    caller, so the service role, postgres and the admin app pass straight
--    through and only the customer's own session is restricted.
--    Trigger names sort before orders_on_status_change / trigger_* so the
--    guard sees the caller's row before any other BEFORE trigger edits it.
-- ---------------------------------------------------------------------------
create or replace function public.guard_client_order_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  editable constant text[] := array['status', 'notes', 'updated_at'];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('payment_pending', 'verifying_payment')
       or new.invoice_number is not null
       or new.invoice_date is not null
       or new.stock_committed_at is not null
       or new.placed_by_admin_id is not null then
      raise exception 'CLIENT_WRITE_FORBIDDEN: orders insert' using errcode = '42501';
    end if;
    return new;
  end if;

  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'CLIENT_WRITE_FORBIDDEN: orders columns' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and not (old.status = 'payment_pending' and new.status = 'verifying_payment') then
    raise exception 'CLIENT_WRITE_FORBIDDEN: orders status % -> %', old.status, new.status
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_guard_client_write on public.orders;
create trigger orders_guard_client_write
  before insert or update on public.orders
  for each row execute function public.guard_client_order_write();

create or replace function public.guard_client_payment_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- net_amount is a stored generated column: NULL in NEW inside a BEFORE
  -- trigger, so it must be ignored or every customer update looks like an edit.
  editable constant text[] := array['gateway_response', 'failure_reason', 'card_last_four',
    'card_brand', 'card_type', 'upi_id', 'bank_name', 'bank_reference', 'notes', 'updated_at',
    'net_amount'];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('pending', 'processing') or new.payment_method = 'cash' then
      raise exception 'CLIENT_WRITE_FORBIDDEN: payments insert' using errcode = '42501';
    end if;
    return new;
  end if;

  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'CLIENT_WRITE_FORBIDDEN: payments columns' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_guard_client_write on public.payments;
create trigger payments_guard_client_write
  before insert or update on public.payments
  for each row execute function public.guard_client_payment_write();

-- Items may only be added while the parent order is unpaid.
drop policy if exists order_items_insert_own on public.order_items;
create policy order_items_insert_own on public.order_items
  for insert to authenticated
  with check (exists (
    select 1
      from public.orders o
     where o.id = order_items.order_id
       and o.user_id = (select auth.uid())
       and o.status in ('payment_pending', 'verifying_payment')
  ));
