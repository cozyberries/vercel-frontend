-- Behavioural tests for supabase/migrations/20261010120000_fix_product_slugs.sql.
-- Snapshots the live rows, loads the migration inside one transaction, checks every
-- assertion, then rolls back: safe against production, mutates nothing.
-- Prints 'PASS <name>' or 'FAIL <name>: <reason>' per assertion.
\set ON_ERROR_STOP on
begin;

create temporary table t_map(old_slug text primary key, new_slug text not null) on commit drop;
insert into t_map values
  ('coords-set-chinese-collar-soft-pear', 'coords-set-boys-petal-pops'),
  ('coords-set-ruffle-soft-pear', 'coords-set-boys-soft-pear'),
  ('jhabla-shorts-half-sleeve-soft-pear', 'coords-set-girls-ruffle-soft-pear'),
  ('jhabla-shorts-sleeveless-naugthy-nuts', 'jhabla-shorts-sleeveless-lilac-blossom'),
  ('pyjamas-classic-popsicles', 'pyjamas-with-rib-popsicles'),
  ('pyjamas-classic-pine-cone', 'pyjamas-with-rib-pine-cone'),
  ('pyjamas-ribbed-joyful-orbs', 'pyjamas-with-rib-joyful-orbs'),
  ('pyjamas-ribbed-moons-and-stars', 'pyjamas-with-rib-moons-and-stars'),
  ('pyjamas-ribbed-popsicles', 'pyjamas-without-rib-popsicles'),
  ('pyjamas-ribbed-pine-cone', 'pyjamas-without-rib-pine-cone'),
  ('pyjamas-ribbed-mushie-mini', 'pyjamas-without-rib-mushie-mini'),
  ('pyjamas-classic-joyful-orbs', 'pyjamas-without-rib-joyful-orbs'),
  ('pyjamas-classic-moons-and-stars', 'pyjamas-without-rib-moons-and-stars');

-- Before: per product, its title and what hangs off it.
create temporary table t_before on commit drop as
select m.old_slug, m.new_slug, p.name,
       (select count(*) from public.product_variants v where v.product_slug = m.old_slug) as variants,
       (select string_agg(v.slug, ',' order by v.slug) from public.product_variants v where v.product_slug = m.old_slug) as variant_slugs,
       (select count(*) from public.product_images i where i.product_slug = m.old_slug) as images,
       (select count(*) from public.product_features f where f.product_slug = m.old_slug) as features,
       (select count(*) from public.order_items oi where oi.product_id = m.old_slug) as order_lines
  from t_map m join public.products p on p.slug = m.old_slug;

create temporary table t_lines_before on commit drop as
select oi.id, public.order_item_variant_slug(oi.sku, oi.product_id, oi.size) as variant
  from public.order_items oi join t_map m on m.old_slug = oi.product_id;

select count(*) as ranks_before from public.product_sales_ranks \gset
select count(*) as nuts_variants_before from public.product_variants where color_slug = 'naugthy-nuts' \gset

\ir ../../supabase/migrations/20261010120000_fix_product_slugs.sql

create temporary table t_result(name text, ok boolean, reason text) on commit drop;

do $$
declare
  v_bad text;
begin
  select string_agg(b.new_slug, ', ') into v_bad from t_before b
   where not exists (select 1 from public.products p where p.slug = b.new_slug and p.name = b.name);
  insert into t_result values ('new_slugs_keep_titles', (select count(*) from t_before) = 13 and v_bad is null,
    format('before=%s missing=%s', (select count(*) from t_before), v_bad));

  select string_agg(p.slug, ', ') into v_bad from public.products p join t_map m on m.old_slug = p.slug;
  insert into t_result values ('old_slugs_gone', v_bad is null, coalesce(v_bad, ''));

  select string_agg(b.new_slug, ', ') into v_bad from t_before b
   where b.variants <> (select count(*) from public.product_variants v where v.product_slug = b.new_slug)
      or b.images <> (select count(*) from public.product_images i where i.product_slug = b.new_slug)
      or b.features <> (select count(*) from public.product_features f where f.product_slug = b.new_slug);
  insert into t_result values ('variants_images_features_follow', v_bad is null, coalesce(v_bad, ''));

  select string_agg(b.new_slug, ', ') into v_bad from t_before b
   where b.variant_slugs is distinct from
         (select string_agg(v.slug, ',' order by v.slug) from public.product_variants v where v.product_slug = b.new_slug);
  insert into t_result values ('variant_slugs_unchanged', v_bad is null, coalesce(v_bad, ''));

  select string_agg(b.new_slug, ', ') into v_bad from t_before b
   where b.order_lines <> (select count(*) from public.order_items oi where oi.product_id = b.new_slug)
      or exists (select 1 from public.order_items oi where oi.product_id = b.old_slug);
  insert into t_result values ('order_lines_follow', v_bad is null, coalesce(v_bad, ''));

  select string_agg(l.id::text, ', ') into v_bad from t_lines_before l
    join public.order_items oi on oi.id = l.id
   where l.variant is distinct from public.order_item_variant_slug(oi.sku, oi.product_id, oi.size);
  insert into t_result values ('moved_lines_still_resolve_variants', v_bad is null, coalesce(v_bad, ''));
end $$;

insert into t_result
select 'ranks_follow',
       (select count(*) from public.product_sales_ranks) = :ranks_before
       and not exists (select 1 from public.product_sales_ranks r join t_map m on m.old_slug = r.product_slug),
       format('before=%s after=%s', :ranks_before, (select count(*) from public.product_sales_ranks));

insert into t_result
select 'saved_lists_rekeyed',
       not exists (
         select 1 from (
           select items from public.user_carts
           union all select items from public.user_wishlists
           union all select items from public.checkout_sessions where jsonb_typeof(items) = 'array'
         ) s, jsonb_array_elements(s.items) e
          where e->>'id' in (select old_slug from t_map) or e->>'color' = 'naugthy-nuts'),
       'an old slug or the old print is still in a cart, wishlist or checkout session';

insert into t_result
select 'print_renamed',
       exists (select 1 from public.colors where slug = 'naughty-nuts' and name = 'Naughty Nuts')
       and not exists (select 1 from public.colors where slug = 'naugthy-nuts'),
       'colors row not renamed';

insert into t_result
select 'print_variants_and_product_colours',
       (select count(*) from public.product_variants where color_slug = 'naughty-nuts') = :nuts_variants_before
       and not exists (select 1 from public.products where 'naugthy-nuts' = any(color_slugs))
       and exists (select 1 from public.products where slug = 'coords-set-boys-naughty-nuts' and 'naughty-nuts' = any(color_slugs)),
       format('variants=%s (before %s)', (select count(*) from public.product_variants where color_slug = 'naughty-nuts'), :nuts_variants_before);

-- Final review 2026-10-10: the FK re-creation takes ACCESS EXCLUSIVE locks; a stuck session on
-- products must make the migration give up quickly, not queue every storefront read behind it.
insert into t_result
select 'migration_sets_lock_timeout', current_setting('lock_timeout') = '5s',
       format('lock_timeout=%s', current_setting('lock_timeout'));

insert into t_result
select 'fks_cascade_on_update',
       (select count(*) from pg_constraint
         where conname in ('product_features_product_slug_fkey', 'product_images_product_slug_fkey',
                           'product_variants_product_slug_fkey', 'ratings_product_slug_fkey',
                           'product_variants_color_slug_fkey')
           and pg_get_constraintdef(oid) like '%ON UPDATE CASCADE%') = 5,
       'expected 5 foreign keys with ON UPDATE CASCADE';

do $$
begin
  perform pg_temp.fix_product_slugs();
  insert into t_result values ('second_run_refuses', false, 'second run did not raise');
exception when others then
  insert into t_result values ('second_run_refuses', sqlerrm like 'fix_product_slugs:%', sqlerrm);
end $$;

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason, '') end
  from t_result order by name;

rollback;
