-- Behavioural tests for supabase/migrations/20260927000000_stall_refills.sql.
-- Loads the migration inside one transaction, runs every assertion, then rolls
-- back, so it is safe to run against the production database and mutates
-- nothing. Prints 'PASS <name>' or 'FAIL <name>: <reason>' per assertion.
\set ON_ERROR_STOP on
begin;

\ir ../../supabase/migrations/20260927000000_stall_refills.sql

create temporary table t_result(name text, ok boolean, reason text) on commit drop;
create temporary table t_ctx(k text primary key, v text) on commit drop;

-- Fixtures: an existing auth user (orders.user_id is an FK) and a throwaway,
-- inactive product with a variant holding 10 units plus one that never sells.
do $$
declare
  v_uid uuid;
  v_sizes text[];
begin
  select id into v_uid from auth.users order by created_at limit 1;
  select array_agg(slug order by slug) into v_sizes
    from (select slug from public.sizes order by slug limit 2) s;
  insert into public.products (name, slug, price, base_price, is_active)
    values ('ZZ Refill Frock', 'zz-refill-frock', 500, 476, false);
  insert into public.product_variants (slug, product_slug, size_slug, price, base_price, stock_quantity)
    values ('zz-refill-frock-v', 'zz-refill-frock', v_sizes[1], 500, 476, 10),
           ('zz-refill-frock-unsold', 'zz-refill-frock', v_sizes[2], 500, 476, 4);
  insert into t_ctx values ('uid', v_uid::text), ('size', v_sizes[1]);
end $$;

create function pg_temp.stock() returns int language sql as $$
  select stock_quantity from public.product_variants where slug = 'zz-refill-frock-v'
$$;

create function pg_temp.today() returns date language sql as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

create function pg_temp.uid() returns uuid language sql as $$
  select v::uuid from t_ctx where k = 'uid'
$$;

-- A pickup order of p_qty units of the fixture variant, confirmed (paid) unless p_paid is false.
create function pg_temp.make_order(p_qty int, p_paid boolean default true) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.orders (user_id, customer_email, subtotal, delivery_charge, total_amount, fulfilment_method)
  values (pg_temp.uid(), 'zz@test.local', 500 * p_qty, 0, 500 * p_qty, 'pickup')
  returning id into v_id;
  insert into public.order_items (order_id, product_id, name, price, quantity, size, sku)
  values (v_id, 'zz-refill-frock', 'ZZ Refill Frock', 500, p_qty,
          upper((select v from t_ctx where k = 'size')), 'zz-refill-frock-v');
  if p_paid then
    update public.orders set status = 'processing' where id = v_id;
  end if;
  return v_id;
end $$;

-- Today's line for the fixture variant.
create function pg_temp.line()
returns table (sold int, handled int, stock_now int, n_actions int)
language sql as $$
  select l.sold, l.handled, l.stock_now, jsonb_array_length(l.actions)
    from public.stall_refill_lines(pg_temp.today()) l
   where l.variant_slug = 'zz-refill-frock-v' and l.sale_date = pg_temp.today()
$$;

-- Runs p_sql as service_role (the role the API uses). Returns the error text,
-- or null on success. p_sql may reference only public.* and literals.
create function pg_temp.as_service(p_sql text) returns text
language plpgsql as $$
declare
  v_err text;
begin
  begin
    perform set_config('role', 'service_role', true);
    execute p_sql;
    perform set_config('role', session_user, true);
    return null;
  exception when others then
    v_err := sqlerrm;
  end;
  perform set_config('role', session_user, true);
  return v_err;
end $$;

-- 1. A paid sale is listed for today with its units, stock left, and nothing handled.
do $$
declare r record;
begin
  perform pg_temp.make_order(2);
  select * into r from pg_temp.line();
  insert into t_result values ('paid_sale_is_listed_today',
    r.sold = 2 and r.handled = 0 and r.stock_now = 8 and r.n_actions = 0,
    format('sold=%s handled=%s stock_now=%s actions=%s', r.sold, r.handled, r.stock_now, r.n_actions));
end $$;

-- 2. An order still awaiting the owner's confirmation is not counted.
do $$
declare r record;
begin
  perform pg_temp.make_order(1, false);
  select * into r from pg_temp.line();
  insert into t_result values ('unpaid_order_is_not_counted', r.sold = 2, format('sold=%s', r.sold));
end $$;

-- 3. Refilled records at most the pending units and leaves stock alone.
do $$
declare v_row public.shelf_refills;
begin
  v_row := public.stall_refill_record(pg_temp.today(), 'zz-refill-frock-v', 'refilled', 5, pg_temp.uid(), 'Asha');
  insert into t_result values ('refilled_is_capped_at_pending',
    v_row.quantity = 2 and v_row.previous_stock is null and pg_temp.stock() = 8,
    format('quantity=%s previous_stock=%s stock=%s', v_row.quantity, v_row.previous_stock, pg_temp.stock()));
end $$;

-- 4. Once every unit is handled, another tap is refused.
do $$
declare v_err text;
begin
  begin
    perform public.stall_refill_record(pg_temp.today(), 'zz-refill-frock-v', 'refilled', 1, pg_temp.uid(), 'Asha');
  exception when others then
    v_err := sqlerrm;
  end;
  insert into t_result values ('handled_line_refuses_another_tap', v_err = 'NOTHING_TO_REFILL',
    'err=' || coalesce(v_err, 'none'));
end $$;

-- 5. A later sale of the same size comes back with only the new units.
do $$
declare r record;
begin
  insert into t_ctx values ('o_late', pg_temp.make_order(1)::text);
  select * into r from pg_temp.line();
  insert into t_result values ('new_sale_resurfaces_only_new_units',
    r.sold = 3 and r.handled = 2 and r.n_actions = 1,
    format('sold=%s handled=%s actions=%s', r.sold, r.handled, r.n_actions));
end $$;

-- 6. No stock left sets the stock to 0 and remembers the count it replaced.
do $$
declare v_row public.shelf_refills;
begin
  v_row := public.stall_refill_record(pg_temp.today(), 'zz-refill-frock-v', 'no_stock', 1, pg_temp.uid(), 'Asha');
  insert into t_ctx values ('nostock1', v_row.id::text);
  insert into t_result values ('no_stock_sets_zero_and_saves_previous',
    pg_temp.stock() = 0 and v_row.previous_stock = 7 and v_row.quantity = 1,
    format('stock=%s previous_stock=%s quantity=%s', pg_temp.stock(), v_row.previous_stock, v_row.quantity));
end $$;

-- 7. Undo of No stock left puts the old count back while the stock is still 0.
do $$
declare v_row public.shelf_refills;
begin
  v_row := public.stall_refill_undo((select v::uuid from t_ctx where k = 'nostock1'));
  insert into t_result values ('undo_no_stock_restores_count',
    pg_temp.stock() = 7 and not exists (select 1 from public.shelf_refills where id = v_row.id),
    format('stock=%s', pg_temp.stock()));
end $$;

-- 8. If the stock changed since (a restock), undo only removes the tick.
do $$
declare v_row public.shelf_refills;
begin
  v_row := public.stall_refill_record(pg_temp.today(), 'zz-refill-frock-v', 'no_stock', 1, pg_temp.uid(), 'Asha');
  update public.product_variants set stock_quantity = 12 where slug = 'zz-refill-frock-v';
  perform public.stall_refill_undo(v_row.id);
  insert into t_result values ('undo_no_stock_keeps_a_changed_count', pg_temp.stock() = 12,
    format('stock=%s', pg_temp.stock()));
end $$;

-- 9. The last unit already sold (stock 0): No stock left still records the tick,
--    and undoing it leaves the size at 0.
do $$
declare v_row public.shelf_refills;
begin
  update public.product_variants set stock_quantity = 0 where slug = 'zz-refill-frock-v';
  v_row := public.stall_refill_record(pg_temp.today(), 'zz-refill-frock-v', 'no_stock', 1, pg_temp.uid(), 'Asha');
  insert into t_result values ('no_stock_on_zero_records_previous_zero',
    v_row.previous_stock = 0 and pg_temp.stock() = 0,
    format('previous_stock=%s stock=%s', v_row.previous_stock, pg_temp.stock()));
  perform public.stall_refill_undo(v_row.id);
  insert into t_result values ('undo_no_stock_from_zero_stays_zero', pg_temp.stock() = 0,
    format('stock=%s', pg_temp.stock()));
  update public.product_variants set stock_quantity = 7 where slug = 'zz-refill-frock-v';
end $$;

-- 10. Cancelling a paid order takes its units off the list.
do $$
declare r record;
begin
  update public.orders set status = 'cancelled' where id = (select v::uuid from t_ctx where k = 'o_late');
  select * into r from pg_temp.line();
  insert into t_result values ('cancelled_order_drops_off', r.sold = 2, format('sold=%s', r.sold));
end $$;

-- 11. A sale just after IST midnight belongs to that IST day, not the UTC day before.
do $$
declare v_o uuid; r record; v_yesterday int;
begin
  v_o := pg_temp.make_order(1);
  -- 00:10 IST on the fixture day is 18:40 UTC the evening before.
  update public.orders
     set stock_committed_at = (pg_temp.today()::timestamp + interval '10 minutes') at time zone 'Asia/Kolkata'
   where id = v_o;
  select * into r from pg_temp.line();
  select coalesce(sum(l.sold), 0) into v_yesterday
    from public.stall_refill_lines(pg_temp.today() - 1) l
   where l.variant_slug = 'zz-refill-frock-v' and l.sale_date = pg_temp.today() - 1;
  insert into t_result values ('ist_midnight_sale_counts_for_the_ist_day',
    r.sold = 3 and v_yesterday = 0, format('today=%s yesterday=%s', r.sold, v_yesterday));
end $$;

-- 12. A size that did not sell that day cannot be ticked.
do $$
declare v_err text;
begin
  begin
    perform public.stall_refill_record(pg_temp.today(), 'zz-refill-frock-unsold', 'refilled', 1, pg_temp.uid(), 'Asha');
  exception when others then
    v_err := sqlerrm;
  end;
  insert into t_result values ('unsold_variant_is_refused', v_err like 'NOT_SOLD:%',
    'err=' || coalesce(v_err, 'none'));
end $$;

-- 13. Unknown actions and unknown undo ids are refused.
do $$
declare v_bad text; v_missing text;
begin
  begin
    perform public.stall_refill_record(pg_temp.today(), 'zz-refill-frock-v', 'restocked', 1, pg_temp.uid(), 'Asha');
  exception when others then
    v_bad := sqlerrm;
  end;
  begin
    perform public.stall_refill_undo(gen_random_uuid());
  exception when others then
    v_missing := sqlerrm;
  end;
  insert into t_result values ('unknown_action_is_refused', v_bad like 'BAD_ACTION:%',
    'err=' || coalesce(v_bad, 'none'));
  insert into t_result values ('undo_of_unknown_id_is_not_found', v_missing = 'NOT_FOUND',
    'err=' || coalesce(v_missing, 'none'));
end $$;

-- 14. anon and authenticated reach neither the table nor the functions.
do $$
declare
  f text;
  bad text[] := '{}';
begin
  if has_table_privilege('anon', 'public.shelf_refills', 'SELECT,INSERT,UPDATE,DELETE')
  or has_table_privilege('authenticated', 'public.shelf_refills', 'SELECT,INSERT,UPDATE,DELETE') then
    bad := bad || 'shelf_refills'::text;
  end if;
  foreach f in array array['public.stall_refill_lines(date)',
                           'public.stall_refill_record(date,text,text,integer,uuid,text)',
                           'public.stall_refill_undo(uuid)']
  loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      bad := bad || f;
    end if;
  end loop;
  insert into t_result values ('only_service_role_reaches_refills', cardinality(bad) = 0,
    'reachable: ' || array_to_string(bad, ', '));
end $$;

-- 15. The service role (what the API uses) can run all three end to end.
do $$
declare v_lines text; v_record text; v_undo text; v_id uuid;
begin
  v_lines := pg_temp.as_service(format('select * from public.stall_refill_lines(%L)', pg_temp.today()));
  v_record := pg_temp.as_service(format('select public.stall_refill_record(%L, %L, %L, 1, %L, %L)',
    pg_temp.today(), 'zz-refill-frock-v', 'refilled', pg_temp.uid(), 'Service'));
  select id into v_id from public.shelf_refills where acted_by_name = 'Service';
  v_undo := pg_temp.as_service(format('select public.stall_refill_undo(%L)', v_id));
  insert into t_result values ('service_role_runs_all_three',
    v_lines is null and v_record is null and v_id is not null and v_undo is null,
    format('lines=%s record=%s undo=%s', coalesce(v_lines, 'ok'), coalesce(v_record, 'ok'), coalesce(v_undo, 'ok')));
end $$;

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason, '') end
  from t_result order by name;

rollback;
