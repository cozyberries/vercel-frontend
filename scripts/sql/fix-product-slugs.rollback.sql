-- Reverses supabase/migrations/20261010120000_fix_product_slugs.sql (slugs and print only;
-- the five foreign keys stay ON UPDATE CASCADE, which is harmless). Apply as one transaction:
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f scripts/sql/fix-product-slugs.rollback.sql
-- Then revert the app commit (redirects would otherwise point at slugs that no longer exist).

create temporary table if not exists slug_renames (
  old_slug text primary key,
  new_slug text not null unique
) on commit drop;
truncate slug_renames;
insert into slug_renames (new_slug, old_slug) values
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

do $$
begin
  if exists (select 1 from slug_renames r where not exists (select 1 from public.products p where p.slug = r.old_slug)) then
    raise exception 'rollback: a new slug is missing; nothing to roll back';
  end if;
end $$;

update public.products p set slug = r.new_slug from slug_renames r where p.slug = r.old_slug;
update public.order_items oi set product_id = r.new_slug from slug_renames r where oi.product_id = r.old_slug;
update public.colors set slug = 'naugthy-nuts', name = 'Naugthy Nuts' where slug = 'naughty-nuts';

create or replace function pg_temp.rolled_back_items(p_items jsonb) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(
           (case when r.new_slug is not null then jsonb_set(t.e, '{id}', to_jsonb(r.new_slug)) else t.e end)
           || (case when t.e->>'color' = 'naughty-nuts' then '{"color": "naugthy-nuts"}'::jsonb else '{}'::jsonb end)
           order by t.ord), '[]'::jsonb)
    from jsonb_array_elements(p_items) with ordinality as t(e, ord)
    left join slug_renames r on r.old_slug = t.e->>'id'
$$;

update public.user_carts set items = pg_temp.rolled_back_items(items)
 where jsonb_typeof(items) = 'array' and pg_temp.rolled_back_items(items) <> items;
update public.user_wishlists set items = pg_temp.rolled_back_items(items)
 where jsonb_typeof(items) = 'array' and pg_temp.rolled_back_items(items) <> items;
update public.checkout_sessions set items = pg_temp.rolled_back_items(items)
 where jsonb_typeof(items) = 'array' and pg_temp.rolled_back_items(items) <> items;
