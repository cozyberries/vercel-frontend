-- Stall pickup orders: refuse to confirm a payment when the order's line items
-- no longer add up to its subtotal or carry no price. A customer may add lines
-- to their own unpaid order (order_items_insert_own), so without this check a
-- ₹0 line added after checkout would take stock and be handed over for free.
-- Spec: docs/superpowers/specs/2026-09-25-stall-pickup-orders-design.md
--
-- Re-creates public.orders_on_status_change() from
-- 20260925000000_stall_pickup_orders.sql with one change: the ITEMS_MISMATCH
-- check at the start of the unpaid → paid branch.
--
-- No begin/commit on purpose: scripts/sql/test-pickup-orders.sql loads this
-- file inside a rolled-back transaction. Apply it as one transaction:
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20260925020000_pickup_items_integrity.sql
-- Every statement is idempotent, so the test harness can re-run it after it
-- has been applied.

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
