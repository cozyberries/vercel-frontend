-- Stall refills: which sold sizes staff have put back on the stall shelf, or
-- marked as having no stock left. Admin/internal tier (CLAUDE.md, Database
-- Security Conventions): no grants to anon/authenticated, RLS forced, no
-- policies. Read and written only through the three functions below, which
-- /api/admin/stall-refills calls with the service role after getUser() + isAdmin().
-- Idempotent, so scripts/sql/test-stall-refills.sql can load it again.

create table if not exists public.shelf_refills (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null,
  variant_slug text not null references public.product_variants(slug) on update cascade on delete cascade,
  action text not null check (action in ('refilled', 'no_stock')),
  quantity integer not null check (quantity > 0),
  -- no_stock only: the stock count before it was set to 0, so Undo can put it back.
  previous_stock integer check (previous_stock is null or previous_stock >= 0),
  acted_by uuid not null,
  -- Display only: captured from user_metadata, which users can edit.
  acted_by_name text not null,
  acted_at timestamptz not null default now(),
  constraint shelf_refills_previous_stock_only_for_no_stock
    check (action = 'no_stock' or previous_stock is null)
);

create index if not exists shelf_refills_variant_day_idx
  on public.shelf_refills (variant_slug, sale_date);

alter table public.shelf_refills enable row level security;
alter table public.shelf_refills force row level security;
revoke all on table public.shelf_refills from public, anon, authenticated;
grant select, insert, delete on table public.shelf_refills to service_role;

-- One row per (IST sale day, variant) for paid orders whose stock was committed
-- on or after p_since. Lines that match no variant come back with a null
-- variant_slug, grouped by product and size, so nothing sold goes unseen.
create or replace function public.stall_refill_lines(p_since date)
returns table (
  sale_date date,
  variant_slug text,
  product_slug text,
  item_name text,
  item_size text,
  sold integer,
  stock_now integer,
  handled integer,
  actions jsonb
)
language sql
stable
set search_path = ''
as $$
  with sold_items as (
    select (o.stock_committed_at at time zone 'Asia/Kolkata')::date as sale_date,
           public.order_item_variant_slug(oi.sku, oi.product_id, oi.size) as variant_slug,
           oi.product_id,
           oi.name,
           oi.size,
           oi.quantity
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
     where o.stock_committed_at >= (p_since::timestamp at time zone 'Asia/Kolkata')
       and o.status in ('payment_confirmed', 'processing', 'ready_for_pickup',
                        'collected', 'shipped', 'delivered')
  ),
  grouped as (
    select s.sale_date,
           s.variant_slug,
           min(s.product_id) as product_id,
           min(s.name) as item_name,
           min(s.size) as item_size,
           sum(s.quantity)::integer as sold
      from sold_items s
     group by s.sale_date,
              s.variant_slug,
              case when s.variant_slug is null then s.product_id end,
              case when s.variant_slug is null then lower(s.size) end
  )
  select g.sale_date,
         g.variant_slug,
         coalesce(v.product_slug, g.product_id) as product_slug,
         g.item_name,
         g.item_size,
         g.sold,
         v.stock_quantity as stock_now,
         coalesce(a.handled, 0)::integer as handled,
         coalesce(a.actions, '[]'::jsonb) as actions
    from grouped g
    left join public.product_variants v on v.slug = g.variant_slug
    left join lateral (
      select sum(r.quantity) as handled,
             jsonb_agg(jsonb_build_object(
                         'id', r.id,
                         'action', r.action,
                         'quantity', r.quantity,
                         'acted_by_name', r.acted_by_name,
                         'acted_at', r.acted_at)
                       order by r.acted_at, r.id) as actions
        from public.shelf_refills r
       where r.sale_date = g.sale_date
         and r.variant_slug = g.variant_slug
    ) a on true
   order by g.sale_date desc, g.item_name, g.item_size
$$;

-- Records Refilled or No stock left for the units of one variant still pending
-- on one day. An advisory lock per (day, variant) serialises two phones tapping
-- at once, so the same units are never ticked twice.
create or replace function public.stall_refill_record(
  p_sale_date date,
  p_variant_slug text,
  p_action text,
  p_quantity integer,
  p_acted_by uuid,
  p_acted_by_name text
)
returns public.shelf_refills
language plpgsql
set search_path = ''
as $$
declare
  v_sold integer;
  v_handled integer;
  v_pending integer;
  v_stock integer;
  v_row public.shelf_refills;
begin
  if p_action is null or p_action not in ('refilled', 'no_stock') then
    raise exception 'BAD_ACTION:%', coalesce(p_action, 'null') using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'BAD_QUANTITY' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('shelf_refill:' || p_sale_date::text || ':' || p_variant_slug));

  select l.sold, l.handled
    into v_sold, v_handled
    from public.stall_refill_lines(p_sale_date) l
   where l.sale_date = p_sale_date
     and l.variant_slug = p_variant_slug;
  if v_sold is null then
    raise exception 'NOT_SOLD:%', p_variant_slug using errcode = 'P0001';
  end if;

  v_pending := v_sold - v_handled;
  if v_pending <= 0 then
    raise exception 'NOTHING_TO_REFILL' using errcode = 'P0001';
  end if;

  if p_action = 'no_stock' then
    select v.stock_quantity
      into v_stock
      from public.product_variants v
     where v.slug = p_variant_slug
       for update;
    -- Already 0 (the last unit sold): skip the write so the catalog is not rebuilt for nothing.
    if v_stock <> 0 then
      update public.product_variants
         set stock_quantity = 0
       where slug = p_variant_slug;
    end if;
  end if;

  insert into public.shelf_refills
    (sale_date, variant_slug, action, quantity, previous_stock, acted_by, acted_by_name)
  values
    (p_sale_date, p_variant_slug, p_action, least(p_quantity, v_pending),
     case when p_action = 'no_stock' then v_stock end, p_acted_by, p_acted_by_name)
  returning * into v_row;

  return v_row;
end;
$$;

-- Removes one tick. Undoing No stock left puts the old count back only while
-- the stock is still 0 AND no later no_stock tick exists for the same variant
-- (on any sale_date): a later tick's previous_stock, not this one's, is the count
-- that matches the stock currently sitting at 0. If either condition fails, the
-- tick alone goes.
create or replace function public.stall_refill_undo(p_id uuid)
returns public.shelf_refills
language plpgsql
set search_path = ''
as $$
declare
  v_row public.shelf_refills;
begin
  delete from public.shelf_refills
   where id = p_id
  returning * into v_row;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_row.action = 'no_stock' and v_row.previous_stock > 0
     and not exists (
       select 1
         from public.shelf_refills r
        where r.variant_slug = v_row.variant_slug
          and r.action = 'no_stock'
          and (r.acted_at, r.id) > (v_row.acted_at, v_row.id)
     )
  then
    update public.product_variants
       set stock_quantity = v_row.previous_stock
     where slug = v_row.variant_slug
       and stock_quantity = 0;
  end if;

  return v_row;
end;
$$;

revoke all on function public.stall_refill_lines(date) from public, anon, authenticated;
revoke all on function public.stall_refill_record(date, text, text, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.stall_refill_undo(uuid) from public, anon, authenticated;
grant execute on function public.stall_refill_lines(date) to service_role;
grant execute on function public.stall_refill_record(date, text, text, integer, uuid, text) to service_role;
grant execute on function public.stall_refill_undo(uuid) to service_role;
