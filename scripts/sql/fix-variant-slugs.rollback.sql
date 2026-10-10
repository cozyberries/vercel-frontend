-- Reverses supabase/migrations/20261010140000_fix_variant_slugs.sql. Apply as one transaction:
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f scripts/sql/fix-variant-slugs.rollback.sql
-- Pairs below are (current slug, slug to restore).

set local lock_timeout = '5s';

create temporary table if not exists variant_rollback (
  current_slug text primary key,
  restore_slug text not null unique
) on commit drop;
truncate variant_rollback;
insert into variant_rollback values
  ('coords-set-boys-naughty-nuts-1-2y-naughty-nuts', 'coords-set-boys-naughty-nuts-1-2y-naugthy-nuts'),
  ('coords-set-boys-naughty-nuts-2-3y-naughty-nuts', 'coords-set-boys-naughty-nuts-2-3y-naugthy-nuts'),
  ('coords-set-boys-naughty-nuts-3-4y-naughty-nuts', 'coords-set-boys-naughty-nuts-3-4y-naugthy-nuts'),
  ('coords-set-boys-naughty-nuts-4-5y-naughty-nuts', 'coords-set-boys-naughty-nuts-4-5y-naugthy-nuts'),
  ('coords-set-boys-naughty-nuts-5-6y-naughty-nuts', 'coords-set-boys-naughty-nuts-5-6y-naugthy-nuts'),
  ('coords-set-boys-naughty-nuts-6-12m-naughty-nuts', 'coords-set-boys-naughty-nuts-6-12m-naugthy-nuts'),
  ('coords-set-boys-petal-pops-1-2y-petal-pops', 'coords-set-chinese-collar-soft-pear-1-2y-petal-pops'),
  ('coords-set-boys-petal-pops-2-3y-petal-pops', 'coords-set-chinese-collar-soft-pear-2-3y-petal-pops'),
  ('coords-set-boys-petal-pops-3-4y-petal-pops', 'coords-set-chinese-collar-soft-pear-3-4y-petal-pops'),
  ('coords-set-boys-petal-pops-4-5y-petal-pops', 'coords-set-chinese-collar-soft-pear-4-5y-petal-pops'),
  ('coords-set-boys-petal-pops-5-6y-petal-pops', 'coords-set-chinese-collar-soft-pear-5-6y-petal-pops'),
  ('coords-set-boys-petal-pops-6-12m-petal-pops', 'coords-set-chinese-collar-soft-pear-6-12m-petal-pops'),
  ('coords-set-girls-naughty-nuts-1-2y-naughty-nuts', 'coords-set-girls-naughty-nuts-1-2y-naugthy-nuts'),
  ('coords-set-girls-naughty-nuts-2-3y-naughty-nuts', 'coords-set-girls-naughty-nuts-2-3y-naugthy-nuts'),
  ('coords-set-girls-naughty-nuts-3-4y-naughty-nuts', 'coords-set-girls-naughty-nuts-3-4y-naugthy-nuts'),
  ('coords-set-girls-naughty-nuts-4-5y-naughty-nuts', 'coords-set-girls-naughty-nuts-4-5y-naugthy-nuts'),
  ('coords-set-girls-naughty-nuts-5-6y-naughty-nuts', 'coords-set-girls-naughty-nuts-5-6y-naugthy-nuts'),
  ('coords-set-girls-naughty-nuts-6-12m-naughty-nuts', 'coords-set-girls-naughty-nuts-6-12m-naugthy-nuts'),
  ('coords-set-boys-soft-pear-1-2y-soft-pear', 'coords-set-ruffle-soft-pear-1-2y-soft-pear'),
  ('coords-set-boys-soft-pear-2-3y-soft-pear', 'coords-set-ruffle-soft-pear-2-3y-soft-pear'),
  ('coords-set-boys-soft-pear-3-4y-soft-pear', 'coords-set-ruffle-soft-pear-3-4y-soft-pear'),
  ('coords-set-boys-soft-pear-4-5y-soft-pear', 'coords-set-ruffle-soft-pear-4-5y-soft-pear'),
  ('coords-set-boys-soft-pear-5-6y-soft-pear', 'coords-set-ruffle-soft-pear-5-6y-soft-pear'),
  ('coords-set-boys-soft-pear-6-12m-soft-pear', 'coords-set-ruffle-soft-pear-6-12m-soft-pear'),
  ('coords-set-girls-ruffle-soft-pear-1-2y-soft-pear', 'jhabla-shorts-half-sleeve-soft-pear-1-2y-soft-pear'),
  ('coords-set-girls-ruffle-soft-pear-2-3y-soft-pear', 'jhabla-shorts-half-sleeve-soft-pear-2-3y-soft-pear'),
  ('coords-set-girls-ruffle-soft-pear-3-4y-soft-pear', 'jhabla-shorts-half-sleeve-soft-pear-3-4y-soft-pear'),
  ('coords-set-girls-ruffle-soft-pear-4-5y-soft-pear', 'jhabla-shorts-half-sleeve-soft-pear-4-5y-soft-pear'),
  ('coords-set-girls-ruffle-soft-pear-5-6y-soft-pear', 'jhabla-shorts-half-sleeve-soft-pear-5-6y-soft-pear'),
  ('coords-set-girls-ruffle-soft-pear-6-12m-soft-pear', 'jhabla-shorts-half-sleeve-soft-pear-6-12m-soft-pear'),
  ('jhabla-shorts-sleeveless-lilac-blossom-1-2y-lilac-blossom', 'jhabla-shorts-sleeveless-naugthy-nuts-1-2y-lilac-blossom'),
  ('jhabla-shorts-sleeveless-lilac-blossom-6-12m-lilac-blossom', 'jhabla-shorts-sleeveless-naugthy-nuts-6-12m-lilac-blossom'),
  ('pyjamas-without-rib-joyful-orbs-1-2y-joyful-orbs', 'pyjamas-classic-joyful-orbs-1-2y-joyful-orbs'),
  ('pyjamas-without-rib-joyful-orbs-2-3y-joyful-orbs', 'pyjamas-classic-joyful-orbs-2-3y-joyful-orbs'),
  ('pyjamas-without-rib-joyful-orbs-3-4y-joyful-orbs', 'pyjamas-classic-joyful-orbs-3-4y-joyful-orbs'),
  ('pyjamas-without-rib-joyful-orbs-4-5y-joyful-orbs', 'pyjamas-classic-joyful-orbs-4-5y-joyful-orbs'),
  ('pyjamas-without-rib-joyful-orbs-6-12m-joyful-orbs', 'pyjamas-classic-joyful-orbs-6-12m-joyful-orbs'),
  ('pyjamas-without-rib-moons-and-stars-1-2y-moon-and-stars', 'pyjamas-classic-moons-and-stars-1-2y-moon-and-stars'),
  ('pyjamas-without-rib-moons-and-stars-2-3y-moon-and-stars', 'pyjamas-classic-moons-and-stars-2-3y-moon-and-stars'),
  ('pyjamas-without-rib-moons-and-stars-3-4y-moon-and-stars', 'pyjamas-classic-moons-and-stars-3-4y-moon-and-stars'),
  ('pyjamas-without-rib-moons-and-stars-4-5y-moon-and-stars', 'pyjamas-classic-moons-and-stars-4-5y-moon-and-stars'),
  ('pyjamas-without-rib-moons-and-stars-6-12m-moon-and-stars', 'pyjamas-classic-moons-and-stars-6-12m-moon-and-stars'),
  ('pyjamas-with-rib-pine-cone-0-3m-pine-cone', 'pyjamas-classic-pine-cone-0-3m-pine-cone'),
  ('pyjamas-with-rib-pine-cone-3-6m-pine-cone', 'pyjamas-classic-pine-cone-3-6m-pine-cone'),
  ('pyjamas-with-rib-popsicles-0-3m-popsicles', 'pyjamas-classic-popsicles-0-3m-popsicles'),
  ('pyjamas-with-rib-popsicles-3-6m-popsicles', 'pyjamas-classic-popsicles-3-6m-popsicles'),
  ('pyjamas-with-rib-joyful-orbs-0-3m-joyful-orbs', 'pyjamas-ribbed-joyful-orbs-0-3m-joyful-orbs'),
  ('pyjamas-with-rib-joyful-orbs-3-6m-joyful-orbs', 'pyjamas-ribbed-joyful-orbs-3-6m-joyful-orbs'),
  ('pyjamas-with-rib-moons-and-stars-0-3m-moon-and-stars', 'pyjamas-ribbed-moons-and-stars-0-3m-moon-and-stars'),
  ('pyjamas-with-rib-moons-and-stars-3-6m-moon-and-stars', 'pyjamas-ribbed-moons-and-stars-3-6m-moon-and-stars'),
  ('pyjamas-without-rib-mushie-mini-1-2y-mushie-mini', 'pyjamas-ribbed-mushie-mini-1-2y-mushie-mini'),
  ('pyjamas-without-rib-mushie-mini-2-3y-mushie-mini', 'pyjamas-ribbed-mushie-mini-2-3y-mushie-mini'),
  ('pyjamas-without-rib-mushie-mini-3-4y-mushie-mini', 'pyjamas-ribbed-mushie-mini-3-4y-mushie-mini'),
  ('pyjamas-without-rib-mushie-mini-4-5y-mushie-mini', 'pyjamas-ribbed-mushie-mini-4-5y-mushie-mini'),
  ('pyjamas-without-rib-mushie-mini-6-12m-mushie-mini', 'pyjamas-ribbed-mushie-mini-6-12m-mushie-mini'),
  ('pyjamas-without-rib-pine-cone-1-2y-pine-cone', 'pyjamas-ribbed-pine-cone-1-2y-pine-cone'),
  ('pyjamas-without-rib-pine-cone-2-3y-pine-cone', 'pyjamas-ribbed-pine-cone-2-3y-pine-cone'),
  ('pyjamas-without-rib-pine-cone-3-4y-pine-cone', 'pyjamas-ribbed-pine-cone-3-4y-pine-cone'),
  ('pyjamas-without-rib-pine-cone-4-5y-pine-cone', 'pyjamas-ribbed-pine-cone-4-5y-pine-cone'),
  ('pyjamas-without-rib-pine-cone-6-12m-pine-cone', 'pyjamas-ribbed-pine-cone-6-12m-pine-cone'),
  ('pyjamas-without-rib-popsicles-1-2y-popsicles', 'pyjamas-ribbed-popsicles-1-2y-popsicles'),
  ('pyjamas-without-rib-popsicles-2-3y-popsicles', 'pyjamas-ribbed-popsicles-2-3y-popsicles'),
  ('pyjamas-without-rib-popsicles-3-4y-popsicles', 'pyjamas-ribbed-popsicles-3-4y-popsicles'),
  ('pyjamas-without-rib-popsicles-4-5y-popsicles', 'pyjamas-ribbed-popsicles-4-5y-popsicles'),
  ('pyjamas-without-rib-popsicles-6-12m-popsicles', 'pyjamas-ribbed-popsicles-6-12m-popsicles');

do $$
begin
  if exists (select 1 from variant_rollback r where not exists (select 1 from public.product_variants v where v.slug = r.current_slug)) then
    raise exception 'rollback: a renamed variant is missing; nothing to roll back';
  end if;
end $$;

update public.order_items oi set sku = r.restore_slug from variant_rollback r where oi.sku = r.current_slug;
update public.product_variants v set slug = r.restore_slug from variant_rollback r where v.slug = r.current_slug;
