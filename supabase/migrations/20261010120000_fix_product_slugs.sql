-- Give 13 products slugs that match their titles (the titles were right), and fix the
-- misspelled Naughty Nuts print. Spec: docs/superpowers/specs/2026-10-10-product-slug-fixes-design.md
-- Map: lib/catalog/renamed-products.json (kept in step with slug_renames below).
--
-- Old product URLs 308 to the new slug (next.config.mjs), so no slug may be reused.
-- Variant slugs are NOT changed: paid orders' order_items.sku must keep resolving them
-- (stock return on cancel, stall refills, the stock dashboard). order_items.name/color stay
-- as issued.
--
-- The five foreign keys onto products(slug) and colors(slug) become ON UPDATE CASCADE, so
-- variants, images, features and ratings follow a rename by themselves.
--
-- No begin/commit on purpose: scripts/sql/test-fix-product-slugs.sql loads this file inside a
-- rolled-back transaction (npm run db:test-product-slugs). Apply it as one transaction:
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20261010120000_fix_product_slugs.sql
-- A second run raises 'fix_product_slugs: …' and changes nothing.
-- Rollback: scripts/sql/fix-product-slugs.rollback.sql.

-- Re-creating the foreign keys takes ACCESS EXCLUSIVE locks on the product tables. If another
-- session holds a lock there, give up after 5 s (re-run later) instead of queueing every
-- storefront read of products behind this migration.
set local lock_timeout = '5s';

create temporary table if not exists slug_renames (
  old_slug text primary key,
  new_slug text not null unique
) on commit drop;
truncate slug_renames;
insert into slug_renames values
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

-- A saved cart / wishlist / checkout line list with old product slugs and the old print re-keyed.
create or replace function pg_temp.renamed_items(p_items jsonb) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(
           (case when r.new_slug is not null then jsonb_set(t.e, '{id}', to_jsonb(r.new_slug)) else t.e end)
           || (case when t.e->>'color' = 'naugthy-nuts' then '{"color": "naughty-nuts"}'::jsonb else '{}'::jsonb end)
           order by t.ord), '[]'::jsonb)
    from jsonb_array_elements(p_items) with ordinality as t(e, ord)
    left join slug_renames r on r.old_slug = t.e->>'id'
$$;

create or replace function pg_temp.fix_product_slugs() returns void
language plpgsql as $$
declare
  v_bad text;
begin
  select string_agg(old_slug, ', ') into v_bad from slug_renames r
   where not exists (select 1 from public.products p where p.slug = r.old_slug);
  if v_bad is not null then
    raise exception 'fix_product_slugs: old slug(s) not found (already applied?): %', v_bad;
  end if;
  select string_agg(new_slug, ', ') into v_bad from slug_renames r
   where exists (select 1 from public.products p where p.slug = r.new_slug)
      or exists (select 1 from slug_renames o where o.old_slug = r.new_slug);
  if v_bad is not null then
    raise exception 'fix_product_slugs: new slug(s) already taken: %', v_bad;
  end if;
  if not exists (select 1 from public.colors where slug = 'naugthy-nuts')
     or exists (select 1 from public.colors where slug = 'naughty-nuts') then
    raise exception 'fix_product_slugs: print naugthy-nuts missing or naughty-nuts already exists';
  end if;

  alter table public.product_features drop constraint product_features_product_slug_fkey,
    add constraint product_features_product_slug_fkey foreign key (product_slug)
      references public.products(slug) on update cascade;
  alter table public.product_images drop constraint product_images_product_slug_fkey,
    add constraint product_images_product_slug_fkey foreign key (product_slug)
      references public.products(slug) on update cascade;
  alter table public.product_variants drop constraint product_variants_product_slug_fkey,
    add constraint product_variants_product_slug_fkey foreign key (product_slug)
      references public.products(slug) on update cascade on delete cascade;
  alter table public.ratings drop constraint ratings_product_slug_fkey,
    add constraint ratings_product_slug_fkey foreign key (product_slug)
      references public.products(slug) on update cascade;
  alter table public.product_variants drop constraint product_variants_color_slug_fkey,
    add constraint product_variants_color_slug_fkey foreign key (color_slug)
      references public.colors(slug) on update cascade;

  -- Children follow by cascade; catalog_change_products posts each rename with old_slug.
  update public.products p set slug = r.new_slug from slug_renames r where p.slug = r.old_slug;
  -- order_items_refresh_sales_ranks rebuilds product_sales_ranks from product_id.
  update public.order_items oi set product_id = r.new_slug from slug_renames r where oi.product_id = r.old_slug;

  -- Variants follow by cascade; product_variants_sync_color_slugs refreshes products.color_slugs.
  update public.colors set slug = 'naughty-nuts', name = 'Naughty Nuts' where slug = 'naugthy-nuts';

  update public.user_carts set items = pg_temp.renamed_items(items)
   where jsonb_typeof(items) = 'array' and pg_temp.renamed_items(items) <> items;
  update public.user_wishlists set items = pg_temp.renamed_items(items)
   where jsonb_typeof(items) = 'array' and pg_temp.renamed_items(items) <> items;
  update public.checkout_sessions set items = pg_temp.renamed_items(items)
   where jsonb_typeof(items) = 'array' and pg_temp.renamed_items(items) <> items;
end $$;

select pg_temp.fix_product_slugs();
