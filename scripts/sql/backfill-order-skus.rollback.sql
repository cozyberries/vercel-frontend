-- Reverses supabase/migrations/20261010160000_backfill_order_item_skus.sql: clears the sku on
-- the 37 lines it filled. Apply as one transaction:
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f scripts/sql/backfill-order-skus.rollback.sql

set local lock_timeout = '5s';

update public.order_items set sku = null
 where id in (
  '3f9afd14-f5ce-4127-b878-ddb8bc87ac44',
  '41c93959-7136-4776-aa5d-95e8ad5d5a73',
  '09f50e65-8b37-4748-872f-4b309b8bd708',
  '2cb363b5-5f4c-419b-8503-1182aa6e5a64',
  '645d9d55-3a14-40cf-ad55-3b0392434f0c',
  '673a8385-d4df-4460-abeb-c2f99ab08c27',
  'be00a05f-a477-4a87-a557-9b330c7db636',
  '8887ad19-12aa-4e51-9cc0-23a116efb72a',
  'f9959e39-27d4-4572-90e9-1b364106b32d',
  'b79b9986-60f8-44cb-a015-2fc4f2b70fa6',
  'aa35cc10-ba14-4c33-bbe5-0bf69734fe77',
  'c850131b-ccc4-4673-b56a-e258e8ce713b',
  'cb0e0d91-082f-43f7-8002-ed7abf8c8d2d',
  'f144d2a2-dabe-4905-a743-cf28c841c715',
  'f1e445cf-9038-42e5-b816-21b2acb5e961',
  'a321016e-c25a-403d-810a-60942c28002b',
  '221a1b00-0fa1-4c63-b1bf-b0f131ff2521',
  '54b1795d-d3ba-4d9f-acec-0c1efe9cd15a',
  '90a87d6f-6f3d-4d69-9fc1-8b737f6f0344',
  '9cfa904d-5bfe-4f7a-b841-a7f889441231',
  '19226936-d056-4917-8af1-66fbebaad359',
  'a6e24520-1336-4a78-b596-ba9dca27d00f',
  '32780a2f-9aed-47dc-88a9-eaa09ddfd2e0',
  '78b2349c-43eb-4c58-97dd-21601f69a4b0',
  '8117bcce-3dde-4d74-b2d6-808fc8d857b7',
  '87179686-9f46-4770-b827-6b82c3e36cb2',
  '91b6123c-201a-4a0d-a315-4d7365b26fd0',
  'b901c8ed-db07-4c65-b402-fa1a467383bb',
  'bcdca24c-23a0-4c5d-a92e-8980ecd384c6',
  'c30264ca-5941-4d08-9e23-7cbc421aee99',
  '196cb1b8-ddf2-4143-943f-990c5086741b',
  '44369e35-6dd5-498b-b386-0623982cb31b',
  '46ce8454-21b0-4172-9429-e557c04ed98e',
  '81572c47-4725-411c-bb1c-e9539fe19aa5',
  'a995ca35-72f9-4b02-97ce-a1dd41dbf22c',
  'f5bc0704-cb23-4edb-9b81-d844ee540172',
  '6d24cf40-5f39-4443-8b5e-d728fa113420'
 );
