-- Behavioural tests for supabase/migrations/20261011120000_rename_frock_categories.sql.
-- Loads the migration twice inside one transaction against the live rows, checks the result,
-- then rolls back, so it is safe to run against the production database and mutates nothing
-- (the catalog webhooks queued by pg_net roll back too). Works before and after the migration
-- has been applied.
-- Prints 'PASS <name>' or 'FAIL <name>: <reason>' per assertion.
\set ON_ERROR_STOP on
begin;

create temporary table t_result(name text, ok boolean, reason text) on commit drop;
create temporary table t_map(old_slug text primary key, new_slug text, new_name text) on commit drop;
insert into t_map values
  ('frill-sleeve-muslin', 'frill-sleeve-frocks',    'Frill Sleeve Frocks'),
  ('japanese-muslin',     'japanese-collar-frocks', 'Japanese Collar Frocks'),
  ('muslin-collar',       'modern-collar-frocks',   'Modern Collar Frocks'),
  ('sleeveless-muslin',   'sleeveless-frocks',      'Sleeveless Frocks');

-- Before: each product's category with the old slugs mapped to the new ones, so the same
-- comparison works whether or not the migration has already run.
create temporary table t_before on commit drop as
  select p.slug, coalesce(m.new_slug, p.category_slug) as category_slug, p.name
    from public.products p left join t_map m on m.old_slug = p.category_slug;
-- Title suffix for each renamed category; the print before ' - ' must be kept.
create temporary table t_titles(category_slug text primary key, old_suffix text, new_suffix text) on commit drop;
insert into t_titles values
  ('frill-sleeve-frocks',    ' - Frill Sleeve Muslin Frock', ' - Frill Sleeve Frock'),
  ('japanese-collar-frocks', ' - Japanese Muslin Frock',     ' - Japanese Collar Frock'),
  ('modern-collar-frocks',   ' - Muslin Collar Frock',       ' - Modern Collar Frock'),
  ('sleeveless-frocks',      ' - Sleeveless Muslin Cotton Frock', ' - Sleeveless Frock');
create temporary table t_categories on commit drop as
  select coalesce(m.new_slug, c.slug) as slug, c.description, c.image, c.display, c.created_at
    from public.categories c left join t_map m on m.old_slug = c.slug;

\ir ../../supabase/migrations/20261011120000_rename_frock_categories.sql

do $$
declare
  v_bad text;
begin
  select string_agg(m.new_slug || '=' || coalesce(c.name, 'missing'), ', ') into v_bad
    from t_map m left join public.categories c on c.slug = m.new_slug
   where c.name is distinct from m.new_name;
  insert into t_result values ('new_categories_have_new_names', v_bad is null, v_bad);

  select string_agg(c.slug, ', ') into v_bad
    from public.categories c join t_map m on m.old_slug = c.slug;
  insert into t_result values ('old_categories_gone', v_bad is null, 'still there: ' || v_bad);

  select string_agg(p.slug, ', ') into v_bad
    from public.products p join t_map m on m.old_slug = p.category_slug;
  insert into t_result values ('no_product_on_an_old_slug', v_bad is null, v_bad);

  select string_agg(b.slug || ' ' || b.category_slug || '→' || coalesce(p.category_slug, 'null'), ', ') into v_bad
    from t_before b join public.products p using (slug)
   where p.category_slug is distinct from b.category_slug;
  insert into t_result values ('every_product_keeps_its_category', v_bad is null, v_bad);

  select string_agg(m.new_slug, ', ') into v_bad
    from t_map m
   where not exists (select 1 from public.products p where p.category_slug = m.new_slug);
  insert into t_result values ('renamed_categories_have_products', v_bad is null, 'empty: ' || v_bad);

  -- Description, tile image, visibility and created_at carry over; every other category is untouched.
  select string_agg(b.slug, ', ') into v_bad
    from t_categories b left join public.categories c using (slug)
   where c.slug is null
      or (c.description, c.image, c.display, c.created_at)
         is distinct from (b.description, b.image, b.display, b.created_at);
  insert into t_result values ('category_details_carried_over', v_bad is null, 'changed: ' || v_bad);

  -- Every product in a renamed category gets the new title, print kept: whatever the title was
  -- before (old or already new suffix), it now reads '<print> - <new type>'.
  select string_agg(p.slug || '=' || p.name, ' | ') into v_bad
    from public.products p join t_titles t using (category_slug) join t_before b using (slug)
   where p.name is distinct from
         case when b.name like '%' || t.old_suffix then left(b.name, length(b.name) - length(t.old_suffix)) || t.new_suffix
              else b.name end
      or p.name not like '% - ' || substr(t.new_suffix, 4);
  insert into t_result values ('frock_titles_renamed', v_bad is null, v_bad);

  select string_agg(b.slug || ': ' || b.name || '→' || p.name, ' | ') into v_bad
    from t_before b join public.products p using (slug)
   where b.category_slug not in (select category_slug from t_titles) and p.name is distinct from b.name;
  insert into t_result values ('other_titles_untouched', v_bad is null, v_bad);
end $$;

-- Re-running the migration must change nothing.
create temporary table t_after_products on commit drop as
  select slug, category_slug, name from public.products;
create temporary table t_after_categories on commit drop as
  select slug, name, description, image, display from public.categories;
\ir ../../supabase/migrations/20261011120000_rename_frock_categories.sql

do $$
begin
  insert into t_result values ('rerun_is_a_no_op',
    not exists (select slug, category_slug, name from public.products
                except select slug, category_slug, name from t_after_products)
    and not exists (select slug, name, description, image, display from public.categories
                    except select slug, name, description, image, display from t_after_categories)
    and (select count(*) from public.categories) = (select count(*) from t_after_categories),
    'second run changed rows');
end $$;

-- The rollback script restores the old slugs and names.
\ir rename-frock-categories.rollback.sql

do $$
declare
  v_bad text;
begin
  select string_agg(m.old_slug, ', ') into v_bad
    from t_map m
   where not exists (select 1 from public.categories c where c.slug = m.old_slug)
      or exists (select 1 from public.categories c where c.slug = m.new_slug)
      or exists (select 1 from public.products p where p.category_slug = m.new_slug);
  insert into t_result values ('rollback_restores_old_slugs', v_bad is null, v_bad);

  select string_agg(p.slug || '=' || p.name, ' | ') into v_bad
    from public.products p join t_titles t on p.name like '%' || t.new_suffix;
  insert into t_result values ('rollback_restores_old_titles', v_bad is null, v_bad);
end $$;

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason,'') end
  from t_result order by name;

rollback;
