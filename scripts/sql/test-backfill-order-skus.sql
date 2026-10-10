-- Behavioural tests for supabase/migrations/20261010160000_backfill_order_item_skus.sql.
-- Snapshots the live rows, loads the migration inside one transaction, checks every
-- assertion, then rolls back: safe against production, mutates nothing.
-- Prints 'PASS <name>' or 'FAIL <name>: <reason>' per assertion.
\set ON_ERROR_STOP on
begin;

-- Works before and after the migration is applied: once it is live, the rollback script first
-- clears the 37 backfilled skus inside this transaction, so the migration is exercised the same way.
select exists (select 1 from public.order_items where id = '3f9afd14-f5ce-4127-b878-ddb8bc87ac44' and sku is not null) as already_applied \gset
\if :already_applied
\ir backfill-order-skus.rollback.sql
\endif

-- Before: lines with no recorded variant, and the variant they match by product + size today.
create temporary table t_missing on commit drop as
select oi.id, public.order_item_variant_slug(oi.sku, oi.product_id, oi.size) as resolved,
       to_jsonb(oi) - 'sku' as row_minus_sku
  from public.order_items oi where oi.sku is null;

create temporary table t_others on commit drop as
select oi.id, to_jsonb(oi) as row from public.order_items oi where oi.sku is not null;

select coalesce(sum(stock_quantity), 0) as stock_before from public.product_variants \gset
select count(*) as ranks_before, coalesce(sum(sales_rank), 0) as rank_sum_before from public.product_sales_ranks \gset

\ir ../../supabase/migrations/20261010160000_backfill_order_item_skus.sql

create temporary table t_result(name text, ok boolean, reason text) on commit drop;

insert into t_result
select 'exactly_37_backfilled', (select count(*) from t_missing) = 37
       and (select count(*) from t_missing m join public.order_items oi on oi.id = m.id where oi.sku is not null) = 37,
       format('missing before=%s', (select count(*) from t_missing));

insert into t_result
select 'no_line_without_sku', not exists (select 1 from public.order_items where sku is null),
       format('still null=%s', (select count(*) from public.order_items where sku is null));

insert into t_result
select 'backfilled_sku_is_the_matched_variant',
       not exists (select 1 from t_missing m join public.order_items oi on oi.id = m.id where oi.sku is distinct from m.resolved),
       'a backfilled sku differs from the variant the line matched by product + size';

insert into t_result
select 'lines_resolve_same_variant',
       not exists (select 1 from t_missing m join public.order_items oi on oi.id = m.id
                    where public.order_item_variant_slug(oi.sku, oi.product_id, oi.size) is distinct from m.resolved),
       'a backfilled line resolves to a different variant';

insert into t_result
select 'backfilled_lines_otherwise_unchanged',
       not exists (select 1 from t_missing m join public.order_items oi on oi.id = m.id
                    where (to_jsonb(oi) - 'sku') is distinct from m.row_minus_sku),
       'name, price, quantity, size, colour or image changed';

insert into t_result
select 'other_lines_untouched',
       not exists (select 1 from t_others o left join public.order_items oi on oi.id = o.id
                    where oi.id is null or to_jsonb(oi) is distinct from o.row),
       'a line that already had a sku changed';

insert into t_result
select 'stock_and_ranks_unchanged',
       (select coalesce(sum(stock_quantity), 0) from public.product_variants) = :stock_before
       and (select count(*) from public.product_sales_ranks) = :ranks_before
       and (select coalesce(sum(sales_rank), 0) from public.product_sales_ranks) = :rank_sum_before,
       format('stock %s→%s', :stock_before, (select coalesce(sum(stock_quantity), 0) from public.product_variants));

insert into t_result
select 'migration_sets_lock_timeout', current_setting('lock_timeout') = '5s',
       format('lock_timeout=%s', current_setting('lock_timeout'));

do $$
begin
  perform pg_temp.backfill_order_item_skus();
  insert into t_result values ('second_run_refuses', false, 'second run did not raise');
exception when others then
  insert into t_result values ('second_run_refuses', sqlerrm like 'backfill_order_item_skus:%', sqlerrm);
end $$;

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason, '') end
  from t_result order by name;

rollback;
