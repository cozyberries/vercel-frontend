-- Record the variant on the 37 order lines that have none (orders 28 Feb – 12 Sep 2026, placed
-- before checkout saved order_items.sku). Each line gets the variant it already matches by
-- product + size (public.order_item_variant_slug's fallback), so stock returns, stall refills and
-- the sales/stock dashboards resolve exactly as before; only the sku column changes. Names,
-- prices, quantities, sizes, colours and images stay as issued. No trigger reacts to sku, so
-- stock and best-seller ranks are untouched.
--
-- No begin/commit on purpose: scripts/sql/test-backfill-order-skus.sql loads this file inside a
-- rolled-back transaction (npm run db:test-order-skus). Apply it as one transaction:
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20261010160000_backfill_order_item_skus.sql
-- A second run raises 'backfill_order_item_skus: …' and changes nothing.
-- Rollback: scripts/sql/backfill-order-skus.rollback.sql.

set local lock_timeout = '5s';

create temporary table if not exists sku_backfill (
  order_item_id uuid primary key,
  sku text not null
) on commit drop;
truncate sku_backfill;
insert into sku_backfill values
  ('3f9afd14-f5ce-4127-b878-ddb8bc87ac44', 'frock-modern-peach-4-5y-baby-blush'),
  ('41c93959-7136-4776-aa5d-95e8ad5d5a73', 'coords-set-girls-ruffle-soft-pear-4-5y-soft-pear'),
  ('09f50e65-8b37-4748-872f-4b309b8bd708', 'pyjamas-without-rib-popsicles-3-4y-popsicles'),
  ('2cb363b5-5f4c-419b-8503-1182aa6e5a64', 'jhabla-shorts-sleeveless-moons-and-stars-1-2y-moon-and-stars'),
  ('645d9d55-3a14-40cf-ad55-3b0392434f0c', 'pyjamas-without-rib-mushie-mini-3-4y-mushie-mini'),
  ('673a8385-d4df-4460-abeb-c2f99ab08c27', 'frock-butterfly-sleeve-mushie-mini-3-4y-mushie-mini'),
  ('be00a05f-a477-4a87-a557-9b330c7db636', 'pyjamas-without-rib-joyful-orbs-1-2y-joyful-orbs'),
  ('8887ad19-12aa-4e51-9cc0-23a116efb72a', 'jhabla-shorts-half-sleeve-popsicles-3-4y-popsicles'),
  ('f9959e39-27d4-4572-90e9-1b364106b32d', 'jhabla-shorts-sleeveless-lilac-blossom-1-2y-lilac-blossom'),
  ('b79b9986-60f8-44cb-a015-2fc4f2b70fa6', 'coords-set-rocket-rangers-6-12m-rocket-ranger'),
  ('aa35cc10-ba14-4c33-bbe5-0bf69734fe77', 'jhabla-sleeveless-moons-and-stars-0-3m-moon-and-stars'),
  ('c850131b-ccc4-4673-b56a-e258e8ce713b', 'pyjamas-with-rib-popsicles-0-3m-popsicles'),
  ('cb0e0d91-082f-43f7-8002-ed7abf8c8d2d', 'new-born-essential-kits-joyful-orbs-0-3m-joyful-orbs'),
  ('f144d2a2-dabe-4905-a743-cf28c841c715', 'new-born-essential-kits-popsicles-0-3m-popsicles'),
  ('f1e445cf-9038-42e5-b816-21b2acb5e961', 'pyjamas-with-rib-joyful-orbs-0-3m-joyful-orbs'),
  ('a321016e-c25a-403d-810a-60942c28002b', 'coords-set-boys-soft-pear-1-2y-soft-pear'),
  ('221a1b00-0fa1-4c63-b1bf-b0f131ff2521', 'coords-set-rocket-rangers-5-6y-rocket-ranger'),
  ('54b1795d-d3ba-4d9f-acec-0c1efe9cd15a', 'coords-set-rocket-rangers-2-3y-rocket-ranger'),
  ('90a87d6f-6f3d-4d69-9fc1-8b737f6f0344', 'jhabla-shorts-half-sleeve-mushie-mini-3-6m-mushie-mini'),
  ('9cfa904d-5bfe-4f7a-b841-a7f889441231', 'rompers-girls-only-loose-fit-petal-pops-1-2y-petal-pops'),
  ('19226936-d056-4917-8af1-66fbebaad359', 'coords-set-layered-mushie-mini-2-3y-mushie-mini'),
  ('a6e24520-1336-4a78-b596-ba9dca27d00f', 'frock-modern-aloe-green-2-3y-aloe-mist'),
  ('32780a2f-9aed-47dc-88a9-eaa09ddfd2e0', 'frock-modern-peach-2-3y-baby-blush'),
  ('78b2349c-43eb-4c58-97dd-21601f69a4b0', 'coords-set-layered-pine-cone-3-4y-pine-cone'),
  ('8117bcce-3dde-4d74-b2d6-808fc8d857b7', 'pyjamas-without-rib-moons-and-stars-2-3y-moon-and-stars'),
  ('87179686-9f46-4770-b827-6b82c3e36cb2', 'frock-modern-aloe-green-3-4y-aloe-mist'),
  ('91b6123c-201a-4a0d-a315-4d7365b26fd0', 'jhabla-shorts-sleeveless-moons-and-stars-1-2y-moon-and-stars'),
  ('b901c8ed-db07-4c65-b402-fa1a467383bb', 'pyjamas-without-rib-mushie-mini-2-3y-mushie-mini'),
  ('bcdca24c-23a0-4c5d-a92e-8980ecd384c6', 'coords-set-girls-ruffle-soft-pear-3-4y-soft-pear'),
  ('c30264ca-5941-4d08-9e23-7cbc421aee99', 'coords-set-boys-petal-pops-2-3y-petal-pops'),
  ('196cb1b8-ddf2-4143-943f-990c5086741b', 'pyjamas-with-rib-joyful-orbs-0-3m-joyful-orbs'),
  ('44369e35-6dd5-498b-b386-0623982cb31b', 'jhabla-shorts-half-sleeve-joyful-orbs-0-3m-joyful-orbs'),
  ('46ce8454-21b0-4172-9429-e557c04ed98e', 'jhabla-shorts-half-sleeve-mushie-mini-0-3m-mushie-mini'),
  ('81572c47-4725-411c-bb1c-e9539fe19aa5', 'pyjamas-with-rib-moons-and-stars-0-3m-moon-and-stars'),
  ('a995ca35-72f9-4b02-97ce-a1dd41dbf22c', 'jhabla-sleeveless-moons-and-stars-0-3m-moon-and-stars'),
  ('f5bc0704-cb23-4edb-9b81-d844ee540172', 'new-born-essential-kits-mushie-mini-0-3m-mushie-mini'),
  ('6d24cf40-5f39-4443-8b5e-d728fa113420', 'jhabla-shorts-half-sleeve-moons-and-stars-0-3m-moon-and-stars');

create or replace function pg_temp.backfill_order_item_skus() returns void
language plpgsql as $$
declare
  v_bad text;
begin
  -- Every listed line must still have no sku and still match exactly this variant.
  select string_agg(b.order_item_id::text, ', ') into v_bad from sku_backfill b
   where not exists (select 1 from public.order_items oi
                      where oi.id = b.order_item_id and oi.sku is null
                        and public.order_item_variant_slug(null, oi.product_id, oi.size) = b.sku);
  if v_bad is not null then
    raise exception 'backfill_order_item_skus: line(s) already have a sku or no longer match (already applied?): %', v_bad;
  end if;

  update public.order_items oi set sku = b.sku from sku_backfill b where oi.id = b.order_item_id;
end $$;

select pg_temp.backfill_order_item_skus();
