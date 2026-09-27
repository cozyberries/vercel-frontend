-- Split the Frocks category into one category per frock style:
--   frock-butterfly-sleeve-*  → Frill Sleeve Muslin  (frill-sleeve-muslin)
--   frock-japanese-*          → Japanese Muslin      (japanese-muslin)
--   frock-sleeveless-*        → Sleeveless Muslin    (sleeveless-muslin)
--   frock-modern-*            → Muslin Collar        (muslin-collar)
-- then delete the Frocks category. Old ?category=frocks links keep showing every
-- frock: the storefront resolves "frocks" to these four (RETIRED_CATEGORIES in
-- lib/catalog/filter.ts). The catalog_change_* triggers rebuild the Redis catalog.
--
-- Tile images reuse photos already in storage: the old Frocks tile (a frill-sleeve
-- frock) and the first photo of one product in each of the other three.
--
-- No begin/commit on purpose: scripts/sql/test-split-frocks-category.sql loads this
-- file inside a rolled-back transaction (npm run db:test-split-frocks). Apply it as
-- one transaction:
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20260927120000_split_frocks_category.sql
-- Every statement is idempotent. If any product is still in Frocks after the move,
-- the migration raises and nothing is changed.

insert into public.categories (name, slug, description, image, display) values
  ('Frill Sleeve Muslin', 'frill-sleeve-muslin',
   'Muslin frocks with fluttery frill sleeves and front buttons',
   'https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/public/media/categories/frocks.webp', true),
  ('Japanese Muslin', 'japanese-muslin',
   'Japanese pan collar frocks in soft pastel muslin',
   'https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/public/media/products/frock-japanese-soft-pear/1.jpg', true),
  ('Sleeveless Muslin', 'sleeveless-muslin',
   'Light sleeveless muslin frocks with front buttons',
   'https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/public/media/products/frock-sleeveless-moons-and-stars/1.jpg', true),
  ('Muslin Collar', 'muslin-collar',
   'Half-sleeve muslin frocks with a classic collar and front buttons',
   'https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/public/media/products/frock-modern-peach/1.jpg', true)
on conflict (slug) do nothing;

update public.products p
   set category_slug = m.category_slug
  from (values
    ('frock-butterfly-sleeve-%', 'frill-sleeve-muslin'),
    ('frock-japanese-%',         'japanese-muslin'),
    ('frock-sleeveless-%',       'sleeveless-muslin'),
    ('frock-modern-%',           'muslin-collar')
  ) as m(slug_pattern, category_slug)
 where p.category_slug = 'frocks'
   and p.slug like m.slug_pattern;

do $$
declare
  v_left text;
begin
  select string_agg(slug, ', ' order by slug) into v_left
    from public.products where category_slug = 'frocks';
  if v_left is not null then
    raise exception 'FROCKS_NOT_EMPTY: no style category for %', v_left;
  end if;

  -- Left over from scripts/upload-category-images.mjs; it references categories.id.
  if to_regclass('public.categories_images') is not null then
    execute 'delete from public.categories_images
              where category_id in (select id from public.categories where slug = ''frocks'')';
  end if;
end
$$;

delete from public.categories where slug = 'frocks';
