-- Behavioural tests for the retail consignment migrations. Loads them inside
-- one transaction, runs every assertion, then rolls back, so it is safe to run
-- against the production database and mutates nothing. Prints
-- 'PASS <name>' or 'FAIL <name>: <reason>' per assertion.
\set ON_ERROR_STOP on
begin;

\ir ../../supabase/migrations/20261008120000_retail_consignment.sql
-- FUNCTIONS MIGRATION (Task 2 adds the \ir line here)

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

-- FUNCTION ASSERTIONS (Task 2 inserts its blocks here)

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason, '') end
  from t_result order by name;

rollback;
