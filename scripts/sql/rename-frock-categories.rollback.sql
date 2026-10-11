-- Rollback for supabase/migrations/20261011120000_rename_frock_categories.sql: puts the four
-- frock categories and their products' titles back under the old names and slugs. Idempotent.
-- Apply as one transaction:
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f scripts/sql/rename-frock-categories.rollback.sql
-- The storefront keeps working either way (RETIRED_CATEGORIES resolves old and new slugs).
set local lock_timeout = '5s';

create temporary table if not exists category_unrenames (
  old_slug text primary key,
  new_slug text not null unique,
  old_name text not null,
  old_title_suffix text not null,
  new_title_suffix text not null
) on commit drop;
truncate category_unrenames;
insert into category_unrenames values
  ('frill-sleeve-muslin', 'frill-sleeve-frocks',    'Frill Sleeve Muslin', ' - Frill Sleeve Muslin Frock',      ' - Frill Sleeve Frock'),
  ('japanese-muslin',     'japanese-collar-frocks', 'Japanese Muslin',     ' - Japanese Muslin Frock',          ' - Japanese Collar Frock'),
  ('muslin-collar',       'modern-collar-frocks',   'Muslin Collar',       ' - Muslin Collar Frock',            ' - Modern Collar Frock'),
  ('sleeveless-muslin',   'sleeveless-frocks',      'Sleeveless Muslin',   ' - Sleeveless Muslin Cotton Frock', ' - Sleeveless Frock');

update public.products p
   set name = left(p.name, length(p.name) - length(r.new_title_suffix)) || r.old_title_suffix
  from category_unrenames r
 where p.category_slug = r.new_slug
   and right(p.name, length(r.new_title_suffix)) = r.new_title_suffix;

insert into public.categories (name, slug, description, image, display, created_at)
select r.old_name, r.old_slug, c.description, c.image, c.display, c.created_at
  from category_unrenames r
  join public.categories c on c.slug = r.new_slug
on conflict (slug) do nothing;

update public.products p
   set category_slug = r.old_slug
  from category_unrenames r
 where p.category_slug = r.new_slug;

delete from public.categories c
 using category_unrenames r
 where c.slug = r.new_slug;
