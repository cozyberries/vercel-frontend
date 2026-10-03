-- Behavioural tests for supabase/migrations/20261003120000_gst_sales_register.sql.
-- Loads the migration (its backfill included) inside one transaction, runs every
-- assertion, then rolls back, so it is safe to run against the production
-- database and mutates nothing. Prints 'PASS <name>' or 'FAIL <name>: <reason>'.
\set ON_ERROR_STOP on
begin;

\ir ../../supabase/migrations/20261003120000_gst_sales_register.sql

create temporary table t_result(name text, ok boolean, reason text) on commit drop;
create temporary table t_ctx(k text primary key, v text) on commit drop;

-- 0. Straight after the migration, no paid order from 1 Sep 2026 (GST
--    registration) is left without an invoice number. Runs before any fixture.
do $$
declare v_left int;
begin
  select count(*) into v_left
    from public.orders o
   where o.status in ('payment_confirmed', 'processing', 'ready_for_pickup', 'collected', 'shipped', 'delivered')
     and o.invoice_number is null
     and coalesce(
           (select min(coalesce(p.completed_at, p.updated_at, p.created_at))
              from public.payments p
             where p.order_id = o.id and p.status = 'completed'),
           o.stock_committed_at, o.created_at) >= timestamptz '2026-09-01 00:00:00+05:30';
  insert into t_result values ('migration_numbers_every_paid_order_since_registration', v_left = 0,
    v_left || ' paid order(s) since 1 Sep 2026 still have no invoice number');
end $$;

-- Fixtures: an existing auth user (orders.user_id is an FK) and a throwaway,
-- inactive product with one variant holding 50 units.
do $$
declare
  v_uid uuid;
  v_size text;
begin
  select id into v_uid from auth.users order by created_at limit 1;
  select slug into v_size from public.sizes order by slug limit 1;
  insert into public.products (name, slug, price, base_price, is_active)
    values ('ZZ Register Frock', 'zz-register-frock', 500, 476, false);
  insert into public.product_variants (slug, product_slug, size_slug, price, base_price, stock_quantity)
    values ('zz-register-frock-v', 'zz-register-frock', v_size, 500, 476, 50);
  insert into t_ctx values ('uid', v_uid::text), ('size', v_size);
end $$;

create function pg_temp.uid() returns uuid language sql as $$
  select v::uuid from t_ctx where k = 'uid'
$$;

-- A one-unit pickup order, made paid (status processing, which issues an
-- invoice number) unless p_paid is false.
create function pg_temp.make_order(p_paid boolean default true) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.orders (user_id, customer_email, subtotal, delivery_charge, total_amount, fulfilment_method)
  values (pg_temp.uid(), 'zz@test.local', 500, 0, 500, 'pickup')
  returning id into v_id;
  insert into public.order_items (order_id, product_id, name, price, quantity, size, sku)
  values (v_id, 'zz-register-frock', 'ZZ Register Frock', 500, 1,
          upper((select v from t_ctx where k = 'size')), 'zz-register-frock-v');
  if p_paid then
    update public.orders set status = 'processing' where id = v_id;
  end if;
  return v_id;
end $$;

-- A paid order stripped of its invoice number, as if it was paid before
-- numbering began, with a completed payment at p_paid_at. The order is already
-- paid, so the payment insert does not change its status.
create function pg_temp.make_unnumbered(p_paid_at timestamptz, p_ref text) returns uuid
language plpgsql as $$
declare
  v_id uuid := pg_temp.make_order();
begin
  update public.orders set invoice_number = null, invoice_date = null where id = v_id;
  insert into public.payments (order_id, user_id, payment_reference, status, payment_method,
                               gateway_provider, amount, completed_at)
  values (v_id, pg_temp.uid(), p_ref, 'completed', 'upi', 'manual', 500, p_paid_at);
  return v_id;
end $$;

create function pg_temp.order_row(p_id uuid) returns public.orders language sql as $$
  select * from public.orders where id = p_id
$$;

create function pg_temp.voided_at(p_id uuid) returns timestamptz language sql as $$
  select invoice_voided_at from public.orders where id = p_id
$$;

-- Runs p_sql as the customer's own Supabase session: role `authenticated`
-- with JWT sub = the fixture user. Returns the error text, or null on success.
create function pg_temp.as_customer(p_sql text) returns text
language plpgsql as $$
declare
  v_err text;
begin
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', pg_temp.uid(), 'role', 'authenticated')::text, true);
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

-- 1. Cancelling an invoiced order stamps invoice_voided_at and keeps the number.
do $$
declare
  v_o uuid := pg_temp.make_order();
  v_before public.orders;
  v_after public.orders;
begin
  v_before := pg_temp.order_row(v_o);
  update public.orders set status = 'cancelled' where id = v_o;
  v_after := pg_temp.order_row(v_o);
  insert into t_result values ('cancel_stamps_voided_at_keeps_number',
    v_after.invoice_voided_at is not null and v_after.invoice_number = v_before.invoice_number,
    format('voided_at=%s number=%s before=%s', v_after.invoice_voided_at, v_after.invoice_number, v_before.invoice_number));
  insert into t_ctx values ('cancelled', v_o::text);
end $$;

-- 2. A refund stamps it too.
do $$
declare v_o uuid := pg_temp.make_order();
begin
  update public.orders set status = 'refunded' where id = v_o;
  insert into t_result values ('refund_stamps_voided_at', pg_temp.voided_at(v_o) is not null, 'voided_at is null');
end $$;

-- 3. The webhook's revert (paid → verifying_payment) stamps it: the invoice is
--    no longer backed by a confirmed payment.
do $$
declare v_o uuid := pg_temp.make_order();
begin
  update public.orders set status = 'verifying_payment' where id = v_o;
  insert into t_result values ('revert_to_unpaid_stamps_voided_at', pg_temp.voided_at(v_o) is not null, 'voided_at is null');
end $$;

-- 4. Reinstating the cancelled order clears it and keeps number and date.
do $$
declare
  v_o uuid := (select v::uuid from t_ctx where k = 'cancelled');
  v_before public.orders;
  v_after public.orders;
begin
  v_before := pg_temp.order_row(v_o);
  update public.orders set status = 'processing' where id = v_o;
  v_after := pg_temp.order_row(v_o);
  insert into t_result values ('reinstate_clears_voided_at_keeps_number_and_date',
    v_after.invoice_voided_at is null
      and v_after.invoice_number = v_before.invoice_number
      and v_after.invoice_date = v_before.invoice_date,
    format('voided_at=%s number=%s date=%s', v_after.invoice_voided_at, v_after.invoice_number, v_after.invoice_date));
end $$;

-- 5. Moving between paid statuses leaves it null.
do $$
declare v_o uuid := pg_temp.make_order();
begin
  update public.orders set status = 'ready_for_pickup' where id = v_o;
  insert into t_result values ('paid_to_paid_leaves_voided_at_null', pg_temp.voided_at(v_o) is null,
    'voided_at=' || pg_temp.voided_at(v_o));
end $$;

-- 6. Cancelling an order that was never paid (no invoice) leaves it null.
do $$
declare v_o uuid := pg_temp.make_order(false);
begin
  update public.orders set status = 'cancelled' where id = v_o;
  insert into t_result values ('unpaid_cancel_leaves_voided_at_null', pg_temp.voided_at(v_o) is null,
    'voided_at=' || pg_temp.voided_at(v_o));
end $$;

-- 7. A customer session cannot insert an order carrying invoice_voided_at.
do $$
declare v_err text;
begin
  v_err := pg_temp.as_customer(format(
    'insert into public.orders (user_id, customer_email, subtotal, delivery_charge, total_amount, fulfilment_method, invoice_voided_at) '
    || 'values (%L, %L, 500, 0, 500, %L, now())', pg_temp.uid(), 'zz@test.local', 'pickup'));
  insert into t_result values ('customer_cannot_insert_voided_at', v_err like 'CLIENT_WRITE_FORBIDDEN%',
    'err=' || coalesce(v_err, 'none'));
end $$;

-- 8. A customer session cannot set it on their own order.
do $$
declare v_o uuid := pg_temp.make_order(false); v_err text;
begin
  v_err := pg_temp.as_customer(format('update public.orders set invoice_voided_at = now() where id = %L', v_o));
  insert into t_result values ('customer_cannot_update_voided_at', v_err like 'CLIENT_WRITE_FORBIDDEN%',
    'err=' || coalesce(v_err, 'none'));
end $$;

-- 9-12. backfill_invoice_numbers numbers in paid-time order, dates each invoice
--       with its payment time, skips orders paid before the cut-off and is idempotent.
do $$
declare
  v_late uuid := pg_temp.make_unnumbered('2026-09-03 10:00:00+05:30', 'ZZ-REG-LATE');
  v_early uuid := pg_temp.make_unnumbered('2026-09-02 10:00:00+05:30', 'ZZ-REG-EARLY');
  v_old uuid := pg_temp.make_unnumbered('2026-08-15 10:00:00+05:30', 'ZZ-REG-AUG');
  v_seq_before int;
  v_n int;
  r_late public.orders;
  r_early public.orders;
  r_old public.orders;
begin
  select last_seq into v_seq_before from public.invoice_counters where financial_year = '26-27';
  v_n := public.backfill_invoice_numbers('2026-09-01 00:00:00+05:30');
  r_late := pg_temp.order_row(v_late);
  r_early := pg_temp.order_row(v_early);
  r_old := pg_temp.order_row(v_old);
  insert into t_result values ('backfill_numbers_in_paid_time_order',
    v_n = 2
      and r_early.invoice_number = 'CB/26-27/' || lpad((v_seq_before + 1)::text, 4, '0')
      and r_late.invoice_number = 'CB/26-27/' || lpad((v_seq_before + 2)::text, 4, '0'),
    format('n=%s early=%s late=%s counter_before=%s', v_n, r_early.invoice_number, r_late.invoice_number, v_seq_before));
  insert into t_result values ('backfill_dates_invoice_with_payment_time',
    r_early.invoice_date = timestamptz '2026-09-02 10:00:00+05:30'
      and r_late.invoice_date = timestamptz '2026-09-03 10:00:00+05:30',
    format('early=%s late=%s', r_early.invoice_date, r_late.invoice_date));
  insert into t_result values ('backfill_skips_orders_paid_before_cutoff',
    r_old.invoice_number is null and r_old.invoice_date is null,
    format('number=%s date=%s', r_old.invoice_number, r_old.invoice_date));
  insert into t_result values ('backfill_second_run_numbers_nothing',
    public.backfill_invoice_numbers('2026-09-01 00:00:00+05:30') = 0, 'the second run numbered orders');
end $$;

-- 13. Clients cannot call the backfill.
insert into t_result values ('backfill_not_executable_by_clients',
  not has_function_privilege('anon', 'public.backfill_invoice_numbers(timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'public.backfill_invoice_numbers(timestamptz)', 'execute'),
  'anon or authenticated can execute backfill_invoice_numbers');

-- 14. Re-running the migration dates invoiced orders cancelled before
--     invoice_voided_at existed: from the latest status event into their
--     status, else updated_at. (Simulated by clearing the stamp.)
do $$
declare
  v_a uuid := pg_temp.make_order();
  v_b uuid := pg_temp.make_order();
begin
  update public.orders set status = 'cancelled' where id in (v_a, v_b);
  update public.orders set invoice_voided_at = null where id in (v_a, v_b);
  insert into public.order_status_events (order_id, from_status, to_status, created_at)
    values (v_a, 'processing', 'cancelled', timestamptz '2026-09-20 12:00:00+05:30');
  insert into t_ctx values ('undated_a', v_a::text), ('undated_b', v_b::text);
end $$;

\ir ../../supabase/migrations/20261003120000_gst_sales_register.sql

do $$
declare
  v_a uuid := (select v::uuid from t_ctx where k = 'undated_a');
  r_b public.orders := pg_temp.order_row((select v::uuid from t_ctx where k = 'undated_b'));
begin
  insert into t_result values ('migration_dates_earlier_cancellations',
    pg_temp.voided_at(v_a) = timestamptz '2026-09-20 12:00:00+05:30'
      and r_b.invoice_voided_at is not null and r_b.invoice_voided_at = r_b.updated_at,
    format('a=%s b=%s b_updated=%s', pg_temp.voided_at(v_a), r_b.invoice_voided_at, r_b.updated_at));
end $$;

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason, '') end
  from t_result order by name;

rollback;
