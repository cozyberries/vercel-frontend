-- GST sales register (spec: docs/superpowers/specs/2026-10-03-gst-sales-register-design.md).
-- 1. orders.invoice_voided_at: when an invoiced order left a paid status, so a
--    month's register can be rebuilt "as at month end".
-- 2. orders_on_status_change stamps it on leaving a paid status and clears it
--    on re-entering one (redefined from 20260925020000; otherwise unchanged).
-- 3. guard_client_order_write refuses it on a customer INSERT (redefined from
--    20260925000000; the UPDATE path already refuses every non-editable column).
-- 4. backfill_invoice_numbers(): numbers paid orders that predate invoice numbering.
-- 5. Numbers every paid order since GST registration (1 Sep 2026) that has none.
-- 6. Dates any invoice already voided before this migration.
-- Idempotent: safe to run twice (scripts/sql/test-sales-register.sql does).

alter table public.orders add column if not exists invoice_voided_at timestamptz;
comment on column public.orders.invoice_voided_at is
  'When this invoiced order last left a paid status (cancelled, refunded or reverted). Cleared when it is paid again. Set only by orders_on_status_change.';

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
    -- Line items must add up to the order's subtotal and carry a real price;
    -- otherwise items were added or changed after the order was placed.
    if exists (select 1 from public.order_items oi where oi.order_id = new.id and oi.price <= 0)
       or coalesce((select sum(oi.price * oi.quantity) from public.order_items oi where oi.order_id = new.id), 0)
          <> new.subtotal then
      raise exception 'ITEMS_MISMATCH:%', new.order_number using errcode = 'P0001';
    end if;

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

    -- A reinstated invoice is valid again; it keeps its number and date.
    new.invoice_voided_at := null;
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

  -- Leaving a paid state voids the invoice as at now. Independent of stock:
  -- orders paid before stock tracking have no stock_committed_at.
  if old.status = any(paid)
     and not (new.status = any(paid))
     and new.invoice_number is not null then
    new.invoice_voided_at := now();
  end if;

  return new;
end;
$$;
revoke all on function public.orders_on_status_change() from public, anon, authenticated;

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
       or new.invoice_voided_at is not null
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

-- Numbers paid orders that have no invoice number and were paid on or after
-- p_from, in paid-time order, each dated with its paid time. Paid time is the
-- earliest completed payment, else stock_committed_at, else created_at.
-- Returns how many it numbered; a second run numbers nothing.
create or replace function public.backfill_invoice_numbers(p_from timestamptz)
returns int
language plpgsql
set search_path = ''
as $$
declare
  paid constant text[] := array['payment_confirmed', 'processing', 'ready_for_pickup',
                                'collected', 'shipped', 'delivered'];
  rec record;
  fy text;
  seq int;
  n int := 0;
begin
  for rec in
    select o.id, t.paid_at
      from public.orders o
      cross join lateral (
        select coalesce(
                 (select min(coalesce(p.completed_at, p.updated_at, p.created_at))
                    from public.payments p
                   where p.order_id = o.id and p.status = 'completed'),
                 o.stock_committed_at,
                 o.created_at) as paid_at
      ) t
     where o.status = any(paid)
       and o.invoice_number is null
       and t.paid_at >= p_from
     order by t.paid_at, o.order_number
  loop
    fy := public.gst_financial_year(rec.paid_at);
    insert into public.invoice_counters as c (financial_year, last_seq)
    values (fy, 1)
    on conflict (financial_year) do update set last_seq = c.last_seq + 1
    returning c.last_seq into seq;
    update public.orders
       set invoice_number = 'CB/' || fy || '/' || lpad(seq::text, greatest(4, length(seq::text)), '0'),
           invoice_date = rec.paid_at
     where id = rec.id
       and invoice_number is null;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.backfill_invoice_numbers(timestamptz) from public, anon, authenticated;

-- GST registration took effect in September 2026.
do $$
begin
  perform public.backfill_invoice_numbers(timestamptz '2026-09-01 00:00:00+05:30');
end $$;

-- Invoices voided before this column existed: date them from the latest status
-- event into their current status, else updated_at.
update public.orders o
   set invoice_voided_at = coalesce(
         (select max(e.created_at)
            from public.order_status_events e
           where e.order_id = o.id and e.to_status = o.status),
         o.updated_at)
 where o.invoice_number is not null
   and o.invoice_voided_at is null
   and not (o.status = any (array['payment_confirmed', 'processing', 'ready_for_pickup',
                                  'collected', 'shipped', 'delivered']));
