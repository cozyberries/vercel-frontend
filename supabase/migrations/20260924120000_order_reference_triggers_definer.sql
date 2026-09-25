-- Hotfix: customer checkout fails with "permission denied for sequence
-- order_number_seq". 20260914030000_rls_deny_by_default revoked sequence
-- privileges from `authenticated`, but set_order_number() and
-- set_payment_reference() are SECURITY INVOKER triggers, so they call
-- nextval() as the customer. They now run as their owner.
--
-- No begin/commit on purpose: scripts/sql/test-order-references.sql loads this
-- file inside a rolled-back transaction. Apply it as one transaction:
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20260924120000_order_reference_triggers_definer.sql
-- Idempotent.

create or replace function public.set_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_number is null or new.order_number = '' then
    loop
      begin
        new.order_number := public.generate_order_number();
        exit;
      exception when unique_violation then
        continue;
      end;
    end loop;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_payment_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.internal_reference is null or new.internal_reference = '' then
    loop
      begin
        new.internal_reference := public.generate_payment_reference();
        exit;
      exception when unique_violation then
        continue;
      end;
    end loop;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Trigger functions run regardless of EXECUTE; nobody needs to call these as
-- RPC. Revoking must name `public`, or the PUBLIC grant keeps them callable.
revoke all on function public.set_order_number() from public, anon, authenticated;
revoke all on function public.set_payment_reference() from public, anon, authenticated;
revoke all on function public.generate_order_number() from public, anon, authenticated;
revoke all on function public.generate_payment_reference() from public, anon, authenticated;
