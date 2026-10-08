-- Behavioural tests for the retail consignment migrations. Loads them inside
-- one transaction, runs every assertion, then rolls back, so it is safe to run
-- against the production database and mutates nothing. Prints
-- 'PASS <name>' or 'FAIL <name>: <reason>' per assertion.
\set ON_ERROR_STOP on
begin;

\ir ../../supabase/migrations/20261008120000_retail_consignment.sql
\ir ../../supabase/migrations/20261008120100_retail_consignment_functions.sql

create temporary table t_result(name text, ok boolean, reason text) on commit drop;
create temporary table t_ctx(k text primary key, v text) on commit drop;

-- Fixtures: a throwaway inactive product with two sizes (10 and 3 in stock)
-- and one Karnataka shop.
do $$
declare
  v_sizes text[];
  v_shop uuid;
begin
  select array_agg(slug order by slug) into v_sizes
    from (select slug from public.sizes order by slug limit 2) s;
  insert into public.products (name, slug, price, base_price, is_active)
    values ('ZZ Retail Frock', 'zz-retail-frock', 1000, 952, false);
  insert into public.product_variants (slug, product_slug, size_slug, price, base_price, stock_quantity)
    values ('zz-retail-frock-a', 'zz-retail-frock', v_sizes[1], 1000, 952, 10),
           ('zz-retail-frock-b', 'zz-retail-frock', v_sizes[2], 1000, 952, 3);
  insert into public.retailers (legal_name, gstin, address)
    values ('ZZ Kids Corner', '29AAGFC4321M1ZB', '1 Test Road, Bengaluru')
    returning id into v_shop;
  insert into t_ctx values ('shop', v_shop::text), ('actor', gen_random_uuid()::text);
end $$;

create function pg_temp.shop() returns uuid language sql as $$ select v::uuid from t_ctx where k = 'shop' $$;
create function pg_temp.actor() returns uuid language sql as $$ select v::uuid from t_ctx where k = 'actor' $$;
create function pg_temp.stock(p text) returns int language sql as $$
  select stock_quantity from public.product_variants where slug = p
$$;
-- Runs p_sql in a subtransaction; returns the error text, or null on success.
create function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

-- 1. No table or view is reachable by anon or authenticated.
do $$
declare t text; p text; bad text[] := '{}';
begin
  foreach t in array array['retailers', 'consignment_docs', 'consignment_lines',
                           'retailer_payments', 'consignment_counters', 'retailer_batch_balances'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('anon', 'public.' || t, p) or has_table_privilege('authenticated', 'public.' || t, p) then
        bad := bad || (t || ':' || p);
      end if;
    end loop;
  end loop;
  insert into t_result values ('tables_are_service_role_only', cardinality(bad) = 0,
    'reachable: ' || array_to_string(bad, ', '));
end $$;

-- 2. A lower-case or malformed GSTIN is refused.
insert into t_result
select 'gstin_format_enforced', e is not null, coalesce(e, 'accepted')
  from pg_temp.err($q$insert into public.retailers (legal_name, gstin, address)
                      values ('Bad', '29aagfc4321m1zb', 'x')$q$) e;

-- 3. The state code is the GSTIN's first two digits.
insert into t_result
select 'state_code_generated', state_code = '29', 'state_code=' || state_code
  from public.retailers where id = pg_temp.shop();

-- 4. Our share must be strictly between 0 and 100.
insert into t_result
select 'share_pct_bounds', e is not null, coalesce(e, 'accepted 100')
  from pg_temp.err($q$insert into public.retailers (legal_name, gstin, address, our_share_pct)
                      values ('Hundred', '33AAACR5055K1ZE', 'x', 100)$q$) e;

-- 5. One open sale per shop and month.
do $$
declare v_err text;
begin
  insert into public.consignment_docs (retailer_id, kind, doc_date, period, created_by)
    values (pg_temp.shop(), 'sale', '2026-09-30', '2026-09', pg_temp.actor());
  v_err := pg_temp.err(format(
    'insert into public.consignment_docs (retailer_id, kind, doc_date, period, created_by) values (%L, ''sale'', ''2026-09-30'', ''2026-09'', %L)',
    pg_temp.shop(), pg_temp.actor()));
  insert into t_result values ('one_open_sale_per_shop_month', v_err is not null, coalesce(v_err, 'second accepted'));
  delete from public.consignment_docs where retailer_id = pg_temp.shop() and kind = 'sale';
end $$;

-- 6. Only sales carry a period, and every sale has one.
do $$
declare e1 text; e2 text;
begin
  e1 := pg_temp.err(format(
    'insert into public.consignment_docs (retailer_id, kind, doc_date, period, created_by) values (%L, ''challan'', ''2026-09-30'', ''2026-09'', %L)',
    pg_temp.shop(), pg_temp.actor()));
  e2 := pg_temp.err(format(
    'insert into public.consignment_docs (retailer_id, kind, doc_date, created_by) values (%L, ''sale'', ''2026-09-30'', %L)',
    pg_temp.shop(), pg_temp.actor()));
  insert into t_result values ('period_only_on_sales', e1 is not null and e2 is not null,
    format('challan=%s sale=%s', coalesce(e1, 'accepted'), coalesce(e2, 'accepted')));
end $$;

-- 7. A variant with consignment lines cannot be deleted.
do $$
declare v_doc uuid; v_err text;
begin
  insert into public.consignment_docs (retailer_id, kind, doc_date, created_by)
    values (pg_temp.shop(), 'challan', '2026-09-30', pg_temp.actor()) returning id into v_doc;
  insert into public.consignment_lines (doc_id, variant_slug, product_name, size, quantity, mrp_paise)
    values (v_doc, 'zz-retail-frock-b', 'ZZ Retail Frock', 'S', 1, 100000);
  v_err := pg_temp.err($q$delete from public.product_variants where slug = 'zz-retail-frock-b'$q$);
  insert into t_result values ('variant_delete_restricted', v_err is not null, coalesce(v_err, 'deleted'));
  delete from public.consignment_docs where id = v_doc;
end $$;

-- 8. A variant slug rename carries its lines forward, then is undone.
do $$
declare v_doc uuid; v_after text;
begin
  insert into public.consignment_docs (retailer_id, kind, doc_date, created_by)
    values (pg_temp.shop(), 'challan', '2026-09-30', pg_temp.actor()) returning id into v_doc;
  insert into public.consignment_lines (doc_id, variant_slug, product_name, size, quantity, mrp_paise)
    values (v_doc, 'zz-retail-frock-a', 'ZZ Retail Frock', 'S', 1, 100000);
  update public.product_variants set slug = 'zz-retail-frock-a2' where slug = 'zz-retail-frock-a';
  select variant_slug into v_after from public.consignment_lines where doc_id = v_doc;
  update public.product_variants set slug = 'zz-retail-frock-a' where slug = 'zz-retail-frock-a2';
  insert into t_result values ('variant_rename_cascades', v_after = 'zz-retail-frock-a2', 'variant_slug=' || v_after);
  delete from public.consignment_docs where id = v_doc;
end $$;

create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Kolkata')::date $$;
create function pg_temp.period() returns text language sql as $$ select to_char(pg_temp.today(), 'YYYY-MM') $$;
create function pg_temp.challan(p_date date, p_lines jsonb) returns uuid language sql as $$
  select public.consignment_save_challan(pg_temp.shop(), p_date, p_lines, pg_temp.actor(), null)
$$;
create function pg_temp.held(p_variant text) returns int language sql as $$
  select coalesce(sum(held), 0)::int from public.retailer_batch_balances
   where retailer_id = pg_temp.shop() and variant_slug = p_variant
$$;
create function pg_temp.seq(p_number text) returns int language sql as $$
  select split_part(p_number, '/', 3)::int
$$;
create function pg_temp.lines(p_doc uuid) returns text language sql as $$
  select string_agg(quantity || '@' || mrp_paise, ',' order by mrp_paise, quantity)
    from public.consignment_lines where doc_id = p_doc
$$;

-- 9. Every function is service-role only.
do $$
declare f text; bad text[] := '{}';
begin
  foreach f in array array[
    'public.consignment_next_number(text,date)',
    'public.consignment_first_open_day()',
    'public.consignment_open_draft(uuid,uuid,text)',
    'public.consignment_fill_from_batches(uuid,uuid,jsonb,date)',
    'public.consignment_save_challan(uuid,date,jsonb,uuid,uuid)',
    'public.consignment_save_return(uuid,date,jsonb,uuid,uuid)',
    'public.consignment_save_sale(uuid,text,jsonb,uuid)',
    'public.consignment_issue(uuid)',
    'public.consignment_cancel(uuid)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then
      bad := bad || f;
    end if;
  end loop;
  insert into t_result values ('functions_are_service_role_only', cardinality(bad) = 0, array_to_string(bad, ', '));
end $$;

-- 10. A challan dated 15 Jan 2026 is numbered in the 25-26 series and takes stock.
--     January is closed for GST, so it is saved today and back-dated directly
--     (the harness runs as postgres): this models historic data.
do $$
declare v_doc public.consignment_docs; v_id uuid;
begin
  v_id := pg_temp.challan(pg_temp.today(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":2,"mrp_paise":100000}]');
  update public.consignment_docs set doc_date = '2026-01-15' where id = v_id;
  v_doc := public.consignment_issue(v_id);
  insert into t_ctx values ('c0', v_doc.id::text);
  insert into t_result values ('challan_number_uses_its_date_fy',
    v_doc.number like 'CBC/25-26/%' and pg_temp.stock('zz-retail-frock-a') = 8,
    format('number=%s stock=%s', v_doc.number, pg_temp.stock('zz-retail-frock-a')));
end $$;

-- 11. Issuing today's challan takes stock for each line and numbers it in today's FY.
do $$
declare v_doc public.consignment_docs;
begin
  v_doc := public.consignment_issue(pg_temp.challan(pg_temp.today(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":3,"mrp_paise":110000},
      {"variant_slug":"zz-retail-frock-b","quantity":1,"mrp_paise":100000}]'));
  insert into t_ctx values ('c1', v_doc.id::text), ('c1_number', v_doc.number);
  insert into t_result values ('challan_issue_takes_stock_and_numbers',
    v_doc.status = 'issued' and v_doc.number like 'CBC/' || public.gst_financial_year(now()) || '/%'
      and pg_temp.stock('zz-retail-frock-a') = 5 and pg_temp.stock('zz-retail-frock-b') = 2
      and pg_temp.held('zz-retail-frock-a') = 5,
    format('status=%s number=%s a=%s b=%s held_a=%s', v_doc.status, v_doc.number,
           pg_temp.stock('zz-retail-frock-a'), pg_temp.stock('zz-retail-frock-b'), pg_temp.held('zz-retail-frock-a')));
end $$;

-- 12. A shortfall is refused, the stock is untouched and the draft stays a draft.
do $$
declare v_doc uuid; v_err text; v_status text;
begin
  v_doc := pg_temp.challan(pg_temp.today(), '[{"variant_slug":"zz-retail-frock-b","quantity":5,"mrp_paise":100000}]');
  v_err := pg_temp.err(format('select public.consignment_issue(%L)', v_doc));
  select status into v_status from public.consignment_docs where id = v_doc;
  insert into t_ctx values ('short', v_doc::text);
  insert into t_result values ('challan_issue_refuses_shortfall',
    v_err like 'OUT_OF_STOCK:%' and pg_temp.stock('zz-retail-frock-b') = 2 and v_status = 'draft',
    format('err=%s stock=%s status=%s', v_err, pg_temp.stock('zz-retail-frock-b'), v_status));
end $$;

-- 13. Cancelling a draft deletes it.
do $$
declare v_res text;
begin
  v_res := public.consignment_cancel((select v::uuid from t_ctx where k = 'short'));
  insert into t_result values ('cancel_draft_deletes',
    v_res = 'deleted' and not exists (select 1 from public.consignment_docs where id = (select v::uuid from t_ctx where k = 'short')),
    'result=' || v_res);
end $$;

-- 14. Issuing an issued document again is refused and takes no more stock.
insert into t_result
select 'issue_twice_refused', e = 'NOT_DRAFT' and pg_temp.stock('zz-retail-frock-a') = 5,
       format('err=%s stock=%s', coalesce(e, 'none'), pg_temp.stock('zz-retail-frock-a'))
  from pg_temp.err(format('select public.consignment_issue(%L)', (select v from t_ctx where k = 'c1'))) e;

-- 15. An inactive shop gets no new challans.
do $$
declare v_err text;
begin
  update public.retailers set active = false where id = pg_temp.shop();
  v_err := pg_temp.err(format('select public.consignment_save_challan(%L, %L, %L, %L, null)', pg_temp.shop(),
    pg_temp.today(), '[{"variant_slug":"zz-retail-frock-a","quantity":1,"mrp_paise":100000}]', pg_temp.actor()));
  update public.retailers set active = true where id = pg_temp.shop();
  insert into t_result values ('challan_refused_for_inactive_shop', v_err = 'RETAILER_INACTIVE', coalesce(v_err, 'accepted'));
end $$;

-- 16. A January sale can only draw on stock sent by 31 January (2 pieces).
insert into t_result
select 'sale_only_from_batches_sent_by_period_end', e like 'NOT_HELD:2:%', coalesce(e, 'accepted')
  from pg_temp.err(format('select public.consignment_save_sale(%L, ''2026-01'', %L, %L)', pg_temp.shop(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":3}]', pg_temp.actor())) e;

-- 17. January's GSTR-1 was due on 11 Feb, so the January invoice issued now is
--     a late invoice: dated today (it lands in an open month) and numbered in
--     the financial year of that date.
do $$
declare v_doc public.consignment_docs;
begin
  v_doc := public.consignment_issue(public.consignment_save_sale(pg_temp.shop(), '2026-01',
    '[{"variant_slug":"zz-retail-frock-a","quantity":1}]', pg_temp.actor()));
  insert into t_ctx values ('s_jan', v_doc.id::text);
  insert into t_result values ('late_sale_dated_today_numbered_in_its_fy',
    v_doc.number like 'CBR/' || public.gst_financial_year(now()) || '/%' and v_doc.doc_date = pg_temp.today()
      and v_doc.share_pct = 75,
    format('number=%s date=%s share=%s', v_doc.number, v_doc.doc_date, v_doc.share_pct));
end $$;

-- 18. After the 10th of the month following the invoice date the invoice cannot
--     be cancelled. Back-dated directly to 31 Jan to model an on-time January invoice.
update public.consignment_docs set doc_date = '2026-01-31' where id = (select v::uuid from t_ctx where k = 's_jan');
insert into t_result
select 'cancel_sale_after_deadline_refused', e = 'TOO_LATE', coalesce(e, 'cancelled')
  from pg_temp.err(format('select public.consignment_cancel(%L)', (select v from t_ctx where k = 's_jan'))) e;

-- 19. Sales draw on the oldest batch first: 1 left at Rs 1,000, then 3 at Rs 1,100.
do $$
declare v_doc uuid;
begin
  v_doc := public.consignment_save_sale(pg_temp.shop(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":4}]', pg_temp.actor());
  insert into t_ctx values ('s_now', v_doc::text);
  insert into t_result values ('sale_fifo_oldest_first', pg_temp.lines(v_doc) = '1@100000,3@110000',
    'lines=' || coalesce(pg_temp.lines(v_doc), 'none'));
end $$;

-- 20. A draft cannot take more than the shop holds (b: 1 held); the old draft survives.
do $$
declare v_err text;
begin
  v_err := pg_temp.err(format('select public.consignment_save_sale(%L, %L, %L, %L)', pg_temp.shop(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-b","quantity":2}]', pg_temp.actor()));
  insert into t_result values ('sale_cannot_exceed_held',
    v_err like 'NOT_HELD:1:%' and pg_temp.lines((select v::uuid from t_ctx where k = 's_now')) = '1@100000,3@110000',
    format('err=%s lines=%s', v_err, pg_temp.lines((select v::uuid from t_ctx where k = 's_now'))));
end $$;

-- 21. Saving the same month again replaces the draft in place.
do $$
declare v_doc uuid; v_first text;
begin
  v_doc := public.consignment_save_sale(pg_temp.shop(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":1}]', pg_temp.actor());
  v_first := pg_temp.lines(v_doc);
  perform public.consignment_save_sale(pg_temp.shop(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":4}]', pg_temp.actor());
  insert into t_result values ('sale_upload_replaces_draft',
    v_doc = (select v::uuid from t_ctx where k = 's_now') and v_first = '1@100000',
    format('same=%s first=%s', v_doc = (select v::uuid from t_ctx where k = 's_now'), v_first));
end $$;

-- 22. Taking 2 back returns them to stock, oldest batch first.
do $$
declare v_doc public.consignment_docs;
begin
  v_doc := public.consignment_issue(public.consignment_save_return(pg_temp.shop(), pg_temp.today(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":2}]', pg_temp.actor(), null));
  insert into t_ctx values ('r1', v_doc.id::text);
  insert into t_result values ('return_adds_stock_back',
    v_doc.number like 'RET/%' and pg_temp.stock('zz-retail-frock-a') = 7 and pg_temp.held('zz-retail-frock-a') = 2
      and pg_temp.lines(v_doc.id) = '1@100000,1@110000',
    format('number=%s stock=%s held=%s lines=%s', v_doc.number, pg_temp.stock('zz-retail-frock-a'),
           pg_temp.held('zz-retail-frock-a'), pg_temp.lines(v_doc.id)));
end $$;

-- 23. The 4-piece draft is now stale: issuing re-checks and refuses.
do $$
declare v_err text; v_status text;
begin
  v_err := pg_temp.err(format('select public.consignment_issue(%L)', (select v from t_ctx where k = 's_now')));
  select status into v_status from public.consignment_docs where id = (select v::uuid from t_ctx where k = 's_now');
  insert into t_result values ('sale_issue_rechecks_balance', v_err like 'NOT_HELD:2:%' and v_status = 'draft',
    format('err=%s status=%s', v_err, v_status));
end $$;

-- 24. The invoice uses the shop's share at issue time (70% of Rs 1,100 = Rs 770).
do $$
declare v_doc public.consignment_docs; v_price int;
begin
  perform public.consignment_save_sale(pg_temp.shop(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":2}]', pg_temp.actor());
  -- A stale draft date must not survive issue.
  update public.consignment_docs set doc_date = '2026-01-01' where id = (select v::uuid from t_ctx where k = 's_now');
  update public.retailers set our_share_pct = 70 where id = pg_temp.shop();
  v_doc := public.consignment_issue((select v::uuid from t_ctx where k = 's_now'));
  update public.retailers set our_share_pct = 75 where id = pg_temp.shop();
  select max(unit_price_paise) into v_price from public.consignment_lines where doc_id = v_doc.id;
  insert into t_result values ('sale_unit_price_uses_share_at_issue',
    v_doc.share_pct = 70 and v_price = 77000 and v_doc.number like 'CBR/%'
      and v_doc.doc_date = pg_temp.today() and pg_temp.held('zz-retail-frock-a') = 0,
    format('share=%s price=%s number=%s date=%s held=%s', v_doc.share_pct, v_price, v_doc.number,
           v_doc.doc_date, pg_temp.held('zz-retail-frock-a')));
  -- On time (this month): dated least(period end, today), which is today.
  insert into t_result values ('on_time_sale_dated_period_end_or_today',
    v_doc.doc_date = least((date_trunc('month', pg_temp.today()::timestamp) + interval '1 month' - interval '1 day')::date, pg_temp.today()),
    'doc_date=' || v_doc.doc_date);
end $$;

-- 24b. Issued documents keep the shop's details as they were at issue.
do $$
declare v_ch public.consignment_docs; v_sale public.consignment_docs;
begin
  update public.retailers set gstin = '33AAACR5055K1ZE', address = 'moved' where id = pg_temp.shop();
  select * into v_ch from public.consignment_docs where id = (select v::uuid from t_ctx where k = 'c1');
  select * into v_sale from public.consignment_docs where id = (select v::uuid from t_ctx where k = 's_now');
  update public.retailers set gstin = '29AAGFC4321M1ZB', address = '1 Test Road, Bengaluru' where id = pg_temp.shop();
  insert into t_result values ('issued_docs_keep_shop_snapshot',
    v_ch.buyer_gstin = '29AAGFC4321M1ZB' and v_ch.buyer_state_code = '29' and v_ch.buyer_address = '1 Test Road, Bengaluru'
      and v_ch.buyer_legal_name = 'ZZ Kids Corner' and v_ch.buyer_trade_name is null
      and v_sale.buyer_gstin = '29AAGFC4321M1ZB' and v_sale.buyer_state_code = '29' and v_sale.buyer_address = '1 Test Road, Bengaluru'
      and v_sale.buyer_legal_name = 'ZZ Kids Corner',
    format('challan=%s/%s/%s sale=%s/%s/%s', v_ch.buyer_gstin, v_ch.buyer_state_code, v_ch.buyer_address,
           v_sale.buyer_gstin, v_sale.buyer_state_code, v_sale.buyer_address));
end $$;

-- 25. A challan that sales or returns draw on cannot be cancelled.
insert into t_result
select 'cancel_challan_in_use_refused', e = 'IN_USE', coalesce(e, 'cancelled')
  from pg_temp.err(format('select public.consignment_cancel(%L)', (select v from t_ctx where k = 'c1'))) e;

-- 26. This month's invoice can be cancelled; it keeps its number, and a new draft is allowed.
do $$
declare v_res text; v_doc public.consignment_docs; v_new uuid;
begin
  v_res := public.consignment_cancel((select v::uuid from t_ctx where k = 's_now'));
  select * into v_doc from public.consignment_docs where id = (select v::uuid from t_ctx where k = 's_now');
  v_new := public.consignment_save_sale(pg_temp.shop(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":1}]', pg_temp.actor());
  insert into t_ctx values ('s_new', v_new::text);
  insert into t_result values ('cancel_sale_in_window_keeps_number',
    v_res = 'cancelled' and v_doc.status = 'cancelled' and v_doc.number like 'CBR/%'
      and v_doc.cancelled_at is not null and pg_temp.held('zz-retail-frock-a') = 2 and v_new <> v_doc.id,
    format('res=%s status=%s number=%s held=%s', v_res, v_doc.status, v_doc.number, pg_temp.held('zz-retail-frock-a')));
end $$;

-- 27. Once the month is issued, another upload is refused.
do $$
declare v_err text;
begin
  perform public.consignment_issue((select v::uuid from t_ctx where k = 's_new'));
  v_err := pg_temp.err(format('select public.consignment_save_sale(%L, %L, %L, %L)', pg_temp.shop(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":1}]', pg_temp.actor()));
  insert into t_result values ('upload_refused_after_issue', v_err = 'ALREADY_ISSUED', coalesce(v_err, 'accepted'));
end $$;

-- 28. A "nothing sold" month is issued without a number.
do $$
declare v_doc public.consignment_docs;
begin
  v_doc := public.consignment_issue(public.consignment_save_sale(pg_temp.shop(), '2026-02', '[]', pg_temp.actor()));
  insert into t_result values ('nothing_sold_issues_without_number',
    v_doc.status = 'issued' and v_doc.number is null,
    format('status=%s number=%s', v_doc.status, coalesce(v_doc.number, 'null')));
end $$;

-- 28b. A draft saved early is dated at issue. March's GSTR-1 is past due, so
--      the late invoice is dated today, not 31 March and not the draft's date.
do $$
declare v_id uuid; v_doc public.consignment_docs;
begin
  v_id := public.consignment_save_sale(pg_temp.shop(), '2026-03', '[]', pg_temp.actor());
  update public.consignment_docs set doc_date = '2026-03-02' where id = v_id;
  v_doc := public.consignment_issue(v_id);
  insert into t_ctx values ('s_mar', v_id::text);
  insert into t_result values ('late_sale_issue_dated_today', v_doc.doc_date = pg_temp.today(),
    'doc_date=' || v_doc.doc_date);
end $$;

-- 28c. A late invoice's cancel window follows its own date, so it can still be cancelled.
do $$
declare v_err text; v_status text;
begin
  v_err := pg_temp.err(format('select public.consignment_cancel(%L)', (select v from t_ctx where k = 's_mar')));
  select status into v_status from public.consignment_docs where id = (select v::uuid from t_ctx where k = 's_mar');
  insert into t_result values ('cancel_late_sale_in_its_window', v_err is null and v_status = 'cancelled',
    format('err=%s status=%s', coalesce(v_err, 'none'), v_status));
end $$;

-- 28d. Challans and returns can't be dated into a month whose GSTR-1 is due
--      (before the 11th the previous month is still open); the first open day is fine.
do $$
declare
  v_first date := case when extract(day from pg_temp.today()) <= 10
                       then (date_trunc('month', pg_temp.today()::timestamp) - interval '1 month')::date
                       else date_trunc('month', pg_temp.today()::timestamp)::date end;
  e_ch text; e_ret text; v_ok uuid;
begin
  e_ch := pg_temp.err(format('select public.consignment_save_challan(%L, %L, %L, %L, null)', pg_temp.shop(),
    v_first - 1, '[{"variant_slug":"zz-retail-frock-a","quantity":1,"mrp_paise":100000}]', pg_temp.actor()));
  e_ret := pg_temp.err(format('select public.consignment_save_return(%L, %L, %L, %L, null)', pg_temp.shop(),
    v_first - 1, '[{"variant_slug":"zz-retail-frock-a","quantity":1}]', pg_temp.actor()));
  v_ok := pg_temp.challan(v_first, '[{"variant_slug":"zz-retail-frock-a","quantity":1,"mrp_paise":100000}]');
  delete from public.consignment_docs where id = v_ok;
  insert into t_result values ('closed_month_date_refused',
    e_ch = 'CLOSED_MONTH' and e_ret = 'CLOSED_MONTH' and v_ok is not null,
    format('challan=%s return=%s first_open=%s', coalesce(e_ch, 'accepted'), coalesce(e_ret, 'accepted'), v_first));
end $$;

-- 29. A return cannot be cancelled once those units have left our stock again.
do $$
declare v_err text; v_res text;
begin
  update public.product_variants set stock_quantity = 0 where slug = 'zz-retail-frock-a';
  v_err := pg_temp.err(format('select public.consignment_cancel(%L)', (select v from t_ctx where k = 'r1')));
  update public.product_variants set stock_quantity = 7 where slug = 'zz-retail-frock-a';
  v_res := public.consignment_cancel((select v::uuid from t_ctx where k = 'r1'));
  insert into t_result values ('cancel_return_needs_stock',
    v_err like 'STOCK_GONE:%' and v_res = 'cancelled' and pg_temp.stock('zz-retail-frock-a') = 5,
    format('err=%s res=%s stock=%s', v_err, v_res, pg_temp.stock('zz-retail-frock-a')));
end $$;

-- 30. An unused challan can be cancelled and its stock comes back; numbers are consecutive.
do $$
declare v_doc public.consignment_docs; v_res text;
begin
  v_doc := public.consignment_issue(pg_temp.challan(pg_temp.today(),
    '[{"variant_slug":"zz-retail-frock-b","quantity":1,"mrp_paise":100000}]'));
  insert into t_result values ('numbering_is_consecutive',
    pg_temp.seq(v_doc.number) = pg_temp.seq((select v from t_ctx where k = 'c1_number')) + 1,
    format('c1=%s c2=%s', (select v from t_ctx where k = 'c1_number'), v_doc.number));
  v_res := public.consignment_cancel(v_doc.id);
  insert into t_result values ('cancel_unused_challan_restores_stock',
    v_res = 'cancelled' and pg_temp.stock('zz-retail-frock-b') = 2,
    format('res=%s stock=%s', v_res, pg_temp.stock('zz-retail-frock-b')));
end $$;

-- 31. The API's role (service_role) can save and issue. The temp helpers and
--     t_ctx belong to the session user, so read them before switching role.
do $$
declare
  v_err text;
  v_shop uuid := pg_temp.shop();
  v_actor uuid := pg_temp.actor();
  v_today date := pg_temp.today();
begin
  begin
    perform set_config('role', 'service_role', true);
    perform public.consignment_issue(public.consignment_save_challan(v_shop, v_today,
      '[{"variant_slug":"zz-retail-frock-b","quantity":1,"mrp_paise":100000}]', v_actor, null));
    perform set_config('role', session_user, true);
  exception when others then
    v_err := sqlerrm;
  end;
  perform set_config('role', session_user, true);
  insert into t_result values ('service_role_can_run_flow', v_err is null, coalesce(v_err, 'ok'));
end $$;

-- 32. A piece invoiced above Rs 2,500 is taxed at 18%, so issuing it is refused.
--     Rs 4,000 MRP sent (back-dated to April), sold in April: 75% = Rs 3,000.
do $$
declare v_id uuid; v_sale uuid; v_err text; v_status text;
begin
  v_id := pg_temp.challan(pg_temp.today(), '[{"variant_slug":"zz-retail-frock-b","quantity":1,"mrp_paise":400000}]');
  update public.consignment_docs set doc_date = '2026-04-15' where id = v_id;
  perform public.consignment_issue(v_id);
  v_sale := public.consignment_save_sale(pg_temp.shop(), '2026-04',
    '[{"variant_slug":"zz-retail-frock-b","quantity":1}]', pg_temp.actor());
  v_err := pg_temp.err(format('select public.consignment_issue(%L)', v_sale));
  select status into v_status from public.consignment_docs where id = v_sale;
  insert into t_result values ('sale_above_low_rate_refused',
    v_err like 'ABOVE_LOW_RATE:ZZ Retail Frock%' and v_status = 'draft',
    format('err=%s status=%s', coalesce(v_err, 'issued'), v_status));
end $$;

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason, '') end
  from t_result order by name;

rollback;
