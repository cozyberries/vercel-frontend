-- Behavioural tests for supabase/migrations/20261009120000_product_sales_ranking.sql.
-- Loads the migration inside one transaction, runs every assertion, then rolls
-- back, so it is safe to run against the production database and mutates
-- nothing. Prints 'PASS <name>' or 'FAIL <name>: <reason>' per assertion.
\set ON_ERROR_STOP on
begin;

\ir ../../supabase/migrations/20261009120000_product_sales_ranking.sql

create temporary table t_result(name text, ok boolean, reason text) on commit drop;

-- Fixtures: throwaway inactive products. Order lines carry no sku and an
-- unknown size, so they match no variant and never touch stock.
insert into public.products (name, slug, price, base_price, is_active) values
  ('ZZ Rank Top', 'zz-rank-top', 500, 476, false),
  ('ZZ Rank Low', 'zz-rank-low', 500, 476, false),
  ('ZZ Rank Tie', 'zz-rank-tie', 500, 476, false),
  ('ZZ Rank Cancelled', 'zz-rank-cancelled', 500, 476, false),
  ('ZZ Rank Unsold', 'zz-rank-unsold', 500, 476, false);

-- An order of p_qty units of p_slug, moved to p_status ('pending' leaves it unpaid).
create function pg_temp.make_order(p_slug text, p_qty int, p_status text) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.orders (user_id, customer_email, subtotal, delivery_charge, total_amount, fulfilment_method)
  values ((select id from auth.users order by created_at limit 1), 'zz@test.local', p_qty, 0, p_qty, 'pickup')
  returning id into v_id;
  insert into public.order_items (order_id, product_id, name, price, quantity, size)
  values (v_id, p_slug, p_slug, 1, p_qty, 'ZZ');
  if p_status <> 'pending' then
    update public.orders set status = p_status where id = v_id;
  end if;
  return v_id;
end $$;

create function pg_temp.rank_of(p_slug text) returns int language sql as $$
  select sales_rank from public.product_sales_ranks where product_slug = p_slug
$$;

select pg_temp.make_order('zz-rank-top', 100000, 'processing');
select pg_temp.make_order('zz-rank-low', 1, 'ready_for_pickup');
select pg_temp.make_order('zz-rank-low', 50000, 'pending');
select pg_temp.make_order('zz-rank-tie', 1, 'collected');
do $$
declare
  v_id uuid := pg_temp.make_order('zz-rank-cancelled', 200000, 'processing');
begin
  update public.orders set status = 'cancelled' where id = v_id;
end $$;

do $$
begin
  insert into t_result values ('top_seller_ranks_first', pg_temp.rank_of('zz-rank-top') = 1,
    format('rank=%s', pg_temp.rank_of('zz-rank-top')));
  insert into t_result values ('unpaid_order_is_not_counted',
    pg_temp.rank_of('zz-rank-low') > pg_temp.rank_of('zz-rank-top'),
    format('low=%s top=%s', pg_temp.rank_of('zz-rank-low'), pg_temp.rank_of('zz-rank-top')));
  insert into t_result values ('equal_sellers_share_a_rank',
    pg_temp.rank_of('zz-rank-tie') = pg_temp.rank_of('zz-rank-low'),
    format('tie=%s low=%s', pg_temp.rank_of('zz-rank-tie'), pg_temp.rank_of('zz-rank-low')));
  insert into t_result values ('cancelled_order_is_not_counted', pg_temp.rank_of('zz-rank-cancelled') is null,
    format('rank=%s', pg_temp.rank_of('zz-rank-cancelled')));
  insert into t_result values ('unsold_product_is_not_listed', pg_temp.rank_of('zz-rank-unsold') is null,
    format('rank=%s', pg_temp.rank_of('zz-rank-unsold')));
  insert into t_result values ('stores_ranks_not_unit_counts',
    (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
      where table_schema = 'public' and table_name = 'product_sales_ranks') = array['product_slug', 'sales_rank'],
    'unexpected columns');
end $$;

-- An admin edit to a paid order's quantity moves the rank.
update public.order_items set quantity = 300000
 where product_id = 'zz-rank-tie' and order_id in (select id from public.orders where status = 'collected');
insert into t_result values ('item_edit_on_paid_order_moves_rank', pg_temp.rank_of('zz-rank-tie') = 1,
  format('rank=%s', pg_temp.rank_of('zz-rank-tie')));

-- Catalogue tier: everyone reads, nobody writes; the refresh functions are not RPC-callable.
insert into t_result values ('anon_reads_but_cannot_write',
  has_table_privilege('anon', 'public.product_sales_ranks', 'SELECT')
  and not has_table_privilege('anon', 'public.product_sales_ranks', 'INSERT, UPDATE, DELETE, TRUNCATE')
  and not has_table_privilege('authenticated', 'public.product_sales_ranks', 'INSERT, UPDATE, DELETE, TRUNCATE'),
  'privileges wrong');
insert into t_result values ('refresh_functions_not_rpc_callable',
  not has_function_privilege('anon', 'public.refresh_product_sales_ranks()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.refresh_product_sales_ranks()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.on_order_change_refresh_sales_ranks()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.on_order_change_refresh_sales_ranks()', 'EXECUTE'),
  'a refresh function is executable by anon or authenticated');
insert into t_result values ('old_callable_function_is_gone',
  to_regprocedure('public.product_sales_ranking()') is null, 'product_sales_ranking() still exists');

-- The public catalog client reads it as anon.
set local role anon;
select count(*) as anon_rows from public.product_sales_ranks \gset
reset role;
insert into t_result values ('anon_sees_the_ranks', :anon_rows > 0, format('rows=%s', :anon_rows));

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason, '') end
  from t_result order by name;

rollback;
