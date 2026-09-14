-- Index hygiene from the Performance Advisor.
-- Only 7 of the 9 flagged foreign keys are covered here; the other two belonged
-- to related_products and reviews, dropped in 20260914010000.

begin;

-- Missing foreign-key covering indexes.
create index if not exists idx_admin_users_created_by
    on public.admin_users (created_by);
create index if not exists idx_checkout_sessions_order_id
    on public.checkout_sessions (order_id);
create index if not exists idx_expenses_category_id
    on public.expenses (category_id);
create index if not exists idx_impersonation_events_order_id
    on public.impersonation_events (order_id);
create index if not exists idx_product_variants_color_slug
    on public.product_variants (color_slug);
create index if not exists idx_product_variants_size_slug
    on public.product_variants (size_slug);
create index if not exists idx_ratings_product_slug
    on public.ratings (product_slug);

-- NOT DROPPED: sizes_slug_key. The linter flags it as a duplicate of sizes_pkey (both are unique
-- btree on slug, which is true), but it is load-bearing: the foreign key
-- product_variants_size_slug_fkey is backed by it (pg_constraint.conindid = sizes_slug_key).
-- Dropping the index fails with "cannot drop index ... because other objects depend on it", and
-- dropping the constraint instead would take the foreign key with it.
-- Verified by rehearsal on 2026-09-14.
--
-- Removing it properly would mean dropping the FK, dropping the index, and recreating the FK so it
-- binds to sizes_pkey. That is three statements of live FK surgery to remove one redundant index on
-- an 8-row table. Not worth it. The duplicate_index warning is accepted and documented here.

-- Never scanned in 548 days of statistics, on tables that carry live traffic.
drop index if exists public.idx_admin_users_active;
drop index if exists public.idx_checkout_sessions_discount_code;
drop index if exists public.idx_event_logs_created;
drop index if exists public.idx_orders_discount_code;
drop index if exists public.idx_payments_completed_at;
drop index if exists public.idx_payments_gateway_provider;
drop index if exists public.idx_payments_internal_reference;
drop index if exists public.idx_payments_payment_reference;
drop index if exists public.idx_payments_status;
drop index if exists public.products_color_slugs_gin_idx;

-- Deliberately kept: idx_expenses_created_at, idx_expenses_paid_by and
-- idx_webhook_events_awb. Those tables are empty or near-empty, so "unused"
-- reflects an unlaunched feature rather than a useless index.

commit;
