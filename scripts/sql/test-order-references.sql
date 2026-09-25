-- A customer's own session (role authenticated) must be able to place an order
-- and record a payment claim; the numbering triggers must not be RPC-callable.
-- Loads the fix inside a transaction and rolls back. Note: nextval() is not
-- transactional, so a passing run consumes one order number and one payment
-- reference (a harmless gap).
\set ON_ERROR_STOP on
begin;

\ir ../../supabase/migrations/20260924120000_order_reference_triggers_definer.sql

create temporary table t_result(name text, ok boolean, reason text) on commit drop;
create temporary table t_ctx(k text primary key, v text) on commit drop;

do $$
declare v_uid uuid;
begin
  select id into v_uid from auth.users order by created_at limit 1;
  insert into t_ctx values ('uid', v_uid::text);
end $$;

-- Runs p_sql as the customer's own Supabase session: role `authenticated`
-- with JWT sub = the fixture user. Returns the error text, or null on success.
create function pg_temp.as_customer(p_sql text) returns text
language plpgsql as $$
declare
  v_err text;
begin
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', (select v from t_ctx where k = 'uid'), 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute p_sql;
    perform set_config('role', session_user, true);
    return null;
  exception when others then
    v_err := sqlerrm;
  end;
  perform set_config('role', session_user, true);
  return v_err;
end $$;

do $$
declare v_err text; v_num text;
begin
  v_err := pg_temp.as_customer(format(
    'insert into public.orders (user_id, customer_email, subtotal, delivery_charge, total_amount, shipping_address) '
    'values (%L, %L, 500, 90, 590, %L::jsonb)',
    (select v from t_ctx where k = 'uid'), 'zz-hotfix@test.local', '{"full_name":"ZZ","state":"Karnataka"}'));
  select order_number into v_num from public.orders where customer_email = 'zz-hotfix@test.local';
  insert into t_result values ('customer_can_place_an_order',
    v_err is null and v_num like 'ORD-%', coalesce(v_err, 'order_number=' || coalesce(v_num, 'null')));
end $$;

do $$
declare v_err text; v_ref text;
begin
  v_err := pg_temp.as_customer(format(
    'insert into public.payments (order_id, user_id, payment_reference, payment_method, gateway_provider, amount, status) '
    'values (%L, %L, %L, %L, %L, 590, %L)',
    (select id from public.orders where customer_email = 'zz-hotfix@test.local'),
    (select v from t_ctx where k = 'uid'), 'zz-hotfix-ref', 'upi', 'manual', 'processing'));
  select internal_reference into v_ref from public.payments where payment_reference = 'zz-hotfix-ref';
  insert into t_result values ('customer_can_record_a_payment_claim',
    v_err is null and v_ref like 'PAY-%', coalesce(v_err, 'internal_reference=' || coalesce(v_ref, 'null')));
end $$;

do $$
declare callable text[] := '{}'; f text; r text;
begin
  foreach f in array array['public.set_order_number()', 'public.set_payment_reference()',
                           'public.generate_order_number()', 'public.generate_payment_reference()'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, f, 'EXECUTE') then
        callable := callable || (r || ' on ' || f);
      end if;
    end loop;
  end loop;
  insert into t_result values ('order_reference_functions_not_rpc', cardinality(callable) = 0,
    'EXECUTE held by: ' || array_to_string(callable, ', '));
end $$;

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason,'') end
  from t_result order by name;

rollback;
