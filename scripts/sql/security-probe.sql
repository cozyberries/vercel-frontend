-- Asserts the security posture of the public schema.
-- Every check prints 'PASS <name>' or 'FAIL <name>: <reason>'.
-- Runs inside a rolled-back transaction; mutates nothing.
begin;

create temporary table probe_result(name text, ok boolean, reason text) on commit drop;

-- has_table_privilege alone is blind to a column-scoped grant such as
-- GRANT UPDATE (price) ON products TO anon, even though PostgREST would
-- still honour it. This helper treats a privilege as held if it holds at
-- the table level OR on any column of the table, so a future column-only
-- grant cannot slip past these assertions. (Reference pattern: the vendored
-- scripts/sql/lint.sql uses the same has_column_privilege/pg_attribute join
-- for its equivalent exposure checks.)
-- DELETE (and TRUNCATE/TRIGGER) have no column-level grant in Postgres's ACL
-- model, so has_column_privilege rejects them with "unrecognized privilege
-- type"; only SELECT/INSERT/UPDATE/REFERENCES can be column-scoped.
create function pg_temp.priv_any(p_role text, p_table regclass, p_priv text) returns boolean
language plpgsql as $$
declare result boolean;
begin
  select has_table_privilege(p_role, p_table, p_priv)
      or (
        p_priv in ('SELECT','INSERT','UPDATE','REFERENCES')
        and exists (
          select 1
            from pg_attribute a
           where a.attrelid = p_table
             and a.attnum > 0
             and not a.attisdropped
             and has_column_privilege(p_role, p_table, a.attnum, p_priv)
        )
      )
    into result;
  return result;
end;
$$;

-- anon must NOT be able to write catalogue data
do $$
declare can_write boolean;
begin
  select pg_temp.priv_any('anon','public.products'::regclass,'UPDATE')
      or pg_temp.priv_any('anon','public.products'::regclass,'DELETE')
      or pg_temp.priv_any('anon','public.products'::regclass,'INSERT')
  into can_write;
  insert into probe_result values ('anon_cannot_write_products', not can_write,
    case when can_write then 'anon holds INSERT/UPDATE/DELETE on products (table- or column-level)' end);
end $$;

-- anon must NOT hold any privilege on user-owned tables
do $$
declare t text; bad text[] := '{}';
begin
  foreach t in array array['user_carts','user_wishlists','orders','order_items','payments',
                           'user_addresses','checkout_sessions','event_logs','notifications']
  loop
    if pg_temp.priv_any('anon',('public.'||t)::regclass,'SELECT')
    or pg_temp.priv_any('anon',('public.'||t)::regclass,'INSERT')
    or pg_temp.priv_any('anon',('public.'||t)::regclass,'UPDATE')
    or pg_temp.priv_any('anon',('public.'||t)::regclass,'DELETE') then
      bad := bad || t;
    end if;
  end loop;
  insert into probe_result values ('anon_has_no_access_to_user_tables',
    cardinality(bad) = 0, 'anon still reaches: '||array_to_string(bad,', '));
end $$;

-- anon and authenticated must NOT hold any privilege on admin/internal tables.
-- Both roles get all four privileges checked (not just anon SELECT/INSERT/
-- UPDATE/DELETE plus authenticated SELECT) so that authenticated holding
-- INSERT/UPDATE/DELETE without SELECT cannot slip through as a false PASS.
do $$
declare t text; bad text[] := '{}';
begin
  foreach t in array array['expenses','expense_categories','admin_users',
                           'impersonation_events','webhook_events','recent_activities']
  loop
    if pg_temp.priv_any('anon',('public.'||t)::regclass,'SELECT')
    or pg_temp.priv_any('anon',('public.'||t)::regclass,'INSERT')
    or pg_temp.priv_any('anon',('public.'||t)::regclass,'UPDATE')
    or pg_temp.priv_any('anon',('public.'||t)::regclass,'DELETE')
    or pg_temp.priv_any('authenticated',('public.'||t)::regclass,'SELECT')
    or pg_temp.priv_any('authenticated',('public.'||t)::regclass,'INSERT')
    or pg_temp.priv_any('authenticated',('public.'||t)::regclass,'UPDATE')
    or pg_temp.priv_any('authenticated',('public.'||t)::regclass,'DELETE') then
      bad := bad || t;
    end if;
  end loop;
  insert into probe_result values ('admin_tables_are_service_role_only',
    cardinality(bad) = 0, 'still reachable: '||array_to_string(bad,', '));
end $$;

-- anon MUST still be able to read the catalogue (the storefront depends on it)
do $$
declare n int;
begin
  set local role anon;
  select count(*) into n from public.products;
  reset role;
  insert into probe_result values ('anon_can_read_catalogue', n > 0,
    'anon sees '||n||' products, expected > 0');
exception when others then
  reset role;
  insert into probe_result values ('anon_can_read_catalogue', false, SQLERRM);
end $$;

-- anon must see ZERO rows of user data even where a grant survives
do $$
declare n int;
begin
  set local role anon;
  select count(*) into n from public.user_carts;
  reset role;
  insert into probe_result values ('anon_sees_no_carts', n = 0, 'anon sees '||n||' carts, expected 0');
exception when insufficient_privilege then
  reset role;
  insert into probe_result values ('anon_sees_no_carts', true, null);
when others then
  reset role;
  insert into probe_result values ('anon_sees_no_carts', false, SQLERRM);
end $$;

-- authenticated must NOT be able to delete financial or audit records
do $$
declare t text; bad text[] := '{}';
begin
  foreach t in array array['orders','payments','notifications','event_logs','order_items']
  loop
    if pg_temp.priv_any('authenticated',('public.'||t)::regclass,'DELETE') then
      bad := bad || t;
    end if;
  end loop;
  insert into probe_result values ('authenticated_cannot_delete_records',
    cardinality(bad) = 0, 'authenticated can DELETE: '||array_to_string(bad,', '));
end $$;

-- SECURITY DEFINER helpers must not be callable over the REST RPC surface.
-- has_function_privilege accounts for the PUBLIC grant that anon inherits, so
-- this catches a revoke that named only anon and authenticated.
do $$
declare bad text[] := '{}'; r record;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
  loop
    if has_function_privilege('anon', r.oid, 'EXECUTE')
    or has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      bad := bad || r.proname::text;
    end if;
  end loop;
  insert into probe_result values ('secdef_functions_not_rpc_callable',
    cardinality(bad) = 0, 'still callable: '||array_to_string(bad,', '));
end $$;

-- RLS must be enabled on every table in public
do $$
declare bad text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  insert into probe_result values ('rls_enabled_everywhere', cardinality(bad) = 0,
    'RLS off on: '||array_to_string(bad,', '));
end $$;

-- A newly created table must grant anon/authenticated nothing.
-- This is asserted behaviourally rather than by reading pg_default_acl, because
-- the platform-managed `supabase_admin` default ACL rows cannot be altered and
-- would make a pure catalogue check fail forever. What matters is the outcome
-- for tables we create.
do $$
declare leaked text[] := '{}';
begin
  create table public.zz_probe_newtable(id int);
  if has_table_privilege('anon','public.zz_probe_newtable','SELECT')
  or has_table_privilege('anon','public.zz_probe_newtable','INSERT')
  or has_table_privilege('anon','public.zz_probe_newtable','UPDATE')
  or has_table_privilege('anon','public.zz_probe_newtable','DELETE') then
    leaked := leaked || 'anon'::text;   -- the cast matters: an untyped literal
  end if;                               -- resolves to anyarray and errors
  if has_table_privilege('authenticated','public.zz_probe_newtable','SELECT')
  or has_table_privilege('authenticated','public.zz_probe_newtable','INSERT')
  or has_table_privilege('authenticated','public.zz_probe_newtable','UPDATE')
  or has_table_privilege('authenticated','public.zz_probe_newtable','DELETE') then
    leaked := leaked || 'authenticated'::text;
  end if;
  drop table public.zz_probe_newtable;
  insert into probe_result values ('new_tables_grant_nothing_by_default',
    cardinality(leaked) = 0,
    'a new table is still reachable by: '||array_to_string(leaked,', '));
end $$;

-- no policy may target the bare `public` role
do $$
declare bad int;
begin
  select count(*) into bad from pg_policies
   where schemaname = 'public' and roles::text like '%public%';
  insert into probe_result values ('no_policy_targets_public_role', bad = 0,
    bad||' policy/policies target the public role');
end $$;

-- no policy may call auth.uid() outside a subselect
do $$
declare bad int;
begin
  -- `~*` (case-insensitive) is required: Postgres renders a correct policy as
  -- `( SELECT auth.uid() AS uid)` with an uppercase SELECT, so a case-sensitive
  -- lookbehind flags every compliant policy as a violation.
  select count(*) into bad from pg_policies
   where schemaname = 'public'
     and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~* '(?<!select )auth\.uid\(\)';
  insert into probe_result values ('policies_use_subselect_auth_uid', bad = 0,
    bad||' policy/policies call auth.uid() bare');
end $$;

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason,'') end
  from probe_result order by name;

rollback;
