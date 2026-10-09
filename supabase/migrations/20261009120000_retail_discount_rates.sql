-- Approved discounts on shop sales (consignment agreement revised 2026-10-09,
-- clauses 3.5-3.7). Cozyberries approves fixed discount rates per shop and
-- month; a sale line carries the rate it sold at and is invoiced at
-- share × MRP × (1 − rate), so a discount is borne 75 : 25.
-- Spec: docs/superpowers/specs/2026-10-09-retail-approved-discounts-design.md.
-- Admin/internal tier: no grants to anon/authenticated, RLS forced, no
-- policies; written only through the functions below (service role).
-- Idempotent, so scripts/sql/test-retail.sql can load it again.

create table if not exists public.retailer_discount_rates (
  retailer_id uuid not null references public.retailers(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  rate_pct numeric(5, 2) not null check (rate_pct > 0 and rate_pct < 100),
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (retailer_id, period, rate_pct)
);

alter table public.retailer_discount_rates enable row level security;
alter table public.retailer_discount_rates force row level security;
revoke all on table public.retailer_discount_rates from public, anon, authenticated;
grant select, insert, delete on table public.retailer_discount_rates to service_role;

-- Sale lines: the approved discount the pieces sold at (0 = full MRP).
-- Challan and return lines are always 0.
alter table public.consignment_lines
  add column if not exists discount_pct numeric(5, 2) not null default 0
  check (discount_pct >= 0 and discount_pct < 100);

create or replace function public.consignment_add_rate(p_retailer_id uuid, p_period text, p_rate_pct numeric, p_actor uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  perform pg_advisory_xact_lock(hashtext('consignment:' || p_retailer_id::text));
  if not exists (select 1 from public.retailers r where r.id = p_retailer_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_period > to_char(v_today, 'YYYY-MM') then
    raise exception 'BAD_PERIOD' using errcode = 'P0001';
  end if;
  if p_rate_pct is null or p_rate_pct <= 0 or p_rate_pct >= 100 or p_rate_pct <> round(p_rate_pct, 2) then
    raise exception 'BAD_RATE' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.consignment_docs d
              where d.retailer_id = p_retailer_id and d.kind = 'sale' and d.period = p_period and d.status = 'issued') then
    raise exception 'ALREADY_ISSUED' using errcode = 'P0001';
  end if;
  if (select count(*) from public.retailer_discount_rates r
       where r.retailer_id = p_retailer_id and r.period = p_period and r.rate_pct <> p_rate_pct) >= 4 then
    raise exception 'TOO_MANY_RATES' using errcode = 'P0001';
  end if;
  insert into public.retailer_discount_rates (retailer_id, period, rate_pct, created_by)
  values (p_retailer_id, p_period, p_rate_pct, p_actor)
  on conflict (retailer_id, period, rate_pct) do nothing;
end;
$$;

create or replace function public.consignment_remove_rate(p_retailer_id uuid, p_period text, p_rate_pct numeric)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('consignment:' || p_retailer_id::text));
  if exists (select 1 from public.consignment_docs d
              where d.retailer_id = p_retailer_id and d.kind = 'sale' and d.period = p_period and d.status = 'issued') then
    raise exception 'ALREADY_ISSUED' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.consignment_lines l
               join public.consignment_docs d on d.id = l.doc_id
              where d.retailer_id = p_retailer_id and d.kind = 'sale' and d.period = p_period
                and d.status = 'draft' and l.discount_pct = p_rate_pct) then
    raise exception 'RATE_IN_USE:%', trim_scale(p_rate_pct) using errcode = 'P0001';
  end if;
  delete from public.retailer_discount_rates r
   where r.retailer_id = p_retailer_id and r.period = p_period and r.rate_pct = p_rate_pct;
end;
$$;

-- Turns "variant × quantity [× discount]" into lines per batch, oldest batch
-- first, using only batches sent on or before p_until. The held check is per
-- variant across every rate: NOT_HELD:<held>:<name size> when the shop holds
-- less. A missing discount_pct is 0 (returns never pass one).
create or replace function public.consignment_fill_from_batches(p_doc_id uuid, p_retailer_id uuid, p_lines jsonb, p_until date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v record;
  item record;
  b record;
  v_avail integer;
  v_label text;
  v_left integer;
  v_free integer;
  v_take integer;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'BAD_LINE' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer, discount_pct numeric)
     where x.variant_slug is null or x.quantity is null or x.quantity < 0
        or coalesce(x.discount_pct, 0) < 0 or coalesce(x.discount_pct, 0) >= 100
  ) then
    raise exception 'BAD_LINE' using errcode = 'P0001';
  end if;

  for v in
    select x.variant_slug, sum(x.quantity)::integer as quantity
      from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer)
     group by x.variant_slug
    having sum(x.quantity) > 0
     order by x.variant_slug
  loop
    select coalesce(sum(bb.held), 0)::integer, min(trim(bb.product_name || ' ' || bb.size))
      into v_avail, v_label
      from public.retailer_batch_balances bb
     where bb.retailer_id = p_retailer_id
       and bb.variant_slug = v.variant_slug
       and bb.held > 0
       and bb.sent_on <= p_until;
    if v_avail < v.quantity then
      raise exception 'NOT_HELD:%:%', v_avail, coalesce(v_label, v.variant_slug) using errcode = 'P0001';
    end if;

    for item in
      select coalesce(x.discount_pct, 0) as discount_pct, sum(x.quantity)::integer as quantity
        from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer, discount_pct numeric)
       where x.variant_slug = v.variant_slug
       group by coalesce(x.discount_pct, 0)
      having sum(x.quantity) > 0
       order by 1
    loop
      v_left := item.quantity;
      for b in
        select bb.batch_line_id, bb.product_name, bb.size, bb.mrp_paise, bb.held
          from public.retailer_batch_balances bb
         where bb.retailer_id = p_retailer_id
           and bb.variant_slug = v.variant_slug
           and bb.held > 0
           and bb.sent_on <= p_until
         order by bb.sent_on, bb.batch_line_id
      loop
        exit when v_left = 0;
        -- Pieces of this batch already given to an earlier rate in this document.
        select b.held - coalesce(sum(l.quantity), 0)::integer into v_free
          from public.consignment_lines l
         where l.doc_id = p_doc_id and l.batch_line_id = b.batch_line_id;
        continue when v_free <= 0;
        v_take := least(v_left, v_free);
        insert into public.consignment_lines (doc_id, variant_slug, product_name, size, quantity, mrp_paise, batch_line_id, discount_pct)
        values (p_doc_id, v.variant_slug, b.product_name, b.size, v_take, b.mrp_paise, b.batch_line_id, item.discount_pct);
        v_left := v_left - v_take;
      end loop;
      if v_left > 0 then
        raise exception 'NOT_HELD:%:%', v_avail, coalesce(v_label, v.variant_slug) using errcode = 'P0001';
      end if;
    end loop;
  end loop;
end;
$$;

-- Creates or replaces the period's draft sale. An empty list is a "nothing sold"
-- month. Every non-zero discount must be approved for the period.
create or replace function public.consignment_save_sale(
  p_retailer_id uuid,
  p_period text,
  p_lines jsonb,
  p_actor uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_doc uuid;
  v_status text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_end date;
  v_lines jsonb := coalesce(p_lines, '[]'::jsonb);
  v_rate numeric;
begin
  perform pg_advisory_xact_lock(hashtext('consignment:' || p_retailer_id::text));
  if not exists (select 1 from public.retailers r where r.id = p_retailer_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_period > to_char(v_today, 'YYYY-MM') then
    raise exception 'BAD_PERIOD' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_lines) is distinct from 'array' then
    raise exception 'BAD_LINE' using errcode = 'P0001';
  end if;
  select x.discount_pct into v_rate
    from jsonb_to_recordset(v_lines) as x(discount_pct numeric)
   where coalesce(x.discount_pct, 0) <> 0
     and not exists (select 1 from public.retailer_discount_rates r
                      where r.retailer_id = p_retailer_id and r.period = p_period and r.rate_pct = x.discount_pct)
   limit 1;
  if found then
    raise exception 'RATE_NOT_APPROVED:%', trim_scale(v_rate) using errcode = 'P0001';
  end if;
  v_end := (to_date(p_period || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;

  select d.id, d.status into v_doc, v_status
    from public.consignment_docs d
   where d.retailer_id = p_retailer_id and d.kind = 'sale' and d.period = p_period and d.status <> 'cancelled'
     for update;
  if v_status = 'issued' then
    raise exception 'ALREADY_ISSUED' using errcode = 'P0001';
  end if;
  if v_doc is null then
    insert into public.consignment_docs (retailer_id, kind, doc_date, period, created_by)
    values (p_retailer_id, 'sale', least(v_end, v_today), p_period, p_actor)
    returning id into v_doc;
  else
    delete from public.consignment_lines where doc_id = v_doc;
    update public.consignment_docs set doc_date = least(v_end, v_today) where id = v_doc;
  end if;
  perform public.consignment_fill_from_batches(v_doc, p_retailer_id, v_lines, v_end);
  return v_doc;
end;
$$;

create or replace function public.consignment_issue(p_doc_id uuid)
returns public.consignment_docs
language plpgsql
set search_path = ''
as $$
declare
  v_doc public.consignment_docs;
  v_retailer public.retailers;
  item record;
  v_bad record;
  v_held integer;
  v_label text;
  v_rate numeric;
begin
  select * into v_doc from public.consignment_docs where id = p_doc_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('consignment:' || v_doc.retailer_id::text));
  -- Re-read under the lock: another call may have issued or deleted it meanwhile.
  select * into v_doc from public.consignment_docs where id = p_doc_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_doc.status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;
  select * into v_retailer from public.retailers where id = v_doc.retailer_id;
  -- Only sale lines carry a discount.
  if v_doc.kind <> 'sale' and exists (select 1 from public.consignment_lines where doc_id = p_doc_id and discount_pct <> 0) then
    raise exception 'BAD_LINE' using errcode = 'P0001';
  end if;

  if v_doc.kind = 'challan' then
    if not v_retailer.active then
      raise exception 'RETAILER_INACTIVE' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.consignment_lines where doc_id = p_doc_id) then
      raise exception 'NO_LINES' using errcode = 'P0001';
    end if;
    for item in
      select l.variant_slug, min(trim(l.product_name || ' ' || l.size)) as label, sum(l.quantity)::integer as quantity
        from public.consignment_lines l
       where l.doc_id = p_doc_id
       group by l.variant_slug
       order by l.variant_slug
    loop
      update public.product_variants v
         set stock_quantity = coalesce(v.stock_quantity, 0) - item.quantity
       where v.slug = item.variant_slug
         and coalesce(v.stock_quantity, 0) >= item.quantity;
      if not found then
        raise exception 'OUT_OF_STOCK:%', item.label using errcode = 'P0001';
      end if;
    end loop;
    v_doc.number := public.consignment_next_number('CBC', v_doc.doc_date);
  else
    -- Sale or return: every batch must still hold what this document takes from it.
    select l.variant_slug, l.label into v_bad
      from (
        select batch_line_id, variant_slug, min(trim(product_name || ' ' || size)) as label,
               sum(quantity)::integer as quantity
          from public.consignment_lines
         where doc_id = p_doc_id
         group by batch_line_id, variant_slug
      ) l
      left join public.retailer_batch_balances b
        on b.batch_line_id = l.batch_line_id and b.retailer_id = v_doc.retailer_id
     where l.quantity > coalesce(b.held, 0)
     limit 1;
    if found then
      select coalesce(sum(held), 0)::integer into v_held
        from public.retailer_batch_balances
       where retailer_id = v_doc.retailer_id and variant_slug = v_bad.variant_slug;
      raise exception 'NOT_HELD:%:%', v_held, v_bad.label using errcode = 'P0001';
    end if;

    if v_doc.kind = 'sale' then
      v_doc.share_pct := v_retailer.our_share_pct;
      -- Invoice date is fixed at issue. While the period's GSTR-1 is not yet due
      -- (before 00:00 IST on the 11th of the next month): the period's last day,
      -- or today if the period is still running. After that the month is filed,
      -- so a late invoice is dated today and lands in an open month.
      if now() < ((to_date(v_doc.period || '-01', 'YYYY-MM-DD') + interval '1 month' + interval '10 days')::timestamp
                  at time zone 'Asia/Kolkata') then
        v_doc.doc_date := least(
          (to_date(v_doc.period || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date,
          (now() at time zone 'Asia/Kolkata')::date);
      else
        v_doc.doc_date := (now() at time zone 'Asia/Kolkata')::date;
      end if;
      -- Every discount must still be approved for the period.
      select l.discount_pct into v_rate
        from public.consignment_lines l
       where l.doc_id = p_doc_id and l.discount_pct <> 0
         and not exists (select 1 from public.retailer_discount_rates r
                          where r.retailer_id = v_doc.retailer_id and r.period = v_doc.period and r.rate_pct = l.discount_pct)
       limit 1;
      if found then
        raise exception 'RATE_NOT_APPROVED:%', trim_scale(v_rate) using errcode = 'P0001';
      end if;
      -- Our share of the selling price (MRP less the approved discount), rounded once.
      update public.consignment_lines
         set unit_price_paise = round(mrp_paise * (100 - discount_pct) * v_doc.share_pct / 10000)::integer
       where doc_id = p_doc_id;
      -- Clothing above Rs 2,500 a piece is 18% GST; the invoice charges a flat 5%
      -- (GST_LOW_RATE_MAX_UNIT_PRICE in lib/config/business.ts).
      select trim(l.product_name || ' ' || l.size) into v_label
        from public.consignment_lines l
       where l.doc_id = p_doc_id and l.unit_price_paise > 250000
       order by l.product_name, l.size
       limit 1;
      if v_label is not null then
        raise exception 'ABOVE_LOW_RATE:%', v_label using errcode = 'P0001';
      end if;
      if exists (select 1 from public.consignment_lines where doc_id = p_doc_id) then
        v_doc.number := public.consignment_next_number('CBR', v_doc.doc_date);
      end if;
    else
      if not exists (select 1 from public.consignment_lines where doc_id = p_doc_id) then
        raise exception 'NO_LINES' using errcode = 'P0001';
      end if;
      for item in
        select l.variant_slug, sum(l.quantity)::integer as quantity
          from public.consignment_lines l
         where l.doc_id = p_doc_id
         group by l.variant_slug
         order by l.variant_slug
      loop
        update public.product_variants v
           set stock_quantity = coalesce(v.stock_quantity, 0) + item.quantity
         where v.slug = item.variant_slug;
      end loop;
      v_doc.number := public.consignment_next_number('RET', v_doc.doc_date);
    end if;
  end if;

  -- Challans and sale invoices keep the shop's details as issued (returns don't need them).
  update public.consignment_docs
     set status = 'issued', issued_at = now(), number = v_doc.number, share_pct = v_doc.share_pct,
         doc_date = v_doc.doc_date,
         buyer_legal_name = case when v_doc.kind in ('challan', 'sale') then v_retailer.legal_name end,
         buyer_trade_name = case when v_doc.kind in ('challan', 'sale') then v_retailer.trade_name end,
         buyer_gstin = case when v_doc.kind in ('challan', 'sale') then v_retailer.gstin end,
         buyer_address = case when v_doc.kind in ('challan', 'sale') then v_retailer.address end,
         buyer_state_code = case when v_doc.kind in ('challan', 'sale') then v_retailer.state_code end
   where id = p_doc_id
  returning * into v_doc;
  return v_doc;
end;
$$;

revoke all on function public.consignment_add_rate(uuid, text, numeric, uuid) from public, anon, authenticated;
revoke all on function public.consignment_remove_rate(uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.consignment_fill_from_batches(uuid, uuid, jsonb, date) from public, anon, authenticated;
revoke all on function public.consignment_save_sale(uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.consignment_issue(uuid) from public, anon, authenticated;
grant execute on function public.consignment_add_rate(uuid, text, numeric, uuid) to service_role;
grant execute on function public.consignment_remove_rate(uuid, text, numeric) to service_role;
grant execute on function public.consignment_fill_from_batches(uuid, uuid, jsonb, date) to service_role;
grant execute on function public.consignment_save_sale(uuid, text, jsonb, uuid) to service_role;
grant execute on function public.consignment_issue(uuid) to service_role;
