-- Behavioural tests for
-- supabase/migrations/20260927140000_fix_category_gender_and_descriptions.sql.
-- Loads the migration twice inside one transaction against the live rows, checks
-- the result, then rolls back, so it is safe to run against the production
-- database and mutates nothing (the catalog webhooks queued by pg_net roll back
-- too). Works before and after the migration has been applied.
-- Prints 'PASS <name>' or 'FAIL <name>: <reason>' per assertion.
\set ON_ERROR_STOP on
begin;

create temporary table t_result(name text, ok boolean, reason text) on commit drop;
create temporary table t_products on commit drop as
  select slug, category_slug, gender_slug from public.products;
create temporary table t_categories on commit drop as
  select slug, name, description from public.categories;
create temporary table t_want(slug text primary key, description text) on commit drop;
insert into t_want values
  ('boys-coord-sets',              'Chinese collar shirt and shorts co-ord sets in breathable muslin'),
  ('girls-coord-sets',             'Muslin co-ord sets with bow, layered or ruffle sleeve tops'),
  ('half-sleeve-jabla-and-shorts', 'Half-sleeve jablas with front buttons and matching shorts'),
  ('newborn-essentials',           '7-piece essentials kits for newborns, sized 0-3 months'),
  ('pyjamas',                      'Full-sleeve pyjama sets with full-length pants, with or without ribbed cuffs'),
  ('rompers',                      'Muslin rompers: loose Mayra rompers for girls and half-sleeve unisex rompers'),
  ('sleeveless-jabla-and-shorts',  'Sleeveless jablas with front buttons and matching shorts'),
  ('sleeveless-jablas',            'Airy sleeveless jablas with front buttons, for 0-6 months');

\ir ../../supabase/migrations/20260927140000_fix_category_gender_and_descriptions.sql

do $$
declare
  v_bad text;
begin
  select string_agg(slug || '=' || coalesce(gender_slug, 'null'), ', ') into v_bad
    from public.products where category_slug = 'girls-coord-sets' and gender_slug is distinct from 'girl';
  insert into t_result values ('girls_coord_sets_are_girl',
    v_bad is null and exists (select 1 from public.products where category_slug = 'girls-coord-sets'),
    coalesce(v_bad, 'no products in girls-coord-sets'));

  -- The Boys filter matches boy + unisex (resolveGenderSlugs); none of these may reach it.
  select string_agg(slug, ', ') into v_bad
    from public.products where category_slug = 'girls-coord-sets' and gender_slug in ('boy', 'unisex');
  insert into t_result values ('boys_filter_excludes_girls_coord_sets', v_bad is null, v_bad);

  select string_agg(b.slug || ' ' || coalesce(b.gender_slug, 'null') || '→' || coalesce(p.gender_slug, 'null'), ', ') into v_bad
    from t_products b join public.products p using (slug)
   where b.category_slug is distinct from 'girls-coord-sets' and p.gender_slug is distinct from b.gender_slug;
  insert into t_result values ('other_products_keep_their_gender', v_bad is null, v_bad);

  select string_agg(w.slug || '=' || coalesce(c.description, 'null'), ' | ') into v_bad
    from t_want w left join public.categories c using (slug)
   where c.description is distinct from w.description;
  insert into t_result values ('descriptions_fixed', v_bad is null, v_bad);

  select string_agg(b.slug, ', ') into v_bad
    from t_categories b join public.categories c using (slug)
   where b.slug not in (select slug from t_want)
     and (c.description is distinct from b.description or c.name is distinct from b.name);
  insert into t_result values ('other_categories_untouched', v_bad is null, 'changed: ' || v_bad);
end $$;

-- Re-running the migration must change nothing.
create temporary table t_after_products on commit drop as
  select slug, category_slug, gender_slug from public.products;
create temporary table t_after_categories on commit drop as
  select slug, name, description from public.categories;
\ir ../../supabase/migrations/20260927140000_fix_category_gender_and_descriptions.sql

do $$
begin
  insert into t_result values ('rerun_is_a_no_op',
    not exists (select slug, category_slug, gender_slug from public.products
                except select slug, category_slug, gender_slug from t_after_products)
    and not exists (select slug, name, description from public.categories
                    except select slug, name, description from t_after_categories)
    and (select count(*) from public.products) = (select count(*) from t_products)
    and (select count(*) from public.categories) = (select count(*) from t_categories),
    'second run changed rows, or a run added or removed rows');
end $$;

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason,'') end
  from t_result order by name;

rollback;
