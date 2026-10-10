-- Behavioural tests for supabase/migrations/20261010140000_fix_variant_slugs.sql.
-- Snapshots the live rows, loads the migration inside one transaction, checks every
-- assertion, then rolls back: safe against production, mutates nothing.
-- Prints 'PASS <name>' or 'FAIL <name>: <reason>' per assertion.
\set ON_ERROR_STOP on
begin;

-- Works before and after the migration is applied: once it is live, the rollback script first
-- restores the old variant slugs inside this transaction, so the migration is exercised the same way.
select exists (select 1 from public.product_variants where slug = 'coords-set-boys-petal-pops-1-2y-petal-pops') as already_applied \gset
\if :already_applied
\ir fix-variant-slugs.rollback.sql
\endif

-- Before: every variant whose slug is not product-size-print, and what it should become.
create temporary table t_map on commit drop as
select v.slug as old_slug, v.product_slug || '-' || v.size_slug || '-' || v.color_slug as new_slug,
       to_jsonb(v) - 'slug' - 'updated_at' as row_minus_slug
  from public.product_variants v
 where v.slug <> v.product_slug || '-' || v.size_slug || '-' || v.color_slug;

create temporary table t_others on commit drop as
select v.slug, to_jsonb(v) - 'updated_at' as row from public.product_variants v
 where v.slug = v.product_slug || '-' || v.size_slug || '-' || v.color_slug;

create temporary table t_lines on commit drop as
select oi.id, oi.sku, public.order_item_variant_slug(oi.sku, oi.product_id, oi.size) as variant
  from public.order_items oi join t_map m on m.old_slug = oi.sku;

create temporary table t_refills on commit drop as
select sr.variant_slug, count(*) as n from public.shelf_refills sr join t_map m on m.old_slug = sr.variant_slug group by 1;
create temporary table t_consignment on commit drop as
select cl.variant_slug, count(*) as n from public.consignment_lines cl join t_map m on m.old_slug = cl.variant_slug group by 1;

select count(*) as variants_before from public.product_variants \gset
select count(*) as lines_before from t_lines \gset

\ir ../../supabase/migrations/20261010140000_fix_variant_slugs.sql

create temporary table t_result(name text, ok boolean, reason text) on commit drop;

insert into t_result
select 'exactly_65_renamed', (select count(*) from t_map) = 65
       and not exists (select 1 from t_map m join public.product_variants v on v.slug = m.old_slug)
       and (select count(*) from t_map m join public.product_variants v on v.slug = m.new_slug) = 65,
       format('mapped=%s', (select count(*) from t_map));

insert into t_result
select 'all_variants_follow_pattern',
       not exists (select 1 from public.product_variants v where v.slug <> v.product_slug || '-' || v.size_slug || '-' || v.color_slug),
       (select string_agg(slug, ', ') from public.product_variants v where v.slug <> v.product_slug || '-' || v.size_slug || '-' || v.color_slug);

insert into t_result
select 'variant_count_unchanged', (select count(*) from public.product_variants) = :variants_before,
       format('before=%s after=%s', :variants_before, (select count(*) from public.product_variants));

insert into t_result
select 'renamed_variants_otherwise_unchanged',
       not exists (select 1 from t_map m join public.product_variants v on v.slug = m.new_slug
                    where (to_jsonb(v) - 'slug' - 'updated_at') is distinct from m.row_minus_slug),
       'price, stock, product, size or print changed on a renamed variant';

insert into t_result
select 'other_variants_untouched',
       not exists (select 1 from t_others o left join public.product_variants v on v.slug = o.slug
                    where v.slug is null or (to_jsonb(v) - 'updated_at') is distinct from o.row),
       'a variant that already followed the pattern changed';

insert into t_result
select 'order_lines_follow', :lines_before = 43
       and not exists (select 1 from public.order_items oi join t_map m on m.old_slug = oi.sku)
       and not exists (select 1 from t_lines l join public.order_items oi on oi.id = l.id join t_map m on m.old_slug = l.sku
                        where oi.sku is distinct from m.new_slug),
       format('lines=%s', :lines_before);

insert into t_result
select 'moved_lines_resolve_same_variant',
       not exists (select 1 from t_lines l join public.order_items oi on oi.id = l.id
                     left join t_map m on m.old_slug = l.variant
                    where public.order_item_variant_slug(oi.sku, oi.product_id, oi.size) is distinct from coalesce(m.new_slug, l.variant)),
       'a past order line no longer resolves to its variant';

insert into t_result
select 'refills_and_consignment_follow',
       not exists (select 1 from public.shelf_refills sr join t_map m on m.old_slug = sr.variant_slug)
       and not exists (select 1 from public.consignment_lines cl join t_map m on m.old_slug = cl.variant_slug)
       and (select coalesce(sum(n), 0) from t_refills) = (select count(*) from public.shelf_refills sr join t_map m on m.new_slug = sr.variant_slug)
       and (select coalesce(sum(n), 0) from t_consignment) = (select count(*) from public.consignment_lines cl join t_map m on m.new_slug = cl.variant_slug),
       format('refills=%s consignment=%s', (select coalesce(sum(n), 0) from t_refills), (select coalesce(sum(n), 0) from t_consignment));

insert into t_result
select 'migration_sets_lock_timeout', current_setting('lock_timeout') = '5s',
       format('lock_timeout=%s', current_setting('lock_timeout'));

do $$
begin
  perform pg_temp.fix_variant_slugs();
  insert into t_result values ('second_run_refuses', false, 'second run did not raise');
exception when others then
  insert into t_result values ('second_run_refuses', sqlerrm like 'fix_variant_slugs:%', sqlerrm);
end $$;

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason, '') end
  from t_result order by name;

rollback;
