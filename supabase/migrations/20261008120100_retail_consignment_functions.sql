-- Retail consignment functions. Called only by /api/admin/retail/* with the
-- service role after requireAdmin(). Not SECURITY DEFINER: the caller is
-- service_role, which holds the table privileges (same shape as stall_refill_*).
-- Every write takes a per-shop advisory lock, so two phones cannot issue the
-- same draft or over-draw the same batch. Errors are P0001 with the messages
-- that lib/retail/rpc-errors.ts maps to HTTP responses.

-- consignment_next_number runs as service_role and needs this.
grant execute on function public.gst_financial_year(timestamptz) to service_role;

-- CBC/26-27/0001: gap-free per series and the financial year of p_date (IST).
create or replace function public.consignment_next_number(p_series text, p_date date)
returns text
language plpgsql
set search_path = ''
as $$
declare
  fy text;
  seq integer;
begin
  fy := public.gst_financial_year(p_date::timestamp at time zone 'Asia/Kolkata');
  insert into public.consignment_counters as c (series, financial_year, last_seq)
  values (p_series, fy, 1)
  on conflict (series, financial_year) do update set last_seq = c.last_seq + 1
  returning c.last_seq into seq;
  return p_series || '/' || fy || '/' || lpad(seq::text, greatest(4, length(seq::text)), '0');
end;
$$;

-- An existing draft of this shop and kind, emptied for re-filling; null when p_doc_id is null.
create or replace function public.consignment_open_draft(p_doc_id uuid, p_retailer_id uuid, p_kind text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_doc_id is null then
    return null;
  end if;
  select d.status into v_status
    from public.consignment_docs d
   where d.id = p_doc_id and d.retailer_id = p_retailer_id and d.kind = p_kind
     for update;
  if v_status is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;
  delete from public.consignment_lines where doc_id = p_doc_id;
  return p_doc_id;
end;
$$;

-- Turns "variant × quantity" into lines per batch, oldest batch first, using
-- only batches sent on or before p_until. NOT_HELD:<held>:<name size> when the
-- shop holds less.
create or replace function public.consignment_fill_from_batches(p_doc_id uuid, p_retailer_id uuid, p_lines jsonb, p_until date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  item record;
  b record;
  v_left integer;
  v_take integer;
  v_label text;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'BAD_LINE' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer)
     where x.variant_slug is null or x.quantity is null or x.quantity < 0
  ) then
    raise exception 'BAD_LINE' using errcode = 'P0001';
  end if;

  for item in
    select x.variant_slug, sum(x.quantity)::integer as quantity
      from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer)
     group by x.variant_slug
    having sum(x.quantity) > 0
     order by x.variant_slug
  loop
    v_left := item.quantity;
    v_label := null;
    for b in
      select bb.batch_line_id, bb.product_name, bb.size, bb.mrp_paise, bb.held
        from public.retailer_batch_balances bb
       where bb.retailer_id = p_retailer_id
         and bb.variant_slug = item.variant_slug
         and bb.held > 0
         and bb.sent_on <= p_until
       order by bb.sent_on, bb.batch_line_id
    loop
      v_label := trim(b.product_name || ' ' || b.size);
      exit when v_left = 0;
      v_take := least(v_left, b.held);
      insert into public.consignment_lines (doc_id, variant_slug, product_name, size, quantity, mrp_paise, batch_line_id)
      values (p_doc_id, item.variant_slug, b.product_name, b.size, v_take, b.mrp_paise, b.batch_line_id);
      v_left := v_left - v_take;
    end loop;
    if v_left > 0 then
      raise exception 'NOT_HELD:%:%', item.quantity - v_left, coalesce(v_label, item.variant_slug)
        using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

create or replace function public.consignment_save_challan(
  p_retailer_id uuid,
  p_doc_date date,
  p_lines jsonb,
  p_actor uuid,
  p_doc_id uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_doc uuid;
  v_active boolean;
  v_bad text;
begin
  perform pg_advisory_xact_lock(hashtext('consignment:' || p_retailer_id::text));
  select r.active into v_active from public.retailers r where r.id = p_retailer_id;
  if v_active is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not v_active then
    raise exception 'RETAILER_INACTIVE' using errcode = 'P0001';
  end if;
  if p_doc_date is null or p_doc_date > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'BAD_DATE' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'NO_LINES' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer, mrp_paise integer)
     where x.variant_slug is null or x.quantity is null or x.quantity <= 0
        or x.mrp_paise is null or x.mrp_paise <= 0
  ) then
    raise exception 'BAD_LINE' using errcode = 'P0001';
  end if;
  select x.variant_slug into v_bad
    from jsonb_to_recordset(p_lines) as x(variant_slug text)
   where not exists (select 1 from public.product_variants v where v.slug = x.variant_slug)
   limit 1;
  if v_bad is not null then
    raise exception 'UNKNOWN_VARIANT:%', v_bad using errcode = 'P0001';
  end if;

  v_doc := public.consignment_open_draft(p_doc_id, p_retailer_id, 'challan');
  if v_doc is null then
    insert into public.consignment_docs (retailer_id, kind, doc_date, created_by)
    values (p_retailer_id, 'challan', p_doc_date, p_actor)
    returning id into v_doc;
  else
    update public.consignment_docs set doc_date = p_doc_date where id = v_doc;
  end if;

  insert into public.consignment_lines (doc_id, variant_slug, product_name, size, quantity, mrp_paise)
  select v_doc, x.variant_slug, p.name, coalesce(s.name, v.size_slug, ''), x.quantity, x.mrp_paise
    from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer, mrp_paise integer)
    join public.product_variants v on v.slug = x.variant_slug
    join public.products p on p.slug = v.product_slug
    left join public.sizes s on s.slug = v.size_slug;
  return v_doc;
end;
$$;

create or replace function public.consignment_save_return(
  p_retailer_id uuid,
  p_doc_date date,
  p_lines jsonb,
  p_actor uuid,
  p_doc_id uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_doc uuid;
begin
  perform pg_advisory_xact_lock(hashtext('consignment:' || p_retailer_id::text));
  if not exists (select 1 from public.retailers r where r.id = p_retailer_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_doc_date is null or p_doc_date > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'BAD_DATE' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or not exists (
    select 1 from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer) where x.quantity > 0
  ) then
    raise exception 'NO_LINES' using errcode = 'P0001';
  end if;

  v_doc := public.consignment_open_draft(p_doc_id, p_retailer_id, 'return');
  if v_doc is null then
    insert into public.consignment_docs (retailer_id, kind, doc_date, created_by)
    values (p_retailer_id, 'return', p_doc_date, p_actor)
    returning id into v_doc;
  else
    update public.consignment_docs set doc_date = p_doc_date where id = v_doc;
  end if;
  perform public.consignment_fill_from_batches(v_doc, p_retailer_id, p_lines, p_doc_date);
  return v_doc;
end;
$$;

-- Creates or replaces the period's draft sale. An empty list is a "nothing sold" month.
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
begin
  perform pg_advisory_xact_lock(hashtext('consignment:' || p_retailer_id::text));
  if not exists (select 1 from public.retailers r where r.id = p_retailer_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_period > to_char(v_today, 'YYYY-MM') then
    raise exception 'BAD_PERIOD' using errcode = 'P0001';
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
  perform public.consignment_fill_from_batches(v_doc, p_retailer_id, coalesce(p_lines, '[]'::jsonb), v_end);
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
begin
  select * into v_doc from public.consignment_docs where id = p_doc_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('consignment:' || v_doc.retailer_id::text));
  -- Re-read under the lock: another call may have issued it meanwhile.
  select * into v_doc from public.consignment_docs where id = p_doc_id for update;
  if v_doc.status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;
  select * into v_retailer from public.retailers where id = v_doc.retailer_id;

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
         set stock_quantity = v.stock_quantity - item.quantity
       where v.slug = item.variant_slug
         and v.stock_quantity >= item.quantity;
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
      update public.consignment_lines
         set unit_price_paise = round(mrp_paise * v_doc.share_pct / 100)::integer
       where doc_id = p_doc_id;
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
           set stock_quantity = v.stock_quantity + item.quantity
         where v.slug = item.variant_slug;
      end loop;
      v_doc.number := public.consignment_next_number('RET', v_doc.doc_date);
    end if;
  end if;

  update public.consignment_docs
     set status = 'issued', issued_at = now(), number = v_doc.number, share_pct = v_doc.share_pct
   where id = p_doc_id
  returning * into v_doc;
  return v_doc;
end;
$$;

-- Draft: deleted. Challan: only while nothing issued draws on it; stock comes
-- back. Return: only while our stock still covers it; stock goes out again.
-- Sale: only before 00:00 IST on the 11th of the following month (GSTR-1 due
-- date); number kept.
create or replace function public.consignment_cancel(p_doc_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_doc public.consignment_docs;
  item record;
begin
  select * into v_doc from public.consignment_docs where id = p_doc_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('consignment:' || v_doc.retailer_id::text));
  select * into v_doc from public.consignment_docs where id = p_doc_id for update;

  if v_doc.status = 'cancelled' then
    raise exception 'ALREADY_CANCELLED' using errcode = 'P0001';
  end if;
  if v_doc.status = 'draft' then
    delete from public.consignment_docs where id = p_doc_id;
    return 'deleted';
  end if;

  if v_doc.kind = 'challan' then
    if exists (
      select 1
        from public.consignment_lines u
        join public.consignment_docs ud on ud.id = u.doc_id
        join public.consignment_lines c on c.id = u.batch_line_id
       where c.doc_id = p_doc_id and ud.status = 'issued'
    ) then
      raise exception 'IN_USE' using errcode = 'P0001';
    end if;
    for item in
      select l.variant_slug, sum(l.quantity)::integer as quantity
        from public.consignment_lines l where l.doc_id = p_doc_id
       group by l.variant_slug order by l.variant_slug
    loop
      update public.product_variants v set stock_quantity = v.stock_quantity + item.quantity
       where v.slug = item.variant_slug;
    end loop;
  elsif v_doc.kind = 'return' then
    for item in
      select l.variant_slug, min(trim(l.product_name || ' ' || l.size)) as label, sum(l.quantity)::integer as quantity
        from public.consignment_lines l where l.doc_id = p_doc_id
       group by l.variant_slug order by l.variant_slug
    loop
      update public.product_variants v set stock_quantity = v.stock_quantity - item.quantity
       where v.slug = item.variant_slug and v.stock_quantity >= item.quantity;
      if not found then
        raise exception 'STOCK_GONE:%', item.label using errcode = 'P0001';
      end if;
    end loop;
  else
    if now() >= ((to_date(v_doc.period || '-01', 'YYYY-MM-DD') + interval '1 month' + interval '10 days')::timestamp
                 at time zone 'Asia/Kolkata') then
      raise exception 'TOO_LATE' using errcode = 'P0001';
    end if;
  end if;

  update public.consignment_docs set status = 'cancelled', cancelled_at = now() where id = p_doc_id;
  return 'cancelled';
end;
$$;

revoke all on function public.consignment_next_number(text, date) from public, anon, authenticated;
revoke all on function public.consignment_open_draft(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.consignment_fill_from_batches(uuid, uuid, jsonb, date) from public, anon, authenticated;
revoke all on function public.consignment_save_challan(uuid, date, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.consignment_save_return(uuid, date, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.consignment_save_sale(uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.consignment_issue(uuid) from public, anon, authenticated;
revoke all on function public.consignment_cancel(uuid) from public, anon, authenticated;
grant execute on function public.consignment_next_number(text, date) to service_role;
grant execute on function public.consignment_open_draft(uuid, uuid, text) to service_role;
grant execute on function public.consignment_fill_from_batches(uuid, uuid, jsonb, date) to service_role;
grant execute on function public.consignment_save_challan(uuid, date, jsonb, uuid, uuid) to service_role;
grant execute on function public.consignment_save_return(uuid, date, jsonb, uuid, uuid) to service_role;
grant execute on function public.consignment_save_sale(uuid, text, jsonb, uuid) to service_role;
grant execute on function public.consignment_issue(uuid) to service_role;
grant execute on function public.consignment_cancel(uuid) to service_role;
