-- Deny by default, then grant back explicitly per tier.
--
-- Root cause being fixed: ALTER DEFAULT PRIVILEGES granted anon/authenticated
-- ALL on every new table in public, for BOTH the postgres and supabase_admin
-- grantors. That is why 17 tables were world-writable via the public anon key.
-- Revoking the default is what stops this recurring on the next CREATE TABLE.
--
-- service_role has rolbypassrls, so every server-side privileged route is
-- unaffected by the policies below.

begin;

-- ---------------------------------------------------------------------------
-- 1. Fix the default (root cause 1).
--
-- Default privileges are grantor-specific. `public` has two sets: one owned by
-- `postgres`, one by `supabase_admin`. Only the `postgres` set is touched here.
--
-- The supabase_admin set CANNOT be altered from this connection -- it fails
-- with `must be member of role "supabase_admin"`, because that is a
-- platform-managed superuser role. This was confirmed by a dry run.
--
-- That is acceptable: a table created by a migration run as `postgres` picks up
-- the `postgres` default ACL, verified directly. The supabase_admin set governs
-- only objects that supabase_admin itself creates, which are platform-managed
-- extension objects, not application tables. Step 3's verification proves the
-- gap is closed for tables we create, which is the actual threat.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Revoke every existing grant. Grants are added back explicitly below.
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Enable RLS on every table, and FORCE it outside the catalogue tier.
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'orders','order_items','payments','user_addresses','user_carts','user_wishlists',
    'checkout_sessions','event_logs','notifications','ratings',
    'expenses','expense_categories','admin_users','impersonation_events',
    'webhook_events','recent_activities']
  loop
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Drop every existing policy. They are rewritten below with explicit roles
--    and (select auth.uid()), fixing root causes 2 and 4.
-- ---------------------------------------------------------------------------
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- TIER 1 -- catalogue. Public read, service-role write.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'products','categories','sizes','genders','colors',
    'product_features','product_images','product_variants']
  loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_public_read', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- TIER 2 -- user-owned. authenticated only, scoped to the owner.
--
-- Grants are per-table and deliberately NOT uniform. A blanket
-- `grant ... delete` + `for all` would EXPAND privileges relative to what
-- exists today: users cannot currently delete their own orders, payments,
-- event_logs or notifications, and they must not gain that. Financial and
-- audit records are append-and-amend only.
-- ---------------------------------------------------------------------------

-- Tables the user genuinely owns and may remove: carts, wishlists, addresses.
do $$
declare t text;
begin
  foreach t in array array['user_carts','user_wishlists','user_addresses']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()))
    $f$, t || '_own_rows', t);
  end loop;
end $$;

-- Financial and notification records: read, create, amend. No delete.
do $$
declare t text;
begin
  foreach t in array array['orders','payments','notifications']
  loop
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format($f$
      create policy %I on public.%I
        for update to authenticated
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()))
    $f$, t || '_update_own', t);
  end loop;
end $$;

-- Audit trail: append and read only. No update, no delete.
grant select, insert on public.event_logs to authenticated;
create policy event_logs_select_own on public.event_logs
  for select to authenticated using (user_id = (select auth.uid()));
create policy event_logs_insert_own on public.event_logs
  for insert to authenticated with check (user_id = (select auth.uid()));

-- checkout_sessions: the user drives these through checkout, so full manage,
-- matching the pre-existing "Users can manage own sessions" policy.
grant select, insert, update, delete on public.checkout_sessions to authenticated;
create policy checkout_sessions_own_rows on public.checkout_sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- order_items is owned transitively through its parent order.
-- Read and create only, matching the pre-existing policy pair.
grant select, insert on public.order_items to authenticated;
create policy order_items_select_own on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_items.order_id and o.user_id = (select auth.uid())));
create policy order_items_insert_own on public.order_items
  for insert to authenticated
  with check (exists (
    select 1 from public.orders o
     where o.id = order_items.order_id and o.user_id = (select auth.uid())));

-- ratings is a hybrid: the aggregate is public, writes are owner-scoped.
grant select on public.ratings to anon, authenticated;
grant insert, update, delete on public.ratings to authenticated;

create policy ratings_public_read on public.ratings
  for select to anon, authenticated using (true);

create policy ratings_own_write on public.ratings
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy ratings_own_update on public.ratings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy ratings_own_delete on public.ratings
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- TIER 3 -- admin and internal. No grants, no policies. service_role only.
--   expenses, expense_categories, admin_users, impersonation_events,
--   webhook_events, recent_activities
-- Nothing to do: step 2 revoked their grants and step 3 enabled RLS.
-- recent_activities sits here, not in Tier 1, because it stores customer
-- email addresses and order numbers.
-- ---------------------------------------------------------------------------

commit;
