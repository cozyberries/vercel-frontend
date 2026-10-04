-- Admin price overrides: who discounted or raised an order's prices in shadow
-- mode, by how much and why. Admin/internal tier (CLAUDE.md, Database Security
-- Conventions): no grants to anon/authenticated, RLS forced, no policies.
-- Written by POST /api/orders with the service-role client it holds while an
-- admin is acting; read by /api/admin/orders, /api/admin/pickup-orders,
-- /api/payments/cash and /api/telegram/webhook (all service role).
-- A customer can read every column of their own orders row, so nothing about a
-- price raise may stay on it. Spec:
-- docs/superpowers/specs/2026-10-04-hide-admin-price-raise-design.md
--
-- No begin/commit on purpose: scripts/sql/test-order-price-overrides.sql loads
-- this file inside a rolled-back transaction. Apply it as one transaction:
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20261004120000_order_price_overrides.sql
-- Every statement is idempotent: re-run it after the code deploys to move any
-- override note the old code wrote in between.

create table if not exists public.order_price_overrides (
  order_id uuid primary key references public.orders(id) on delete cascade,
  mode text not null check (mode in ('amount', 'percent_off', 'percent_up')),
  percent numeric(4,1),
  -- ₹ taken off (discounts) or ₹ added (a raise). Null only for a raise
  -- backfilled from an old note: rounded raised prices hide the exact figure.
  amount numeric(10,2) check (amount is null or amount >= 0),
  catalogue_subtotal numeric(10,2) check (catalogue_subtotal is null or catalogue_subtotal >= 0),
  reason text check (reason is null or char_length(reason) <= 500),
  admin_id uuid,
  admin_email text,
  created_at timestamptz not null default now(),
  constraint order_price_overrides_percent_matches_mode
    check ((mode = 'amount') = (percent is null))
);

alter table public.order_price_overrides enable row level security;
alter table public.order_price_overrides force row level security;
revoke all on table public.order_price_overrides from public, anon, authenticated;
grant select, insert, delete on table public.order_price_overrides to service_role;

-- Backfill: until 2026-10-04 the override was written into orders.notes as a
-- first line "[ADMIN OVERRIDE by <email>]" + optional ": " + optional
-- "(−p% discount)" / "(+p% prices)" + optional reason. Move it into the table.
insert into public.order_price_overrides
  (order_id, mode, percent, amount, catalogue_subtotal, reason, admin_id, admin_email, created_at)
select c.order_id,
       c.mode,
       case when c.mode = 'amount' then null else c.percent end,
       case when c.mode = 'percent_up' then null else c.discount_amount end,
       case when c.mode = 'percent_up' then null else c.subtotal end,
       left(c.reason, 500),
       c.placed_by_admin_id,
       nullif(c.admin_email, ''),
       c.created_at
  from (
    select f.*,
           case when f.detail ~ '^\(\+[0-9]+(\.[0-9])?% prices\)' then 'percent_up'
                when f.detail ~ '^\(−[0-9]+(\.[0-9])?% discount\)' then 'percent_off'
                else 'amount' end as mode,
           substring(f.detail from '^\([+−]([0-9]+(?:\.[0-9])?)% (?:prices|discount)\)')::numeric as percent,
           nullif(btrim(regexp_replace(coalesce(f.detail, ''),
                                       '^\([+−][0-9]+(\.[0-9])?% (prices|discount)\)', '')), '') as reason
      from (
        select o.id as order_id, o.discount_amount, o.subtotal, o.placed_by_admin_id, o.created_at,
               substring(split_part(o.notes, E'\n', 1) from '^\[ADMIN OVERRIDE by ([^\]]*)\]') as admin_email,
               nullif(btrim(substring(split_part(o.notes, E'\n', 1)
                                      from '^\[ADMIN OVERRIDE by [^\]]*\](?:: )?(.*)$')), '') as detail
          from public.orders o
         where o.notes like '[ADMIN OVERRIDE by %'
      ) f
  ) c
on conflict (order_id) do nothing;

-- Strip the moved line and the retired ADMIN_PRICE_UP marker. updated_at must
-- not move: two orders collected on 2026-09-27 predate order_status_events, so
-- collectedAt() falls back to updated_at and would list them under today's
-- "Collected" tab. The trigger is off only inside this transaction.
alter table public.orders disable trigger trigger_orders_updated_at;

update public.orders o
   set notes = nullif(btrim(substr(o.notes, length(split_part(o.notes, E'\n', 1)) + 2)), ''),
       discount_code = case when o.discount_code = 'ADMIN_PRICE_UP' then null else o.discount_code end
 where o.notes like '[ADMIN OVERRIDE by %'
   and exists (select 1 from public.order_price_overrides r where r.order_id = o.id);

alter table public.orders enable trigger trigger_orders_updated_at;
