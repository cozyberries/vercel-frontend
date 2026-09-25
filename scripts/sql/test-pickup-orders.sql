-- Behavioural tests for supabase/migrations/20260925000000_stall_pickup_orders.sql.
-- Loads the migration inside one transaction, runs every assertion, then rolls
-- back, so it is safe to run against the production database and mutates
-- nothing. Prints 'PASS <name>' or 'FAIL <name>: <reason>' per assertion.
\set ON_ERROR_STOP on
begin;

-- The Task 0 hotfix first: without it the customer-session assertions fail on
-- order numbering, not on the guards under test. Both files are idempotent.
\ir ../../supabase/migrations/20260924120000_order_reference_triggers_definer.sql
\ir ../../supabase/migrations/20260925000000_stall_pickup_orders.sql

create temporary table t_result(name text, ok boolean, reason text) on commit drop;
create temporary table t_ctx(k text primary key, v text) on commit drop;

-- Fixtures: an existing auth user (orders.user_id is an FK) and a throwaway,
-- inactive product with one variant holding 2 units.
do $$
declare
  v_uid uuid;
  v_size text;
begin
  select id into v_uid from auth.users order by created_at limit 1;
  select slug into v_size from public.sizes order by slug limit 1;
  insert into public.products (name, slug, price, base_price, is_active)
    values ('ZZ Test Frock', 'zz-test-frock', 500, 476, false);
  insert into public.product_variants (slug, product_slug, size_slug, price, base_price, stock_quantity)
    values ('zz-test-frock-v', 'zz-test-frock', v_size, 500, 476, 2);
  insert into t_ctx values ('uid', v_uid::text), ('size', v_size);
end $$;

create function pg_temp.stock() returns int language sql as $$
  select stock_quantity from public.product_variants where slug = 'zz-test-frock-v'
$$;

create function pg_temp.make_order(p_fulfilment text, p_qty int) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.orders (user_id, customer_email, subtotal, delivery_charge, total_amount,
                             fulfilment_method, shipping_address)
  values ((select v::uuid from t_ctx where k = 'uid'), 'zz@test.local', 500 * p_qty, 0, 500 * p_qty,
          p_fulfilment,
          case when p_fulfilment = 'delivery' then '{"full_name":"ZZ","state":"Karnataka"}'::jsonb end)
  returning id into v_id;
  insert into public.order_items (order_id, product_id, name, price, quantity, size, sku)
  values (v_id, 'zz-test-frock', 'ZZ Test Frock', 500, p_qty,
          upper((select v from t_ctx where k = 'size')), 'zz-test-frock-v');
  return v_id;
end $$;

-- Runs p_sql as the customer's own Supabase session: role `authenticated`
-- with JWT sub = the fixture user. Returns the error text, or null on success.
-- A failed statement aborts only this sub-transaction, which also reverts the
-- role change.
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

-- 1. Confirming reduces stock and issues an invoice number.
do $$
declare v_o uuid; v_inv text; v_committed timestamptz;
begin
  v_o := pg_temp.make_order('pickup', 1);
  insert into t_ctx values ('o1', v_o::text);
  update public.orders set status = 'processing' where id = v_o;
  select invoice_number, stock_committed_at into v_inv, v_committed from public.orders where id = v_o;
  insert into t_ctx values ('inv1', v_inv);
  insert into t_result values ('confirm_reduces_stock', pg_temp.stock() = 1,
    'stock is '||pg_temp.stock()||', expected 1');
  insert into t_result values ('confirm_issues_invoice_number',
    v_inv ~ '^CB/[0-9]{2}-[0-9]{2}/[0-9]{4,}$' and v_committed is not null,
    'invoice_number='||coalesce(v_inv,'null')||' stock_committed_at='||coalesce(v_committed::text,'null'));
end $$;

-- 2. A second confirmation takes the next number in the same year.
do $$
declare v_o uuid; v_inv text; v_first text := (select v from t_ctx where k = 'inv1');
begin
  v_o := pg_temp.make_order('pickup', 1);
  insert into t_ctx values ('o2', v_o::text);
  update public.orders set status = 'processing' where id = v_o;
  select invoice_number into v_inv from public.orders where id = v_o;
  insert into t_result values ('invoice_numbers_are_consecutive',
    split_part(v_inv,'/',3)::int = split_part(v_first,'/',3)::int + 1
      and split_part(v_inv,'/',2) = split_part(v_first,'/',2),
    'first='||v_first||' second='||coalesce(v_inv,'null'));
  insert into t_result values ('second_confirm_reduces_stock', pg_temp.stock() = 0,
    'stock is '||pg_temp.stock()||', expected 0');
end $$;

-- 3. With no stock left, confirmation is refused and nothing changes.
do $$
declare v_o uuid; v_err text; v_status text; v_inv text;
begin
  v_o := pg_temp.make_order('pickup', 1);
  begin
    update public.orders set status = 'processing' where id = v_o;
  exception when others then
    v_err := sqlerrm;
  end;
  select status, invoice_number into v_status, v_inv from public.orders where id = v_o;
  insert into t_result values ('shortage_blocks_confirmation',
    v_err like 'OUT_OF_STOCK:ZZ Test Frock%' and v_status = 'payment_pending'
      and v_inv is null and pg_temp.stock() = 0,
    'err='||coalesce(v_err,'none')||' status='||v_status||' stock='||pg_temp.stock());
end $$;

-- 4. Cancelling a paid order returns its stock and keeps its invoice number.
do $$
declare v_o uuid := (select v::uuid from t_ctx where k = 'o1'); v_inv text; v_committed timestamptz;
begin
  update public.orders set status = 'cancelled' where id = v_o;
  select invoice_number, stock_committed_at into v_inv, v_committed from public.orders where id = v_o;
  insert into t_result values ('cancel_restores_stock_keeps_invoice',
    pg_temp.stock() = 1 and v_committed is null and v_inv = (select v from t_ctx where k = 'inv1'),
    'stock='||pg_temp.stock()||' invoice='||coalesce(v_inv,'null'));
end $$;

-- 5. The webhook's revert (paid → unpaid) returns stock; re-confirming reuses the number.
do $$
declare v_o uuid := (select v::uuid from t_ctx where k = 'o2'); v_before text; v_after text;
begin
  select invoice_number into v_before from public.orders where id = v_o;
  update public.orders set status = 'verifying_payment' where id = v_o;
  insert into t_result values ('revert_restores_stock', pg_temp.stock() = 2,
    'stock='||pg_temp.stock()||', expected 2');
  update public.orders set status = 'processing' where id = v_o;
  select invoice_number into v_after from public.orders where id = v_o;
  insert into t_result values ('reconfirm_reuses_invoice_number',
    v_after = v_before and pg_temp.stock() = 1,
    'before='||v_before||' after='||coalesce(v_after,'null')||' stock='||pg_temp.stock());
end $$;

-- 6. A line without a resolved variant cannot be confirmed.
do $$
declare v_o uuid; v_err text;
begin
  v_o := pg_temp.make_order('pickup', 1);
  update public.order_items set sku = null where order_id = v_o;
  begin
    update public.orders set status = 'processing' where id = v_o;
  exception when others then
    v_err := sqlerrm;
  end;
  insert into t_result values ('missing_variant_blocks_confirmation',
    v_err like 'VARIANT_NOT_FOUND:%', 'err='||coalesce(v_err,'none'));
end $$;

-- 7. Shape constraints.
do $$
declare v_err text;
begin
  begin
    insert into public.orders (user_id, customer_email, subtotal, delivery_charge, total_amount, fulfilment_method)
    values ((select v::uuid from t_ctx where k = 'uid'), 'zz@test.local', 500, 90, 590, 'pickup');
  exception when check_violation then
    v_err := sqlerrm;
  end;
  insert into t_result values ('pickup_rejects_delivery_charge',
    v_err like '%orders_pickup_has_no_delivery_charge%', coalesce(v_err,'insert succeeded'));

  v_err := null;
  begin
    insert into public.orders (user_id, customer_email, subtotal, delivery_charge, total_amount, fulfilment_method)
    values ((select v::uuid from t_ctx where k = 'uid'), 'zz@test.local', 500, 0, 500, 'delivery');
  exception when check_violation then
    v_err := sqlerrm;
  end;
  insert into t_result values ('delivery_requires_address',
    v_err like '%orders_delivery_requires_address%', coalesce(v_err,'insert succeeded'));
end $$;

do $$
declare v_p uuid; v_d uuid; v_err1 text; v_err2 text;
begin
  v_p := pg_temp.make_order('pickup', 1);
  begin
    update public.orders set status = 'shipped' where id = v_p;
  exception when others then
    v_err1 := sqlerrm;
  end;
  v_d := pg_temp.make_order('delivery', 1);
  begin
    update public.orders set status = 'collected' where id = v_d;
  exception when others then
    v_err2 := sqlerrm;
  end;
  insert into t_result values ('pickup_cannot_be_shipped',
    v_err1 like '%orders_shipping_statuses_only_for_delivery%', coalesce(v_err1,'update succeeded'));
  insert into t_result values ('delivery_cannot_be_collected',
    v_err2 like '%orders_pickup_statuses_only_for_pickup%', coalesce(v_err2,'update succeeded'));
end $$;

-- 8. The financial year turns over at 00:00 IST on 1 April.
do $$
begin
  insert into t_result values ('financial_year_turns_over_on_1_april_ist',
    public.gst_financial_year('2026-03-31 18:29:59+00') = '25-26'
      and public.gst_financial_year('2026-03-31 18:30:00+00') = '26-27'
      and public.gst_financial_year('2099-12-31 00:00:00+00') = '99-00',
    'got '||public.gst_financial_year('2026-03-31 18:29:59+00')||' / '
      ||public.gst_financial_year('2026-03-31 18:30:00+00'));
end $$;

-- 9. The customer's own session cannot confirm, edit money, or forge rows.
do $$
declare v_o uuid; v_err text; v_status text; v_uid text := (select v from t_ctx where k = 'uid');
begin
  v_o := pg_temp.make_order('pickup', 1);

  v_err := pg_temp.as_customer(format('update public.orders set status = %L where id = %L', 'processing', v_o));
  insert into t_result values ('customer_cannot_confirm_payment',
    v_err like 'CLIENT_WRITE_FORBIDDEN%', coalesce(v_err,'update succeeded'));

  v_err := pg_temp.as_customer(format('update public.orders set total_amount = 1 where id = %L', v_o));
  insert into t_result values ('customer_cannot_edit_totals',
    v_err like 'CLIENT_WRITE_FORBIDDEN%', coalesce(v_err,'update succeeded'));

  v_err := pg_temp.as_customer(format('update public.orders set status = %L where id = %L', 'verifying_payment', v_o));
  select status into v_status from public.orders where id = v_o;
  insert into t_result values ('customer_can_mark_verifying',
    v_err is null and v_status = 'verifying_payment', coalesce(v_err, 'status='||v_status));

  v_err := pg_temp.as_customer(format(
    'insert into public.orders (user_id, customer_email, subtotal, delivery_charge, total_amount, fulfilment_method, status) '
    'values (%L, %L, 500, 0, 500, %L, %L)', v_uid, 'zz@test.local', 'pickup', 'processing'));
  insert into t_result values ('customer_cannot_insert_paid_order',
    v_err like 'CLIENT_WRITE_FORBIDDEN%', coalesce(v_err,'insert succeeded'));

  v_err := pg_temp.as_customer(format(
    'insert into public.payments (order_id, user_id, payment_reference, payment_method, gateway_provider, amount, status) '
    'values (%L, %L, %L, %L, %L, 500, %L)', v_o, v_uid, 'zz-ref-1', 'upi', 'manual', 'completed'));
  insert into t_result values ('customer_cannot_insert_completed_payment',
    v_err like 'CLIENT_WRITE_FORBIDDEN%', coalesce(v_err,'insert succeeded'));

  v_err := pg_temp.as_customer(format(
    'insert into public.payments (order_id, user_id, payment_reference, payment_method, gateway_provider, amount, status) '
    'values (%L, %L, %L, %L, %L, 500, %L)', v_o, v_uid, 'zz-ref-2', 'upi', 'manual', 'processing'));
  insert into t_result values ('customer_can_insert_processing_payment', v_err is null, coalesce(v_err,''));

  v_err := pg_temp.as_customer(format(
    'update public.payments set status = %L where payment_reference = %L', 'completed', 'zz-ref-2'));
  insert into t_result values ('customer_cannot_complete_payment',
    v_err like 'CLIENT_WRITE_FORBIDDEN%', coalesce(v_err,'update succeeded'));

  v_err := pg_temp.as_customer(format(
    'insert into public.payments (order_id, user_id, payment_reference, payment_method, gateway_provider, amount, status) '
    'values (%L, %L, %L, %L, %L, 500, %L)', v_o, v_uid, 'zz-ref-3', 'cash', 'manual', 'processing'));
  insert into t_result values ('customer_cannot_record_cash',
    v_err like 'CLIENT_WRITE_FORBIDDEN%', coalesce(v_err,'insert succeeded'));

  insert into t_ctx values ('o_customer', v_o::text);
end $$;

-- 10. Items cannot be added to an order once it is paid (o2 is processing).
do $$
declare v_err text;
begin
  v_err := pg_temp.as_customer(format(
    'insert into public.order_items (order_id, product_id, name, price, quantity) values (%L, %L, %L, 1, 1)',
    (select v from t_ctx where k = 'o2'), 'zz-test-frock', 'Sneaky'));
  insert into t_result values ('customer_cannot_add_items_to_paid_order',
    v_err like '%row-level security%', coalesce(v_err,'insert succeeded'));
end $$;

-- 11. The service path may record cash.
do $$
declare v_err text;
begin
  begin
    insert into public.payments (order_id, user_id, payment_reference, payment_method, gateway_provider, amount, status)
    values ((select v::uuid from t_ctx where k = 'o_customer'), (select v::uuid from t_ctx where k = 'uid'),
            'zz-ref-cash', 'cash', 'manual', 500, 'processing');
  exception when others then
    v_err := sqlerrm;
  end;
  insert into t_result values ('cash_is_a_valid_payment_method', v_err is null, coalesce(v_err,''));
end $$;

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason,'') end
  from t_result order by name;

rollback;
