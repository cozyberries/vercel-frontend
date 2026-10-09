-- Best-seller order for the storefront catalog.
--
-- product_sales_ranks holds each product's position by units sold on paid
-- orders (all time, stall and online alike; the paid statuses are the ones
-- orders_on_status_change treats as paid). Equal sellers share a rank;
-- products with no paid sales have no row. Only the rank is stored, never the
-- unit counts, so the public catalog build (anon client) can read it without
-- exposing sales volumes.
--
-- Tier: catalogue (public read, no client writes). The table is rewritten by
-- refresh_product_sales_ranks(), run by statement-level triggers on orders and
-- order_items. That function is security definer and NOT callable over the
-- REST RPC surface (scripts/sql/security-probe.sql enforces this).

-- An earlier draft of this migration exposed the ranking as a callable
-- security definer function; it was applied to production on 2026-10-09 and
-- failed the security probe.
drop function if exists public.product_sales_ranking();

create table if not exists public.product_sales_ranks (
  product_slug text primary key,
  sales_rank integer not null check (sales_rank >= 1)
);

comment on table public.product_sales_ranks is
  'Storefront best-seller order: rank by units sold on paid orders, all time. Ranks only, no counts. Maintained by refresh_product_sales_ranks().';

alter table public.product_sales_ranks enable row level security;
revoke all on public.product_sales_ranks from anon, authenticated;
grant select on public.product_sales_ranks to anon, authenticated;
drop policy if exists product_sales_ranks_read on public.product_sales_ranks;
create policy product_sales_ranks_read on public.product_sales_ranks
  for select to anon, authenticated using (true);

create or replace function public.refresh_product_sales_ranks()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- One refresh at a time; a concurrent one waits and then sees the newer orders.
  perform pg_advisory_xact_lock(hashtext('public.product_sales_ranks'));
  delete from public.product_sales_ranks where true;
  insert into public.product_sales_ranks (product_slug, sales_rank)
  select oi.product_id,
         (rank() over (order by sum(oi.quantity) desc))::integer
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where o.status in ('payment_confirmed', 'processing', 'ready_for_pickup', 'collected', 'shipped', 'delivered')
     and oi.product_id is not null
   group by oi.product_id;
end $$;

create or replace function public.on_order_change_refresh_sales_ranks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_product_sales_ranks();
  return null;
end $$;

revoke all on function public.refresh_product_sales_ranks() from public, anon, authenticated;
revoke all on function public.on_order_change_refresh_sales_ranks() from public, anon, authenticated;

-- A status change moves an order into or out of the paid set; an item change
-- alters a paid order's units (admin edits). Statement level: one refresh per
-- statement, however many rows it touched.
drop trigger if exists orders_refresh_sales_ranks on public.orders;
create trigger orders_refresh_sales_ranks
  after insert or delete or update of status on public.orders
  for each statement execute function public.on_order_change_refresh_sales_ranks();

drop trigger if exists order_items_refresh_sales_ranks on public.order_items;
create trigger order_items_refresh_sales_ranks
  after insert or delete or update of quantity, product_id, order_id on public.order_items
  for each statement execute function public.on_order_change_refresh_sales_ranks();

select public.refresh_product_sales_ranks();
