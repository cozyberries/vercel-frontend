-- Rename the four frock style categories, slug included, and their products' titles:
--   Frill Sleeve Muslin (frill-sleeve-muslin) → Frill Sleeve Frocks    (frill-sleeve-frocks)
--   Japanese Muslin     (japanese-muslin)     → Japanese Collar Frocks (japanese-collar-frocks)
--   Muslin Collar       (muslin-collar)       → Modern Collar Frocks   (modern-collar-frocks)
--   Sleeveless Muslin   (sleeveless-muslin)   → Sleeveless Frocks      (sleeveless-frocks)
-- Titles keep their print: "Soft Pear - Japanese Muslin Frock" → "Soft Pear - Japanese Collar
-- Frock", "… - Sleeveless Muslin Cotton Frock" → "… - Sleeveless Frock". Product slugs are not
-- changed, and order_items.name / consignment_lines.product_name stay as issued.
-- Old ?category= links keep finding these frocks: the storefront resolves each old slug to
-- itself and its new slug (RETIRED_CATEGORIES in lib/catalog/filter.ts). The catalog_change_*
-- triggers rebuild the Redis catalog.
--
-- products_category_slug_fkey has no ON UPDATE CASCADE, so each new row is inserted (copying
-- description, image, display and created_at), its products moved, and the old row deleted.
-- categories has no id column and nothing else references it.
--
-- No begin/commit on purpose: scripts/sql/test-rename-frock-categories.sql loads this file
-- inside a rolled-back transaction (npm run db:test-rename-frock-categories). Apply it as one
-- transaction:
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20261011120000_rename_frock_categories.sql
-- Every statement is idempotent: a second run changes nothing.
-- Rollback: scripts/sql/rename-frock-categories.rollback.sql.

-- Moving products locks their rows; give up after 5 s (re-run later) rather than queue
-- storefront reads behind this migration.
set local lock_timeout = '5s';

create temporary table if not exists category_renames (
  old_slug text primary key,
  new_slug text not null unique,
  new_name text not null,
  old_title_suffix text not null,
  new_title_suffix text not null
) on commit drop;
truncate category_renames;
insert into category_renames values
  ('frill-sleeve-muslin', 'frill-sleeve-frocks',    'Frill Sleeve Frocks',    ' - Frill Sleeve Muslin Frock',      ' - Frill Sleeve Frock'),
  ('japanese-muslin',     'japanese-collar-frocks', 'Japanese Collar Frocks', ' - Japanese Muslin Frock',          ' - Japanese Collar Frock'),
  ('muslin-collar',       'modern-collar-frocks',   'Modern Collar Frocks',   ' - Muslin Collar Frock',            ' - Modern Collar Frock'),
  ('sleeveless-muslin',   'sleeveless-frocks',      'Sleeveless Frocks',      ' - Sleeveless Muslin Cotton Frock', ' - Sleeveless Frock');

insert into public.categories (name, slug, description, image, display, created_at)
select r.new_name, r.new_slug, c.description, c.image, c.display, c.created_at
  from category_renames r
  join public.categories c on c.slug = r.old_slug
on conflict (slug) do nothing;

update public.products p
   set category_slug = r.new_slug
  from category_renames r
 where p.category_slug = r.old_slug;

delete from public.categories c
 using category_renames r
 where c.slug = r.old_slug;

update public.products p
   set name = left(p.name, length(p.name) - length(r.old_title_suffix)) || r.new_title_suffix
  from category_renames r
 where p.category_slug = r.new_slug
   and right(p.name, length(r.old_title_suffix)) = r.old_title_suffix;

do $$
declare
  v_missing text;
begin
  select string_agg(r.new_slug, ', ') into v_missing
    from category_renames r
   where not exists (select 1 from public.categories c where c.slug = r.new_slug);
  if v_missing is not null then
    raise exception 'rename_frock_categories: neither old nor new category exists for %', v_missing;
  end if;
end $$;
