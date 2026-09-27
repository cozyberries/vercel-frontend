-- Behavioural tests for supabase/migrations/20260927120000_split_frocks_category.sql.
-- Loads the migration twice inside one transaction against the live rows, checks
-- the result, then rolls back, so it is safe to run against the production
-- database and mutates nothing (the catalog webhooks queued by pg_net roll back
-- too). Works before and after the migration has been applied.
-- Prints 'PASS <name>' or 'FAIL <name>: <reason>' per assertion.
\set ON_ERROR_STOP on
begin;

create temporary table t_result(name text, ok boolean, reason text) on commit drop;
create temporary table t_before on commit drop as
  select slug, category_slug from public.products;

create function pg_temp.style_category(p_slug text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_slug like 'frock-butterfly-sleeve-%' then 'frill-sleeve-muslin'
    when p_slug like 'frock-japanese-%'         then 'japanese-muslin'
    when p_slug like 'frock-sleeveless-%'       then 'sleeveless-muslin'
    when p_slug like 'frock-modern-%'           then 'muslin-collar'
  end
$$;

\ir ../../supabase/migrations/20260927120000_split_frocks_category.sql

do $$
declare
  v_bad text;
begin
  select string_agg(slug || '=' || coalesce(name, 'missing'), ', ' order by slug) into v_bad
    from (values ('frill-sleeve-muslin', 'Frill Sleeve Muslin'), ('japanese-muslin', 'Japanese Muslin'),
                 ('sleeveless-muslin', 'Sleeveless Muslin'), ('muslin-collar', 'Muslin Collar')) as want(slug, want_name)
    left join public.categories c using (slug)
   where c.name is distinct from want.want_name or c.display is not true or coalesce(c.image, '') = '';
  insert into t_result values ('style_categories_created', v_bad is null, v_bad);

  insert into t_result values ('frocks_category_deleted',
    not exists (select 1 from public.categories where slug = 'frocks'), 'frocks is still a category');

  select string_agg(slug, ', ') into v_bad from public.products where category_slug = 'frocks';
  insert into t_result values ('no_product_left_in_frocks', v_bad is null, v_bad);

  select string_agg(b.slug || ' is in ' || coalesce(p.category_slug, 'null'), ', ') into v_bad
    from t_before b join public.products p using (slug)
   where b.category_slug = 'frocks' and p.category_slug is distinct from pg_temp.style_category(b.slug);
  insert into t_result values ('frocks_moved_by_style', v_bad is null, v_bad);

  select string_agg(want.slug, ', ') into v_bad
    from (values ('frill-sleeve-muslin'), ('japanese-muslin'), ('sleeveless-muslin'), ('muslin-collar')) as want(slug)
   where not exists (select 1 from public.products p where p.category_slug = want.slug);
  insert into t_result values ('each_style_category_has_products', v_bad is null, 'empty: ' || v_bad);

  select string_agg(b.slug, ', ') into v_bad
    from t_before b join public.products p using (slug)
   where b.category_slug is distinct from 'frocks' and p.category_slug is distinct from b.category_slug;
  insert into t_result values ('other_products_untouched', v_bad is null, 'moved: ' || v_bad);
end $$;

-- Re-running the migration must change nothing.
create temporary table t_after on commit drop as
  select slug, category_slug from public.products;
\ir ../../supabase/migrations/20260927120000_split_frocks_category.sql

do $$
begin
  insert into t_result values ('rerun_is_a_no_op',
    not exists (select slug, category_slug from public.products
                except select slug, category_slug from t_after)
    and (select count(*) from public.categories
          where slug in ('frill-sleeve-muslin', 'japanese-muslin', 'sleeveless-muslin', 'muslin-collar')) = 4,
    'second run changed products or duplicated a category');
end $$;

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason,'') end
  from t_result order by name;

rollback;
