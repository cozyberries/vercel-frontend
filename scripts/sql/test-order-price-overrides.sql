-- Behavioural tests for supabase/migrations/20261004120000_order_price_overrides.sql.
-- Loads the migration, adds fixture orders in every override-note shape, loads
-- it again (the backfill is idempotent and only touches override notes), runs
-- every assertion, then rolls back: safe against the production database and
-- mutates nothing. Prints 'PASS <name>' or 'FAIL <name>: <reason>' per assertion.
\set ON_ERROR_STOP on
begin;

\ir ../../supabase/migrations/20261004120000_order_price_overrides.sql

create temporary table t_result(name text, ok boolean, reason text) on commit drop;
create temporary table t_ctx(k text primary key, v text) on commit drop;

-- Fixtures: an existing auth user (orders.user_id is an FK), then one pickup
-- order per note shape, placed "by" that user as the acting admin.
do $$
declare v_uid uuid;
begin
  select id into v_uid from auth.users order by created_at limit 1;
  insert into t_ctx values ('uid', v_uid::text);
end $$;

create function pg_temp.make(p_key text, p_notes text, p_code text, p_discount numeric, p_subtotal numeric, p_on_behalf boolean default true)
returns void language plpgsql as $$
declare v_id uuid; v_uid uuid := (select v::uuid from t_ctx where k = 'uid');
begin
  insert into public.orders (user_id, customer_email, subtotal, discount_code, discount_amount,
                             delivery_charge, total_amount, fulfilment_method, notes, placed_by_admin_id, updated_at)
  values (v_uid, 'zz@test.local', p_subtotal, p_code, p_discount, 0, p_subtotal - p_discount,
          'pickup', p_notes, case when p_on_behalf then v_uid else null end, '2026-09-27 12:00:00+05:30'::timestamptz)
  returning id into v_id;
  insert into t_ctx values (p_key, v_id::text);
  insert into t_ctx select p_key || ':updated_at', updated_at::text from public.orders where id = v_id;
end $$;

create function pg_temp.oid(p_key text) returns uuid language sql as $$
  select v::uuid from t_ctx where k = p_key
$$;

select pg_temp.make('amt',     '[ADMIN OVERRIDE by asha@zz.test]: Offline discount', 'ADMIN_OVERRIDE', 130, 2531);
select pg_temp.make('off',     '[ADMIN OVERRIDE by asha@zz.test]: (−5% discount)', 'ADMIN_OVERRIDE', 153, 3067);
select pg_temp.make('up',      '[ADMIN OVERRIDE by asha@zz.test]: (+50% prices) stall pickup' || E'\n' || 'Gift wrap please', 'ADMIN_PRICE_UP', 0, 669);
select pg_temp.make('bare',    '[ADMIN OVERRIDE by asha@zz.test]', 'ADMIN_OVERRIDE', 100, 1000);
select pg_temp.make('decimal', '[ADMIN OVERRIDE by asha@zz.test]: (+12.5% prices)', 'ADMIN_PRICE_UP', 0, 900);
select pg_temp.make('plain',   'Leave at the gate', null, 0, 500);
select pg_temp.make('forged',  '[ADMIN OVERRIDE by owner@zz.test]: (+50% prices)', null, 0, 700, false);
select pg_temp.make('edited',  'Customer rewrote this note', 'ADMIN_PRICE_UP', 0, 800);

-- trigger_set_order_number stamps updated_at = now() on INSERT too, so the
-- fixtures' past updated_at has to be set afterwards with both stamping
-- triggers off; otherwise insert and backfill share one now() and
-- updated_at_kept could not fail.
alter table public.orders disable trigger trigger_set_order_number;
alter table public.orders disable trigger trigger_orders_updated_at;
update public.orders
   set updated_at = '2026-09-27 12:00:00+05:30'::timestamptz
 where id in (select v::uuid from t_ctx
               where k in ('amt', 'off', 'up', 'bare', 'decimal', 'plain', 'forged', 'edited'));
alter table public.orders enable trigger trigger_orders_updated_at;
alter table public.orders enable trigger trigger_set_order_number;

-- Second load: backfills the fixtures.
\ir ../../supabase/migrations/20261004120000_order_price_overrides.sql

-- 1. Admin/internal tier: RLS forced, client roles hold nothing.
do $$
declare r record;
begin
  select relrowsecurity, relforcerowsecurity into r from pg_class where oid = 'public.order_price_overrides'::regclass;
  insert into t_result values ('rls_enabled_and_forced', r.relrowsecurity and r.relforcerowsecurity,
    format('rls=%s force=%s', r.relrowsecurity, r.relforcerowsecurity));
end $$;

do $$
declare leaked boolean;
begin
  leaked := has_table_privilege('anon', 'public.order_price_overrides', 'SELECT, INSERT, UPDATE, DELETE')
         or has_table_privilege('authenticated', 'public.order_price_overrides', 'SELECT, INSERT, UPDATE, DELETE');
  insert into t_result values ('client_roles_have_no_access', not leaked, 'anon or authenticated holds a privilege');
end $$;

-- 2. ₹ discount with a reason.
do $$
declare r public.order_price_overrides; o public.orders;
begin
  select * into r from public.order_price_overrides where order_id = pg_temp.oid('amt');
  select * into o from public.orders where id = pg_temp.oid('amt');
  insert into t_result values ('amount_note_moved',
    r.mode = 'amount' and r.percent is null and r.amount = 130 and r.catalogue_subtotal = 2531
      and r.reason = 'Offline discount' and r.admin_email = 'asha@zz.test'
      and r.admin_id = pg_temp.oid('uid') and o.notes is null and o.discount_code = 'ADMIN_OVERRIDE',
    format('row=%s notes=%s code=%s', r, o.notes, o.discount_code));
end $$;

-- 3. % discount with no reason.
do $$
declare r public.order_price_overrides; o public.orders;
begin
  select * into r from public.order_price_overrides where order_id = pg_temp.oid('off');
  select * into o from public.orders where id = pg_temp.oid('off');
  insert into t_result values ('percent_off_note_moved',
    r.mode = 'percent_off' and r.percent = 5.0 and r.amount = 153 and r.catalogue_subtotal = 3067
      and r.reason is null and o.notes is null and o.discount_code = 'ADMIN_OVERRIDE',
    format('row=%s notes=%s', r, o.notes));
end $$;

-- 4. Raise with a reason and a customer note underneath.
do $$
declare r public.order_price_overrides; o public.orders;
begin
  select * into r from public.order_price_overrides where order_id = pg_temp.oid('up');
  select * into o from public.orders where id = pg_temp.oid('up');
  insert into t_result values ('raise_moved_marker_cleared_customer_note_kept',
    r.mode = 'percent_up' and r.percent = 50.0 and r.amount is null and r.catalogue_subtotal is null
      and r.reason = 'stall pickup' and o.discount_code is null and o.notes = 'Gift wrap please',
    format('row=%s notes=%s code=%s', r, o.notes, o.discount_code));
end $$;

-- 5. A bare line (no colon, no reason).
do $$
declare r public.order_price_overrides; o public.orders;
begin
  select * into r from public.order_price_overrides where order_id = pg_temp.oid('bare');
  select * into o from public.orders where id = pg_temp.oid('bare');
  insert into t_result values ('bare_line_moved',
    r.mode = 'amount' and r.reason is null and r.amount = 100 and o.notes is null,
    format('row=%s notes=%s', r, o.notes));
end $$;

-- 6. A decimal raise.
do $$
declare r public.order_price_overrides;
begin
  select * into r from public.order_price_overrides where order_id = pg_temp.oid('decimal');
  insert into t_result values ('decimal_raise_parsed', r.mode = 'percent_up' and r.percent = 12.5 and r.reason is null,
    format('row=%s', r));
end $$;

-- 7. An ordinary note is left alone.
do $$
declare o public.orders; n int;
begin
  select * into o from public.orders where id = pg_temp.oid('plain');
  select count(*) into n from public.order_price_overrides where order_id = pg_temp.oid('plain');
  insert into t_result values ('plain_note_untouched', o.notes = 'Leave at the gate' and n = 0,
    format('notes=%s rows=%s', o.notes, n));
end $$;

-- 8. updated_at is kept on every moved order and on the cleared orphan
--    (both stamping triggers are off around the backfill updates).
do $$
declare v_moved int;
begin
  select count(*) into v_moved from public.orders
   where id in (select v::uuid from t_ctx where k in ('amt', 'off', 'up', 'bare', 'decimal', 'edited'))
     and updated_at is distinct from '2026-09-27 12:00:00+05:30'::timestamptz;
  insert into t_result values ('updated_at_kept', v_moved = 0,
    format('%s of 6 orders had updated_at moved', v_moved));
end $$;

-- 9. Both stamping triggers are back on afterwards.
do $$
declare v_off text;
begin
  select string_agg(tgname, ', ') into v_off from pg_trigger
   where tgrelid = 'public.orders'::regclass
     and tgname in ('trigger_orders_updated_at', 'trigger_set_order_number')
     and tgenabled <> 'O';
  insert into t_result values ('updated_at_trigger_reenabled',
    v_off is null
      and (select count(*) from pg_trigger
            where tgrelid = 'public.orders'::regclass
              and tgname in ('trigger_orders_updated_at', 'trigger_set_order_number')) = 2,
    format('still disabled: %s', coalesce(v_off, 'none')));
end $$;

-- A self-placed order's note is customer-written: never trusted.
do $$
declare o public.orders; n int;
begin
  select * into o from public.orders where id = pg_temp.oid('forged');
  select count(*) into n from public.order_price_overrides where order_id = pg_temp.oid('forged');
  insert into t_result values ('customer_written_note_ignored',
    n = 0 and o.notes = '[ADMIN OVERRIDE by owner@zz.test]: (+50% prices)',
    format('rows=%s notes=%s', n, o.notes));
end $$;

-- A leftover ADMIN_PRICE_UP without its note is cleared anyway.
do $$
declare o public.orders;
begin
  select * into o from public.orders where id = pg_temp.oid('edited');
  insert into t_result values ('orphan_price_up_code_cleared',
    o.discount_code is null and o.notes = 'Customer rewrote this note',
    format('code=%s notes=%s', o.discount_code, o.notes));
end $$;

-- 10. A third load changes nothing.
do $$
begin
  insert into t_ctx select 'rows_before', count(*)::text from public.order_price_overrides;
  insert into t_ctx select 'up_notes_before', notes from public.orders where id = pg_temp.oid('up');
end $$;

\ir ../../supabase/migrations/20261004120000_order_price_overrides.sql

do $$
declare n int; v_notes text;
begin
  select count(*) into n from public.order_price_overrides;
  select notes into v_notes from public.orders where id = pg_temp.oid('up');
  insert into t_result values ('rerun_changes_nothing',
    n::text = (select v from t_ctx where k = 'rows_before')
      and v_notes = (select v from t_ctx where k = 'up_notes_before'),
    format('rows %s -> %s, notes=%s', (select v from t_ctx where k = 'rows_before'), n, v_notes));
end $$;

-- 11. A percent with mode 'amount' is refused.
do $$
declare v_err text;
begin
  begin
    insert into public.order_price_overrides (order_id, mode, percent, amount)
      values (pg_temp.oid('plain'), 'amount', 5, 10);
  exception when check_violation then v_err := sqlerrm;
  end;
  insert into t_result values ('percent_must_match_mode', v_err is not null, 'insert was accepted');
end $$;

-- 12. Deleting the order deletes its record. Kept last.
do $$
declare n int;
begin
  delete from public.orders where id = pg_temp.oid('bare');
  select count(*) into n from public.order_price_overrides where order_id = pg_temp.oid('bare');
  insert into t_result values ('delete_cascades', n = 0, format('rows=%s', n));
end $$;

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason, '') end
  from t_result order by name;

rollback;
