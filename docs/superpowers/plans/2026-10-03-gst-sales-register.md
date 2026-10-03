# GST Sales Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin page (`/admin/sales-register`) that previews a month's GST sales register with its aggregates and downloads it as a GSTR-1-ready Excel file.

**Architecture:** A migration adds `orders.invoice_voided_at` (stamped by the status trigger) and backfills invoice numbers for paid orders since GST registration. A pure TS module turns a month's invoiced orders into a `SalesRegister` by running every order through the existing `buildInvoice()`; a second module writes it to `.xlsx` with `write-excel-file`. Two admin-gated routes serve the JSON preview and the file; the client page renders the preview from the admin kit.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query v5, Supabase (service role, read-only here), Postgres (plpgsql migration), `write-excel-file` 4 (new), `read-excel-file` 9 (new, dev only), Tailwind 3 with `cb-*` tokens, vitest 4 + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-03-gst-sales-register-design.md` (in this worktree; gitignored, committed with `git add -f`).

**Branch:** `feature/gst-sales-register`, worktree `/Users/abdul.azeez/Personal/cozyberries/vercel-frontend-worktrees/gst-sales-register` (already created from `main` = `develop` = `391e350`). Never nest a worktree inside the repo.

## Before Task 1: worktree setup

```bash
cd /Users/abdul.azeez/Personal/cozyberries/vercel-frontend-worktrees/gst-sales-register
ln -s /Users/abdul.azeez/Personal/cozyberries/vercel-frontend/.env.local .env.local
npm ci
npx vitest run lib/invoice components/admin/nav.test.ts
```
Expected: all pass (baseline).

## Global Constraints

- Months are `YYYY-MM`. A month runs from 00:00 IST on its first day to 00:00 IST on the next month's first day, `[start, end)`. `GST_REGISTERED_FROM = "2026-09"`; no register exists before it or after the current IST month.
- Money is integer paise from `buildInvoice()` / `computeGst()` until it is written to a cell or formatted. Never recompute GST anywhere else.
- Spreadsheet number format `#,##0.00` (rupees); date cells `dd-mm-yyyy`, built as `new Date(Date.UTC(y, m, d))` from the IST calendar day.
- "As at month end": an invoice dated in month M is cancelled in M only when `invoice_voided_at < end of M`; otherwise it is valid in M. An invoice dated before M whose `invoice_voided_at` falls in M is listed in "Cancelled earlier" as minus figures.
- An invoice is voided when its order leaves a paid status for any non-paid status (`cancelled`, `refunded`, or a revert to `payment_pending` / `verifying_payment`). Paid statuses: `payment_confirmed`, `processing`, `ready_for_pickup`, `collected`, `shipped`, `delivered` (`PAID_ORDER_STATUSES`).
- A cancelled-in-month row keeps its line with every amount 0 and Status `Cancelled dd-mm-yyyy (was ₹1,234.00)`, or `Cancelled, date not recorded (was ₹1,234.00)` when `invoice_voided_at` is missing.
- B2CL: `mode === "inter"` and invoice value `> B2CL_LIMIT_PAISE` (`10_000_000`, i.e. ₹1,00,000.00). Intra-state is never B2CL. B2CL invoices are left out of B2CS (and a cancelled-earlier B2CL invoice is not netted into B2CS).
- Sheet names, in this order, verbatim: `Summary`, `Invoices`, `B2CS`, `B2CL`, `HSN summary`, `Documents issued`, `Cancelled earlier`. An empty list sheet holds one row `None this month`.
- File names: `cozyberries-sales-register-2026-09.xlsx`; unfinished month `cozyberries-sales-register-2026-10-upto-03.xlsx`.
- Tile labels, verbatim: "Invoice value", "Net invoices" (hint "N issued · N cancelled"), "Taxable value", "Total tax" (hint "CGST ₹… · SGST ₹… · IGST ₹…"). They must not reuse a heading or column label on the page ("Invoices", "Tax").
- Copy, verbatim: "Sales register", "Month", "Download Excel" (button accessible name; visible text "Excel"), "Month not finished", "· so far" (chip suffix), "Check before sending", "No invoices in Sep 2026" (pattern `No invoices in <Mon YYYY>`), "The download still gives a nil register to file.", "By place of supply (B2CS)", "Inter-state over ₹1,00,000 (B2CL)", "HSN summary", "Invoice numbers used", "Invoices", "Cancelled from earlier months", "Couldn't load the sales register", "Couldn't download the register", "None this month".
- Warning texts, verbatim: `Paid orders with no invoice number: ORD-A, ORD-B`; `Place of supply unknown for CB/26-27/0002: check the delivery address. It is shown as IGST.`; `CB/26-27/0003 adds up to ₹1,050.00 but the order total is ₹999.00.`; `CB/26-27/0004 is cancelled but has no cancellation date; counted as cancelled in its own month.`
- Security: both routes call `requireAdmin()` before anything else and before `createAdminSupabaseClient()`; responses carry `Cache-Control: private, no-store`; the download adds `X-Robots-Tag: noindex`. Customer phone and email are never selected. No Redis, no cache.
- Customer names are written as string cells (never formulas).
- Page: one block per row at every width (no `lg:grid-cols-*` on the block container). Stall `#c4703f`, Online `#2f7fc0` via `CHART_COLORS`. Sidebar tab only, not in the phone bottom bar.
- Fluid compute: no module-level per-request state.
- Tests: vitest only; every behaviour gets a test; component tests start with `// @vitest-environment jsdom`.
- Live database: only the owner writes it. You may try the rolled-back SQL test (`npm run db:test-sales-register`); if the auto-mode classifier blocks it, hand the owner `! npm run db:test-sales-register` instead of retrying. Applying the migration is the owner's step (Task 10).
- Commit after each task on the feature branch. Do not merge or push; the user ships.

## Review Focus

- A cancellation stamped at exactly 00:00 IST on the 1st belongs to the new month, so the old month stays valid. Pinned in Task 4 ("voided exactly at the month end stays valid").
- An inter-state invoice of exactly ₹1,00,000.00 is B2CS, one paisa more is B2CL. Pinned in Task 3 ("B2CL boundary").
- A customer named like a formula (`=HYPERLINK(…)`) must land in Excel as text. Pinned in Task 5 ("keeps a formula-like name as text").
- A month typed into the page URL that has no register (`2026-08`, `2026-13`, a future month) falls back to the default month instead of erroring. Pinned in Task 9 ("falls back to the default month for a month with no register").
- Downloading the unfinished current month must say so in the file name and next to the button. Pinned in Task 2 (file name) and Task 8 ("says the month is not finished").

---

### Task 1: Migration — `invoice_voided_at`, guard, backfill, SQL tests

**Files:**
- Create: `supabase/migrations/20261003120000_gst_sales_register.sql`
- Create: `scripts/sql/test-sales-register.sql`
- Create: `scripts/db-test-sales-register.mjs`
- Modify: `package.json` (scripts: add `db:test-sales-register` after `db:test-category-data`)

**Interfaces:**
- Consumes: `public.gst_financial_year(timestamptz)`, `public.invoice_counters(financial_year, last_seq)`, `public.order_status_events`, existing triggers `orders_guard_client_write` and `orders_on_status_change` (their functions are redefined here from `20260925000000_stall_pickup_orders.sql` and `20260925020000_pickup_items_integrity.sql`).
- Produces: column `public.orders.invoice_voided_at timestamptz`; function `public.backfill_invoice_numbers(p_from timestamptz) returns int`. Later tasks select `invoice_voided_at`.

- [ ] **Step 1: Write the SQL test (fails: column and function do not exist yet)**

Create `scripts/sql/test-sales-register.sql`:

```sql
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
```

Create `scripts/db-test-sales-register.mjs`:

```js
#!/usr/bin/env node
// Behavioural tests for the GST sales register migration. The SQL loads the
// migration inside a transaction and rolls back, so it mutates nothing.
import { runPsqlAssertions } from "./lib/run-psql-assertions.mjs";

runPsqlAssertions({ file: "scripts/sql/test-sales-register.sql", expected: 15 });
```

In `package.json` `scripts`, after the `"db:test-category-data"` line, add:

```json
    "db:test-sales-register": "node scripts/db-test-sales-register.mjs",
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run db:test-sales-register`
Expected: psql fails on the `\ir` (migration file not found). If the auto-mode classifier blocks the command, hand the owner `! npm run db:test-sales-register` and continue.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261003120000_gst_sales_register.sql`:

```sql
-- GST sales register (spec: docs/superpowers/specs/2026-10-03-gst-sales-register-design.md).
-- 1. orders.invoice_voided_at: when an invoiced order left a paid status, so a
--    month's register can be rebuilt "as at month end".
-- 2. orders_on_status_change stamps it on leaving a paid status and clears it
--    on re-entering one (redefined from 20260925020000; otherwise unchanged).
-- 3. guard_client_order_write refuses it on a customer INSERT (redefined from
--    20260925000000; the UPDATE path already refuses every non-editable column).
-- 4. backfill_invoice_numbers(): numbers paid orders that predate invoice numbering.
-- 5. Numbers every paid order since GST registration (1 Sep 2026) that has none.
-- 6. Dates any invoice already voided before this migration.
-- Idempotent: safe to run twice (scripts/sql/test-sales-register.sql does).

alter table public.orders add column if not exists invoice_voided_at timestamptz;
comment on column public.orders.invoice_voided_at is
  'When this invoiced order last left a paid status (cancelled, refunded or reverted). Cleared when it is paid again. Set only by orders_on_status_change.';

create or replace function public.orders_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  paid   constant text[] := array['payment_confirmed', 'processing', 'ready_for_pickup',
                                  'collected', 'shipped', 'delivered'];
  item record;
  fy text;
  seq int;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Entering a paid state from any unpaid one (payment_pending,
  -- verifying_payment, or a reinstated cancelled/refunded order).
  if not (old.status = any(paid)) and new.status = any(paid) then
    -- Line items must add up to the order's subtotal and carry a real price;
    -- otherwise items were added or changed after the order was placed.
    if exists (select 1 from public.order_items oi where oi.order_id = new.id and oi.price <= 0)
       or coalesce((select sum(oi.price * oi.quantity) from public.order_items oi where oi.order_id = new.id), 0)
          <> new.subtotal then
      raise exception 'ITEMS_MISMATCH:%', new.order_number using errcode = 'P0001';
    end if;

    if new.stock_committed_at is null then
      for item in
        select oi.name, oi.size, oi.quantity,
               public.order_item_variant_slug(oi.sku, oi.product_id, oi.size) as variant_slug
          from public.order_items oi
         where oi.order_id = new.id
         order by variant_slug
      loop
        -- A line that matches no variant is left untracked rather than
        -- blocking the confirmation of a real payment.
        continue when item.variant_slug is null;
        update public.product_variants v
           set stock_quantity = v.stock_quantity - item.quantity
         where v.slug = item.variant_slug
           and v.stock_quantity >= item.quantity;
        if not found then
          raise exception 'OUT_OF_STOCK:%', trim(item.name || ' ' || coalesce(item.size, ''))
            using errcode = 'P0001';
        end if;
      end loop;
      new.stock_committed_at := now();
    end if;

    if new.invoice_number is null then
      fy := public.gst_financial_year(now());
      insert into public.invoice_counters as c (financial_year, last_seq)
      values (fy, 1)
      on conflict (financial_year) do update set last_seq = c.last_seq + 1
      returning c.last_seq into seq;
      new.invoice_number := 'CB/' || fy || '/' || lpad(seq::text, greatest(4, length(seq::text)), '0');
      new.invoice_date := now();
    end if;

    -- A reinstated invoice is valid again; it keeps its number and date.
    new.invoice_voided_at := null;
  end if;

  -- Leaving a paid state (webhook revert, cancel, refund): return the stock.
  if old.status = any(paid)
     and not (new.status = any(paid))
     and new.stock_committed_at is not null then
    for item in
      select oi.quantity,
             public.order_item_variant_slug(oi.sku, oi.product_id, oi.size) as variant_slug
        from public.order_items oi
       where oi.order_id = new.id
       order by variant_slug
    loop
      continue when item.variant_slug is null;
      update public.product_variants v
         set stock_quantity = v.stock_quantity + item.quantity
       where v.slug = item.variant_slug;
    end loop;
    new.stock_committed_at := null;
  end if;

  -- Leaving a paid state voids the invoice as at now. Independent of stock:
  -- orders paid before stock tracking have no stock_committed_at.
  if old.status = any(paid)
     and not (new.status = any(paid))
     and new.invoice_number is not null then
    new.invoice_voided_at := now();
  end if;

  return new;
end;
$$;
revoke all on function public.orders_on_status_change() from public, anon, authenticated;

create or replace function public.guard_client_order_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  editable constant text[] := array['status', 'notes', 'updated_at'];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('payment_pending', 'verifying_payment')
       or new.invoice_number is not null
       or new.invoice_date is not null
       or new.invoice_voided_at is not null
       or new.stock_committed_at is not null
       or new.placed_by_admin_id is not null then
      raise exception 'CLIENT_WRITE_FORBIDDEN: orders insert' using errcode = '42501';
    end if;
    return new;
  end if;

  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'CLIENT_WRITE_FORBIDDEN: orders columns' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and not (old.status = 'payment_pending' and new.status = 'verifying_payment') then
    raise exception 'CLIENT_WRITE_FORBIDDEN: orders status % -> %', old.status, new.status
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Numbers paid orders that have no invoice number and were paid on or after
-- p_from, in paid-time order, each dated with its paid time. Paid time is the
-- earliest completed payment, else stock_committed_at, else created_at.
-- Returns how many it numbered; a second run numbers nothing.
create or replace function public.backfill_invoice_numbers(p_from timestamptz)
returns int
language plpgsql
set search_path = ''
as $$
declare
  paid constant text[] := array['payment_confirmed', 'processing', 'ready_for_pickup',
                                'collected', 'shipped', 'delivered'];
  rec record;
  fy text;
  seq int;
  n int := 0;
begin
  for rec in
    select o.id, t.paid_at
      from public.orders o
      cross join lateral (
        select coalesce(
                 (select min(coalesce(p.completed_at, p.updated_at, p.created_at))
                    from public.payments p
                   where p.order_id = o.id and p.status = 'completed'),
                 o.stock_committed_at,
                 o.created_at) as paid_at
      ) t
     where o.status = any(paid)
       and o.invoice_number is null
       and t.paid_at >= p_from
     order by t.paid_at, o.order_number
  loop
    fy := public.gst_financial_year(rec.paid_at);
    insert into public.invoice_counters as c (financial_year, last_seq)
    values (fy, 1)
    on conflict (financial_year) do update set last_seq = c.last_seq + 1
    returning c.last_seq into seq;
    update public.orders
       set invoice_number = 'CB/' || fy || '/' || lpad(seq::text, greatest(4, length(seq::text)), '0'),
           invoice_date = rec.paid_at
     where id = rec.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.backfill_invoice_numbers(timestamptz) from public, anon, authenticated;

-- GST registration took effect in September 2026.
do $$
begin
  perform public.backfill_invoice_numbers(timestamptz '2026-09-01 00:00:00+05:30');
end $$;

-- Invoices voided before this column existed: date them from the latest status
-- event into their current status, else updated_at.
update public.orders o
   set invoice_voided_at = coalesce(
         (select max(e.created_at)
            from public.order_status_events e
           where e.order_id = o.id and e.to_status = o.status),
         o.updated_at)
 where o.invoice_number is not null
   and o.invoice_voided_at is null
   and not (o.status = any (array['payment_confirmed', 'processing', 'ready_for_pickup',
                                  'collected', 'shipped', 'delivered']));
```

- [ ] **Step 4: Run the SQL test to verify it passes**

Run: `npm run db:test-sales-register`
Expected: `15/15 assertions passed.` If the classifier blocks it, hand the owner `! npm run db:test-sales-register`, and do not mark this step done until they paste the output showing 15/15.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261003120000_gst_sales_register.sql scripts/sql/test-sales-register.sql scripts/db-test-sales-register.mjs package.json
git commit -m "feat(db): invoice_voided_at, client guard and invoice-number backfill for the sales register"
```

---

### Task 2: Config, month and format helpers

**Files:**
- Modify: `lib/config/business.ts` (append four constants)
- Modify: `lib/config/business.test.ts` (one new case)
- Modify: `lib/admin/sales-range.ts:46` (`function istMidnight` → `export function istMidnight`)
- Create: `lib/gst/register-format.ts`, `lib/gst/register-format.test.ts`
- Create: `lib/gst/register-month.ts`, `lib/gst/register-month.test.ts`

**Interfaces:**
- Consumes: `istParts(d)`, `istMidnight(y, m, day)`, `MONTHS` from `lib/admin/sales-range.ts`.
- Produces:
  - `lib/config/business.ts`: `GST_REGISTERED_FROM = "2026-09"`, `B2CL_LIMIT_PAISE = 100_000_00`, `HSN_DESCRIPTION`, `UQC_PIECES = "PCS-PIECES"`.
  - `lib/gst/register-format.ts`: `formatPaise(paise: number): string`, `paiseToRupees(paise: number): number`, `formatIstDate(iso: string): string`, `formatIstDateTime(iso: string): string`, `istDateCell(iso: string): Date`, `placeOfSupplyLabel(pos: { code: string | null; name: string }): string`, `cancellationNote(cancelledAt: string | null, valuePaise: number): string`, `registerFileName(month: string, period: { to: string; unfinished: boolean }): string`.
  - `lib/gst/register-month.ts`: `monthKey(y: number, m: number): string`, `currentIstMonth(now: Date): string`, `monthBounds(month: string): { start: Date; end: Date }`, `availableMonths(now: Date): string[]` (newest first), `parseRegisterMonth(value: string | null | undefined, now: Date): string | null`, `defaultRegisterMonth(now: Date): string`, `isUnfinishedMonth(month: string, now: Date): boolean`, `monthLabel(month: string): string`, `registerPeriod(month: string, now: Date): { from: string; to: string; unfinished: boolean }`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/config/business.test.ts` (extend the import to `import { B2CL_LIMIT_PAISE, GST_REGISTERED_FROM, HSN_BABY_GARMENTS, SELLER, STALL, UQC_PIECES } from "./business";`) a new case inside the `describe`:

```ts
  it("starts the sales register at GST registration and sets the GSTR-1 constants", () => {
    expect(GST_REGISTERED_FROM).toBe("2026-09");
    expect(B2CL_LIMIT_PAISE).toBe(10_000_000);
    expect(UQC_PIECES).toBe("PCS-PIECES");
  });
```

Create `lib/gst/register-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  cancellationNote,
  formatIstDate,
  formatIstDateTime,
  formatPaise,
  istDateCell,
  paiseToRupees,
  placeOfSupplyLabel,
  registerFileName,
} from "./register-format";

describe("register-format", () => {
  it("formats paise as rupees with two decimals, minus sign for negatives, never -0", () => {
    expect(formatPaise(123450)).toBe("₹1,234.50");
    expect(formatPaise(10_000_001)).toBe("₹1,00,000.01");
    expect(formatPaise(-123450)).toBe("-₹1,234.50");
    expect(formatPaise(-0)).toBe("₹0.00");
  });

  it("turns paise into a rupee number for a cell", () => {
    expect(paiseToRupees(208571)).toBe(2085.71);
    expect(Object.is(paiseToRupees(-0), -0)).toBe(false);
  });

  it("prints dates by the IST calendar day", () => {
    expect(formatIstDate("2026-09-30T18:29:00.000Z")).toBe("30-09-2026"); // 23:59 IST
    expect(formatIstDate("2026-09-30T18:31:00.000Z")).toBe("01-10-2026"); // 00:01 IST
    expect(formatIstDateTime("2026-10-03T08:35:00.000Z")).toBe("03-10-2026 14:05 IST");
  });

  it("builds a spreadsheet date at UTC midnight of the IST day", () => {
    expect(istDateCell("2026-09-30T18:29:00.000Z").toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(istDateCell("2026-09-30T18:31:00.000Z").toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("labels the place of supply with its code, or a dash when unknown", () => {
    expect(placeOfSupplyLabel({ code: "29", name: "Karnataka" })).toBe("29-Karnataka");
    expect(placeOfSupplyLabel({ code: null, name: "test" })).toBe("—");
  });

  it("writes the cancelled status note", () => {
    expect(cancellationNote("2026-09-28T10:00:00.000Z", 105000)).toBe("Cancelled 28-09-2026 (was ₹1,050.00)");
    expect(cancellationNote(null, 105000)).toBe("Cancelled, date not recorded (was ₹1,050.00)");
  });

  it("names the file by month, adding the last day for an unfinished month", () => {
    expect(registerFileName("2026-09", { to: "30-09-2026", unfinished: false })).toBe("cozyberries-sales-register-2026-09.xlsx");
    expect(registerFileName("2026-10", { to: "03-10-2026", unfinished: true })).toBe("cozyberries-sales-register-2026-10-upto-03.xlsx");
  });
});
```

Create `lib/gst/register-month.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  availableMonths,
  currentIstMonth,
  defaultRegisterMonth,
  isUnfinishedMonth,
  monthBounds,
  monthKey,
  monthLabel,
  parseRegisterMonth,
  registerPeriod,
} from "./register-month";

const OCT_3 = new Date("2026-10-03T04:30:00.000Z"); // 10:00 IST

describe("register-month", () => {
  it("rolls month keys over year ends", () => {
    expect(monthKey(2026, 8)).toBe("2026-09");
    expect(monthKey(2026, 12)).toBe("2027-01");
    expect(monthKey(2027, -1)).toBe("2026-12");
  });

  it("decides the month by IST: 30 Sep 23:59 is September, 1 Oct 00:01 is October", () => {
    expect(currentIstMonth(new Date("2026-09-30T18:29:00.000Z"))).toBe("2026-09");
    expect(currentIstMonth(new Date("2026-09-30T18:31:00.000Z"))).toBe("2026-10");
  });

  it("gives [start, end) of a month as IST midnights", () => {
    const { start, end } = monthBounds("2026-09");
    expect(start.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(monthBounds("2026-12").end.toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });

  it("lists months from the current one back to GST registration, newest first", () => {
    expect(availableMonths(OCT_3)).toEqual(["2026-10", "2026-09"]);
    expect(availableMonths(new Date("2026-09-15T06:00:00.000Z"))).toEqual(["2026-09"]);
    expect(availableMonths(new Date("2026-12-31T19:00:00.000Z"))).toEqual([
      "2027-01", "2026-12", "2026-11", "2026-10", "2026-09",
    ]);
  });

  it("defaults to the last completed month, or the registration month itself", () => {
    expect(defaultRegisterMonth(OCT_3)).toBe("2026-09");
    expect(defaultRegisterMonth(new Date("2026-09-15T06:00:00.000Z"))).toBe("2026-09");
    expect(defaultRegisterMonth(new Date("2026-12-31T19:00:00.000Z"))).toBe("2026-12"); // 1 Jan 00:30 IST
  });

  it("accepts only months that have a register", () => {
    expect(parseRegisterMonth("2026-09", OCT_3)).toBe("2026-09");
    expect(parseRegisterMonth("2026-10", OCT_3)).toBe("2026-10");
    for (const bad of ["2026-08", "2026-11", "2026-13", "2026-9", "abcd-ef", "", null, undefined]) {
      expect(parseRegisterMonth(bad, OCT_3)).toBeNull();
    }
  });

  it("knows the current month is unfinished", () => {
    expect(isUnfinishedMonth("2026-10", OCT_3)).toBe(true);
    expect(isUnfinishedMonth("2026-09", OCT_3)).toBe(false);
  });

  it("labels months and their period", () => {
    expect(monthLabel("2026-09")).toBe("Sep 2026");
    expect(registerPeriod("2026-09", OCT_3)).toEqual({ from: "01-09-2026", to: "30-09-2026", unfinished: false });
    expect(registerPeriod("2026-10", OCT_3)).toEqual({ from: "01-10-2026", to: "03-10-2026", unfinished: true });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/config/business.test.ts lib/gst`
Expected: FAIL — `GST_REGISTERED_FROM` undefined; `./register-format` and `./register-month` cannot be resolved.

- [ ] **Step 3: Implement**

Append to `lib/config/business.ts`:

```ts
/** First month Cozyberries was GST-registered (YYYY-MM). No sales register exists before it. */
export const GST_REGISTERED_FROM = "2026-09";

/** GSTR-1 table 5 (B2CL): inter-state B2C invoices above ₹1,00,000 are reported one by one. */
export const B2CL_LIMIT_PAISE = 100_000_00;

/** HSN 6111 as GSTR-1 table 12 describes it. */
export const HSN_DESCRIPTION = "Babies' garments and clothing accessories, knitted or crocheted";

/** GSTR-1 unit quantity code for pieces. */
export const UQC_PIECES = "PCS-PIECES";
```

In `lib/admin/sales-range.ts`, change `function istMidnight(` to `export function istMidnight(` (no other change).

Create `lib/gst/register-format.ts`:

```ts
import { istParts } from "@/lib/admin/sales-range";

const pad = (n: number) => String(n).padStart(2, "0");
const IST_OFFSET_MS = 330 * 60 * 1000;
const RUPEES = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₹1,234.50"; "-₹1,234.50" for a negative amount. Adding 0 turns -0 into 0, so a zero never prints as "-₹0.00". */
export function formatPaise(paise: number): string {
  return RUPEES.format(paise / 100 + 0);
}

/** Rupees as a number for a spreadsheet cell. */
export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100 + 0;
}

/** dd-mm-yyyy of the IST calendar day of an instant. */
export function formatIstDate(iso: string): string {
  const { y, m, day } = istParts(new Date(iso));
  return `${pad(day)}-${pad(m + 1)}-${y}`;
}

/** "03-10-2026 14:05 IST". */
export function formatIstDateTime(iso: string): string {
  const ist = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return `${formatIstDate(iso)} ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())} IST`;
}

/** A spreadsheet date: UTC midnight of the IST calendar day, so the cell shows that day in every timezone. */
export function istDateCell(iso: string): Date {
  const { y, m, day } = istParts(new Date(iso));
  return new Date(Date.UTC(y, m, day));
}

/** "29-Karnataka"; "—" when the place of supply is unknown. */
export function placeOfSupplyLabel(pos: { code: string | null; name: string }): string {
  return pos.code ? `${pos.code}-${pos.name}` : "—";
}

/** The Status cell of an invoice cancelled within its month. */
export function cancellationNote(cancelledAt: string | null, valuePaise: number): string {
  const when = cancelledAt ? `Cancelled ${formatIstDate(cancelledAt)}` : "Cancelled, date not recorded";
  return `${when} (was ${formatPaise(valuePaise)})`;
}

/** cozyberries-sales-register-2026-09.xlsx; an unfinished month adds its last day: …-2026-10-upto-03.xlsx. */
export function registerFileName(month: string, period: { to: string; unfinished: boolean }): string {
  const upTo = period.unfinished ? `-upto-${period.to.slice(0, 2)}` : "";
  return `cozyberries-sales-register-${month}${upTo}.xlsx`;
}
```

Create `lib/gst/register-month.ts`:

```ts
import { GST_REGISTERED_FROM } from "@/lib/config/business";
import { MONTHS, istMidnight, istParts } from "@/lib/admin/sales-range";
import { formatIstDate } from "./register-format";

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const pad = (n: number) => String(n).padStart(2, "0");

function split(month: string): { y: number; m: number } {
  const match = MONTH_RE.exec(month);
  if (!match) throw new Error(`Not a YYYY-MM month: ${month}`);
  return { y: Number(match[1]), m: Number(match[2]) - 1 };
}

/** "2026-09" for a year and a zero-based month; months past either end of the year roll over. */
export function monthKey(y: number, m: number): string {
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function currentIstMonth(now: Date): string {
  const { y, m } = istParts(now);
  return monthKey(y, m);
}

/** [start, end) of a month in IST, as UTC instants. */
export function monthBounds(month: string): { start: Date; end: Date } {
  const { y, m } = split(month);
  return { start: istMidnight(y, m, 1), end: istMidnight(y, m + 1, 1) };
}

/** Every month with a register, newest first: the current IST month back to GST_REGISTERED_FROM. */
export function availableMonths(now: Date): string[] {
  const { y, m } = split(currentIstMonth(now));
  const months: string[] = [];
  for (let i = 0; ; i++) {
    const key = monthKey(y, m - i);
    if (key < GST_REGISTERED_FROM) return months;
    months.push(key);
  }
}

/** The month when it is well-formed and has a register, else null. */
export function parseRegisterMonth(value: string | null | undefined, now: Date): string | null {
  if (value == null || !MONTH_RE.test(value)) return null;
  return availableMonths(now).includes(value) ? value : null;
}

/** The month the owner sends: the last completed one, or the current one during the registration month. */
export function defaultRegisterMonth(now: Date): string {
  const months = availableMonths(now);
  return months[1] ?? months[0] ?? GST_REGISTERED_FROM;
}

export function isUnfinishedMonth(month: string, now: Date): boolean {
  return month === currentIstMonth(now);
}

/** "Sep 2026". */
export function monthLabel(month: string): string {
  const { y, m } = split(month);
  return `${MONTHS[m]} ${y}`;
}

/** First and last IST day covered, as dd-mm-yyyy; an unfinished month runs to today. */
export function registerPeriod(month: string, now: Date): { from: string; to: string; unfinished: boolean } {
  const { start, end } = monthBounds(month);
  const unfinished = isUnfinishedMonth(month, now);
  const last = unfinished ? now : new Date(end.getTime() - 1);
  return { from: formatIstDate(start.toISOString()), to: formatIstDate(last.toISOString()), unfinished };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/config/business.test.ts lib/gst lib/admin/sales-range.test.ts`
Expected: PASS (the sales-range tests are unaffected by the export).

- [ ] **Step 5: Commit**

```bash
git add lib/config/business.ts lib/config/business.test.ts lib/admin/sales-range.ts lib/gst/register-format.ts lib/gst/register-format.test.ts lib/gst/register-month.ts lib/gst/register-month.test.ts
git commit -m "feat(gst): register month and format helpers, GSTR-1 constants"
```

---

### Task 3: Register types and GSTR-1 summaries

**Files:**
- Create: `lib/gst/register-types.ts`
- Create: `lib/gst/register-summaries.ts`, `lib/gst/register-summaries.test.ts`
- Create: `lib/gst/__fixtures__/register.ts` (shared test fixtures; Task 4 adds to it)

**Interfaces:**
- Consumes: `B2CL_LIMIT_PAISE`, `HSN_BABY_GARMENTS`, `HSN_DESCRIPTION`, `UQC_PIECES`, `GST_RATE_PERCENT` (`lib/config/business.ts`); `placeOfSupplyLabel` (Task 2); `type TaxMode` (`lib/invoice/gst.ts`); `gstStateName` (`lib/invoice/state-codes.ts`).
- Produces (`lib/gst/register-types.ts`, all exported):
  ```ts
  type Channel = "stall" | "online";
  interface TaxAmounts { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; valuePaise: number }
  interface RegisterLine extends TaxAmounts { hsn: string; quantity: number }
  interface RegisterInvoice { orderId: string; invoiceNumber: string; invoiceDate: string; orderNumber: string; channel: Channel; customerName: string; placeOfSupply: { code: string | null; name: string }; mode: TaxMode; ratePercent: number; status: "valid" | "cancelled"; cancelledAt: string | null; amounts: TaxAmounts; discountPaise: number; shippingPaise: number; paymentMethod: string | null; lines: RegisterLine[] }
  interface B2csRow { placeOfSupply: string; ratePercent: number; monthTaxablePaise: number; lessCancelledTaxablePaise: number; net: TaxAmounts }
  interface HsnRow { hsn: string; description: string; uqc: string; ratePercent: number; quantity: number; net: TaxAmounts }
  interface DocumentRun { from: string; to: string; total: number; cancelled: number }
  interface ChannelTotal { count: number; valuePaise: number }
  interface RegisterTotals { issued: number; cancelled: number; month: TaxAmounts; cancelledEarlier: TaxAmounts; net: TaxAmounts; byChannel: Record<Channel, ChannelTotal> }
  interface SalesRegister { month: string; period: { from: string; to: string; unfinished: boolean }; generatedAt: string; seller: { legalName: string; gstin: string; stateCode: string; stateName: string }; invoices: RegisterInvoice[]; cancelledEarlier: RegisterInvoice[]; b2cs: B2csRow[]; b2cl: RegisterInvoice[]; hsn: HsnRow[]; documents: DocumentRun[]; totals: RegisterTotals; warnings: string[] }
  ```
- Produces (`lib/gst/register-summaries.ts`): `ZERO: TaxAmounts`, `addAmounts(a, b): TaxAmounts`, `subtractAmounts(a, b): TaxAmounts`, `sumAmounts(list: TaxAmounts[]): TaxAmounts`, `taxOf(a: TaxAmounts): number`, `effectiveAmounts(inv: RegisterInvoice): TaxAmounts`, `isB2cl(inv: RegisterInvoice): boolean`, `parseInvoiceNumber(n: string): { prefix: string; seq: number } | null`, `compareInvoiceNumbers(a: string, b: string): number`, `b2csRows(invoices: RegisterInvoice[], cancelledEarlier: RegisterInvoice[]): B2csRow[]`, `hsnRows(invoices: RegisterInvoice[], cancelledEarlier: RegisterInvoice[]): HsnRow[]`, `documentRuns(invoices: RegisterInvoice[]): DocumentRun[]`.
- Produces (`lib/gst/__fixtures__/register.ts`): `amountsFor(valuePaise: number, mode: "intra" | "inter"): TaxAmounts`, `registerInvoice(o?: RegisterInvoiceFixture): RegisterInvoice`.

- [ ] **Step 1: Write the types, the fixture and the failing test**

Create `lib/gst/register-types.ts`:

```ts
import type { TaxMode } from "@/lib/invoice/gst";

export type Channel = "stall" | "online";

/** Integer paise. valuePaise is the invoice value: taxable + tax. */
export interface TaxAmounts {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  valuePaise: number;
}

export interface RegisterLine extends TaxAmounts {
  hsn: string;
  /** Pieces; 0 for the shipping line. */
  quantity: number;
}

export interface RegisterInvoice {
  orderId: string;
  invoiceNumber: string;
  /** ISO instant. */
  invoiceDate: string;
  orderNumber: string;
  channel: Channel;
  customerName: string;
  placeOfSupply: { code: string | null; name: string };
  mode: TaxMode;
  ratePercent: number;
  /** As at the end of the register's month. */
  status: "valid" | "cancelled";
  /** ISO instant of the cancellation; null when valid, or when the date was never recorded. */
  cancelledAt: string | null;
  /** The invoice's own amounts, never zeroed; use effectiveAmounts() for what a row contributes. */
  amounts: TaxAmounts;
  discountPaise: number;
  shippingPaise: number;
  paymentMethod: string | null;
  lines: RegisterLine[];
}

/** GSTR-1 table 7. placeOfSupply is the "29-Karnataka" label. */
export interface B2csRow {
  placeOfSupply: string;
  ratePercent: number;
  monthTaxablePaise: number;
  lessCancelledTaxablePaise: number;
  net: TaxAmounts;
}

/** GSTR-1 table 12 (B2C). */
export interface HsnRow {
  hsn: string;
  description: string;
  uqc: string;
  ratePercent: number;
  quantity: number;
  net: TaxAmounts;
}

/** GSTR-1 table 13: one run of consecutive invoice numbers. */
export interface DocumentRun {
  from: string;
  to: string;
  total: number;
  cancelled: number;
}

export interface ChannelTotal {
  count: number;
  valuePaise: number;
}

export interface RegisterTotals {
  issued: number;
  cancelled: number;
  /** Valid invoices dated in the month. */
  month: TaxAmounts;
  /** Earlier months' invoices cancelled in this month (positive amounts). */
  cancelledEarlier: TaxAmounts;
  /** month − cancelledEarlier: the GSTR-3B 3.1(a) figures. */
  net: TaxAmounts;
  byChannel: Record<Channel, ChannelTotal>;
}

/** One month's sales register. Plain JSON: the API sends it as-is. */
export interface SalesRegister {
  month: string;
  /** dd-mm-yyyy. */
  period: { from: string; to: string; unfinished: boolean };
  generatedAt: string;
  seller: { legalName: string; gstin: string; stateCode: string; stateName: string };
  invoices: RegisterInvoice[];
  cancelledEarlier: RegisterInvoice[];
  b2cs: B2csRow[];
  b2cl: RegisterInvoice[];
  hsn: HsnRow[];
  documents: DocumentRun[];
  totals: RegisterTotals;
  warnings: string[];
}
```

Create `lib/gst/__fixtures__/register.ts`:

```ts
import { GST_RATE_PERCENT, HSN_BABY_GARMENTS } from "@/lib/config/business";
import { gstStateName } from "@/lib/invoice/state-codes";
import type { Channel, RegisterInvoice, RegisterLine, TaxAmounts } from "../register-types";

/** GST split of a tax-inclusive value, the way computeGst() splits one line. */
export function amountsFor(valuePaise: number, mode: "intra" | "inter"): TaxAmounts {
  const taxablePaise = Math.round((valuePaise * 100) / (100 + GST_RATE_PERCENT));
  const tax = valuePaise - taxablePaise;
  const cgstPaise = mode === "intra" ? Math.floor(tax / 2) : 0;
  return {
    taxablePaise,
    cgstPaise,
    sgstPaise: mode === "intra" ? tax - cgstPaise : 0,
    igstPaise: mode === "inter" ? tax : 0,
    valuePaise,
  };
}

export interface RegisterInvoiceFixture {
  invoiceNumber?: string;
  invoiceDate?: string;
  valuePaise?: number;
  /** "29" (home, intra) by default; any other code is inter-state; null is unknown (inter). */
  posCode?: string | null;
  status?: "valid" | "cancelled";
  cancelledAt?: string | null;
  channel?: Channel;
  quantity?: number;
  shippingPaise?: number;
}

export function registerInvoice(o: RegisterInvoiceFixture = {}): RegisterInvoice {
  const posCode = o.posCode === undefined ? "29" : o.posCode;
  const mode = posCode === "29" ? "intra" : "inter";
  const valuePaise = o.valuePaise ?? 105000;
  const shippingPaise = o.shippingPaise ?? 0;
  const amounts = amountsFor(valuePaise, mode);
  const goods = amountsFor(valuePaise - shippingPaise, mode);
  const lines: RegisterLine[] = [{ hsn: HSN_BABY_GARMENTS, quantity: o.quantity ?? 1, ...goods }];
  if (shippingPaise > 0) {
    lines.push({
      hsn: HSN_BABY_GARMENTS,
      quantity: 0,
      taxablePaise: amounts.taxablePaise - goods.taxablePaise,
      cgstPaise: amounts.cgstPaise - goods.cgstPaise,
      sgstPaise: amounts.sgstPaise - goods.sgstPaise,
      igstPaise: amounts.igstPaise - goods.igstPaise,
      valuePaise: shippingPaise,
    });
  }
  const invoiceNumber = o.invoiceNumber ?? "CB/26-27/0001";
  const status = o.status ?? "valid";
  return {
    orderId: `order-${invoiceNumber}`,
    invoiceNumber,
    invoiceDate: o.invoiceDate ?? "2026-09-25T06:05:00.000Z",
    orderNumber: "ORD-1",
    channel: o.channel ?? "stall",
    customerName: "Asha Rao",
    placeOfSupply: { code: posCode, name: (posCode && gstStateName(posCode)) || "—" },
    mode,
    ratePercent: GST_RATE_PERCENT,
    status,
    cancelledAt: status === "cancelled" ? (o.cancelledAt !== undefined ? o.cancelledAt : "2026-09-28T10:00:00.000Z") : null,
    amounts,
    discountPaise: 0,
    shippingPaise,
    paymentMethod: "Cash",
    lines,
  };
}
```

Create `lib/gst/register-summaries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HSN_DESCRIPTION } from "@/lib/config/business";
import { amountsFor, registerInvoice as inv } from "./__fixtures__/register";
import {
  b2csRows,
  compareInvoiceNumbers,
  documentRuns,
  effectiveAmounts,
  hsnRows,
  isB2cl,
  sumAmounts,
  taxOf,
  ZERO,
} from "./register-summaries";

describe("amount helpers", () => {
  it("adds amounts and zeroes a cancelled row", () => {
    expect(sumAmounts([amountsFor(105000, "intra"), amountsFor(210000, "intra")])).toEqual({
      taxablePaise: 300000, cgstPaise: 7500, sgstPaise: 7500, igstPaise: 0, valuePaise: 315000,
    });
    expect(taxOf(amountsFor(105000, "inter"))).toBe(5000);
    expect(effectiveAmounts(inv({ status: "cancelled" }))).toEqual(ZERO);
    expect(effectiveAmounts(inv())).toEqual(amountsFor(105000, "intra"));
  });
});

describe("B2CL boundary", () => {
  it("is inter-state above ₹1,00,000.00 only", () => {
    expect(isB2cl(inv({ posCode: "33", valuePaise: 10_000_000 }))).toBe(false);
    expect(isB2cl(inv({ posCode: "33", valuePaise: 10_000_001 }))).toBe(true);
    expect(isB2cl(inv({ posCode: "29", valuePaise: 20_000_000 }))).toBe(false);
  });
});

describe("b2csRows", () => {
  it("groups valid invoices by place of supply and rate, leaving cancelled rows out", () => {
    const rows = b2csRows(
      [
        inv({ invoiceNumber: "CB/26-27/0001", valuePaise: 105000 }),
        inv({ invoiceNumber: "CB/26-27/0002", valuePaise: 210000 }),
        inv({ invoiceNumber: "CB/26-27/0003", valuePaise: 50000, status: "cancelled" }),
        inv({ invoiceNumber: "CB/26-27/0004", valuePaise: 105000, posCode: "33" }),
      ],
      [],
    );
    expect(rows).toEqual([
      { placeOfSupply: "29-Karnataka", ratePercent: 5, monthTaxablePaise: 300000, lessCancelledTaxablePaise: 0,
        net: { taxablePaise: 300000, cgstPaise: 7500, sgstPaise: 7500, igstPaise: 0, valuePaise: 315000 } },
      { placeOfSupply: "33-Tamil Nadu", ratePercent: 5, monthTaxablePaise: 100000, lessCancelledTaxablePaise: 0,
        net: { taxablePaise: 100000, cgstPaise: 0, sgstPaise: 0, igstPaise: 5000, valuePaise: 105000 } },
    ]);
  });

  it("subtracts earlier months' cancellations, even for a state with no sale this month", () => {
    const rows = b2csRows(
      [inv({ valuePaise: 210000 })],
      [inv({ invoiceNumber: "CB/26-27/0001", status: "cancelled" }), inv({ invoiceNumber: "CB/26-27/0002", posCode: "27", status: "cancelled" })],
    );
    expect(rows).toEqual([
      { placeOfSupply: "27-Maharashtra", ratePercent: 5, monthTaxablePaise: 0, lessCancelledTaxablePaise: 100000,
        net: { taxablePaise: -100000, cgstPaise: 0, sgstPaise: 0, igstPaise: -5000, valuePaise: -105000 } },
      { placeOfSupply: "29-Karnataka", ratePercent: 5, monthTaxablePaise: 200000, lessCancelledTaxablePaise: 100000,
        net: { taxablePaise: 100000, cgstPaise: 2500, sgstPaise: 2500, igstPaise: 0, valuePaise: 105000 } },
    ]);
  });

  it("leaves B2CL invoices out, this month's and cancelled earlier ones", () => {
    const rows = b2csRows(
      [inv({ posCode: "33", valuePaise: 10_000_001 }), inv({ invoiceNumber: "CB/26-27/0002", posCode: "33", valuePaise: 10_000_000 })],
      [inv({ invoiceNumber: "CB/26-27/0003", posCode: "33", valuePaise: 10_000_001, status: "cancelled" })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ placeOfSupply: "33-Tamil Nadu", lessCancelledTaxablePaise: 0, net: { valuePaise: 10_000_000 } });
  });

  it("groups an unknown place of supply under a dash", () => {
    expect(b2csRows([inv({ posCode: null })], [])[0].placeOfSupply).toBe("—");
  });
});

describe("hsnRows", () => {
  it("counts pieces but not shipping, nets earlier cancellations and skips cancelled rows", () => {
    const rows = hsnRows(
      [
        inv({ invoiceNumber: "CB/26-27/0001", valuePaise: 315000, quantity: 3, shippingPaise: 9000 }),
        inv({ invoiceNumber: "CB/26-27/0002", status: "cancelled", quantity: 5 }),
      ],
      [inv({ invoiceNumber: "CB/26-27/0000", quantity: 1, status: "cancelled" })],
    );
    expect(rows).toEqual([
      {
        hsn: "6111",
        description: HSN_DESCRIPTION,
        uqc: "PCS-PIECES",
        ratePercent: 5,
        quantity: 2,
        net: { taxablePaise: 200000, cgstPaise: 5000, sgstPaise: 5000, igstPaise: 0, valuePaise: 210000 },
      },
    ]);
  });

  it("is empty with no invoices", () => {
    expect(hsnRows([], [])).toEqual([]);
  });
});

describe("invoice numbers", () => {
  it("orders by number within a series, not as text", () => {
    expect(compareInvoiceNumbers("CB/26-27/9999", "CB/26-27/10000")).toBeLessThan(0);
    expect(compareInvoiceNumbers("CB/25-26/0099", "CB/26-27/0001")).toBeLessThan(0);
  });

  it("splits documents into runs of consecutive numbers with their cancelled counts", () => {
    const numbers = [...Array.from({ length: 16 }, (_, i) => i + 1), 25, 26].map((n) => `CB/26-27/${String(n).padStart(4, "0")}`);
    const shuffled = [numbers[17], ...numbers.slice(0, 17).reverse()];
    const runs = documentRuns(
      shuffled.map((invoiceNumber) => inv({ invoiceNumber, status: invoiceNumber === "CB/26-27/0003" ? "cancelled" : "valid" })),
    );
    expect(runs).toEqual([
      { from: "CB/26-27/0001", to: "CB/26-27/0016", total: 16, cancelled: 1 },
      { from: "CB/26-27/0025", to: "CB/26-27/0026", total: 2, cancelled: 0 },
    ]);
  });

  it("starts a new run for a new series", () => {
    expect(documentRuns([inv({ invoiceNumber: "CB/25-26/0099" }), inv({ invoiceNumber: "CB/26-27/0001" })])).toEqual([
      { from: "CB/25-26/0099", to: "CB/25-26/0099", total: 1, cancelled: 0 },
      { from: "CB/26-27/0001", to: "CB/26-27/0001", total: 1, cancelled: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/gst/register-summaries.test.ts`
Expected: FAIL — `./register-summaries` cannot be resolved.

- [ ] **Step 3: Implement `lib/gst/register-summaries.ts`**

```ts
import { B2CL_LIMIT_PAISE, HSN_BABY_GARMENTS, HSN_DESCRIPTION, UQC_PIECES } from "@/lib/config/business";
import { placeOfSupplyLabel } from "./register-format";
import type { B2csRow, DocumentRun, HsnRow, RegisterInvoice, TaxAmounts } from "./register-types";

export const ZERO: TaxAmounts = { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, valuePaise: 0 };

export function addAmounts(a: TaxAmounts, b: TaxAmounts): TaxAmounts {
  return {
    taxablePaise: a.taxablePaise + b.taxablePaise,
    cgstPaise: a.cgstPaise + b.cgstPaise,
    sgstPaise: a.sgstPaise + b.sgstPaise,
    igstPaise: a.igstPaise + b.igstPaise,
    valuePaise: a.valuePaise + b.valuePaise,
  };
}

export function subtractAmounts(a: TaxAmounts, b: TaxAmounts): TaxAmounts {
  return {
    taxablePaise: a.taxablePaise - b.taxablePaise,
    cgstPaise: a.cgstPaise - b.cgstPaise,
    sgstPaise: a.sgstPaise - b.sgstPaise,
    igstPaise: a.igstPaise - b.igstPaise,
    valuePaise: a.valuePaise - b.valuePaise,
  };
}

export function sumAmounts(list: TaxAmounts[]): TaxAmounts {
  return list.reduce(addAmounts, ZERO);
}

export function taxOf(a: TaxAmounts): number {
  return a.cgstPaise + a.sgstPaise + a.igstPaise;
}

/** What a row contributes as at month end: its amounts when valid, zero when cancelled. */
export function effectiveAmounts(inv: RegisterInvoice): TaxAmounts {
  return inv.status === "valid" ? inv.amounts : ZERO;
}

/** GSTR-1 table 5: inter-state invoices above ₹1,00,000. An intra-state invoice never is. */
export function isB2cl(inv: RegisterInvoice): boolean {
  return inv.mode === "inter" && inv.amounts.valuePaise > B2CL_LIMIT_PAISE;
}

const INVOICE_NUMBER = /^(.*\/)(\d+)$/;

export function parseInvoiceNumber(n: string): { prefix: string; seq: number } | null {
  const match = INVOICE_NUMBER.exec(n);
  return match ? { prefix: match[1], seq: Number(match[2]) } : null;
}

/** CB/26-27/9999 before CB/26-27/10000; numbers of another shape sort after, as text. */
export function compareInvoiceNumbers(a: string, b: string): number {
  const pa = parseInvoiceNumber(a);
  const pb = parseInvoiceNumber(b);
  if (pa && pb) return pa.prefix.localeCompare(pb.prefix) || pa.seq - pb.seq;
  if (pa) return -1;
  if (pb) return 1;
  return a.localeCompare(b);
}

/**
 * GSTR-1 table 7, one row per place of supply and rate: this month's valid
 * non-B2CL invoices, less earlier months' non-B2CL invoices cancelled this month.
 */
export function b2csRows(invoices: RegisterInvoice[], cancelledEarlier: RegisterInvoice[]): B2csRow[] {
  const rows = new Map<string, { placeOfSupply: string; ratePercent: number; month: TaxAmounts; less: TaxAmounts }>();
  const rowFor = (inv: RegisterInvoice) => {
    const placeOfSupply = placeOfSupplyLabel(inv.placeOfSupply);
    const key = `${placeOfSupply}|${inv.ratePercent}`;
    let row = rows.get(key);
    if (!row) {
      row = { placeOfSupply, ratePercent: inv.ratePercent, month: ZERO, less: ZERO };
      rows.set(key, row);
    }
    return row;
  };
  for (const inv of invoices) {
    if (inv.status !== "valid" || isB2cl(inv)) continue;
    const row = rowFor(inv);
    row.month = addAmounts(row.month, inv.amounts);
  }
  for (const inv of cancelledEarlier) {
    if (isB2cl(inv)) continue;
    const row = rowFor(inv);
    row.less = addAmounts(row.less, inv.amounts);
  }
  return [...rows.values()]
    .sort((a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply) || a.ratePercent - b.ratePercent)
    .map((row) => ({
      placeOfSupply: row.placeOfSupply,
      ratePercent: row.ratePercent,
      monthTaxablePaise: row.month.taxablePaise,
      lessCancelledTaxablePaise: row.less.taxablePaise,
      net: subtractAmounts(row.month, row.less),
    }));
}

/**
 * GSTR-1 table 12 (B2C), one row per HSN and rate over every valid invoice's
 * lines (B2CS and B2CL), less earlier months' cancellations. Shipping lines
 * carry quantity 0, so they add value but not pieces.
 */
export function hsnRows(invoices: RegisterInvoice[], cancelledEarlier: RegisterInvoice[]): HsnRow[] {
  const rows = new Map<string, { hsn: string; ratePercent: number; quantity: number; net: TaxAmounts }>();
  const add = (inv: RegisterInvoice, sign: 1 | -1) => {
    for (const line of inv.lines) {
      const key = `${line.hsn}|${inv.ratePercent}`;
      const row = rows.get(key) ?? { hsn: line.hsn, ratePercent: inv.ratePercent, quantity: 0, net: ZERO };
      row.quantity += sign * line.quantity;
      row.net = sign === 1 ? addAmounts(row.net, line) : subtractAmounts(row.net, line);
      rows.set(key, row);
    }
  };
  for (const inv of invoices) if (inv.status === "valid") add(inv, 1);
  for (const inv of cancelledEarlier) add(inv, -1);
  return [...rows.values()]
    .sort((a, b) => a.hsn.localeCompare(b.hsn) || a.ratePercent - b.ratePercent)
    .map((row) => ({
      hsn: row.hsn,
      description: row.hsn === HSN_BABY_GARMENTS ? HSN_DESCRIPTION : "",
      uqc: UQC_PIECES,
      ratePercent: row.ratePercent,
      quantity: row.quantity,
      net: row.net,
    }));
}

/** GSTR-1 table 13: runs of consecutive numbers within one series, each with its cancelled count. */
export function documentRuns(invoices: RegisterInvoice[]): DocumentRun[] {
  const sorted = [...invoices].sort((a, b) => compareInvoiceNumbers(a.invoiceNumber, b.invoiceNumber));
  const runs: DocumentRun[] = [];
  let previous: { prefix: string; seq: number } | null = null;
  for (const inv of sorted) {
    const parsed = parseInvoiceNumber(inv.invoiceNumber);
    const last = runs[runs.length - 1];
    if (last && parsed && previous && parsed.prefix === previous.prefix && parsed.seq === previous.seq + 1) {
      last.to = inv.invoiceNumber;
      last.total += 1;
    } else {
      runs.push({ from: inv.invoiceNumber, to: inv.invoiceNumber, total: 1, cancelled: 0 });
    }
    if (inv.status === "cancelled") runs[runs.length - 1].cancelled += 1;
    previous = parsed;
  }
  return runs;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/gst/register-summaries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/gst/register-types.ts lib/gst/register-summaries.ts lib/gst/register-summaries.test.ts lib/gst/__fixtures__/register.ts
git commit -m "feat(gst): register types and GSTR-1 summaries (B2CS, B2CL, HSN, document runs)"
```

---

### Task 4: `buildSalesRegister` (pure)

**Files:**
- Create: `lib/gst/sales-register.ts`, `lib/gst/sales-register.test.ts`
- Modify: `lib/gst/__fixtures__/register.ts` (add `orderRow`, `GSTIN`, `NOW`, `salesRegisterFixture`)

**Interfaces:**
- Consumes: `buildInvoice`, `type InvoiceOrderRow` (`lib/invoice/build-invoice.ts`); `PAID_ORDER_STATUSES` (`lib/admin/sales-metrics.ts`); `GST_RATE_PERCENT`, `SELLER` (`lib/config/business.ts`); `gstStateName`; Task 2 `formatPaise`, `monthBounds`, `registerPeriod`; Task 3 `b2csRows`, `hsnRows`, `documentRuns`, `isB2cl`, `compareInvoiceNumbers`, `sumAmounts`, `subtractAmounts` and the types.
- Produces (`lib/gst/sales-register.ts`):
  - `type RegisterOrderRow = Omit<InvoiceOrderRow, "customer_email" | "customer_phone" | "invoice_number" | "invoice_date"> & { invoice_number: string; invoice_date: string; invoice_voided_at: string | null }`
  - `interface MissingNumberRow { order_number: string }`
  - `buildSalesRegister(input: { month: string; orders: RegisterOrderRow[]; cancelledEarlier: RegisterOrderRow[]; missingNumbers: MissingNumberRow[]; gstin: string; now: Date }): SalesRegister`
- Produces (fixtures): `GSTIN = "29EPDPR9174E1ZB"`, `NOW = new Date("2026-10-03T04:30:00.000Z")`, `orderRow(o?: Partial<RegisterOrderRow>): RegisterOrderRow`, `salesRegisterFixture(): SalesRegister` (September: 0001 stall ₹1,050, 0002 online ₹1,140 incl. ₹90 shipping, 0003 cancelled 28 Sep).

- [ ] **Step 1: Add the fixtures and write the failing test**

Append to `lib/gst/__fixtures__/register.ts` (add the imports at the top of the file):

```ts
import { buildSalesRegister, type RegisterOrderRow } from "../sales-register";
import type { SalesRegister } from "../register-types";

export const GSTIN = "29EPDPR9174E1ZB";
export const NOW = new Date("2026-10-03T04:30:00.000Z"); // 3 Oct 2026, 10:00 IST

/** An invoiced September stall order of ₹1,050 (one item). */
export function orderRow(o: Partial<RegisterOrderRow> = {}): RegisterOrderRow {
  return {
    id: "order-1",
    order_number: "ORD-1",
    created_at: "2026-09-25T06:00:00.000Z",
    status: "collected",
    fulfilment_method: "pickup",
    customer_name: "Asha Rao",
    shipping_address: null,
    place_of_supply: "29",
    invoice_number: "CB/26-27/0001",
    invoice_date: "2026-09-25T06:05:00.000Z",
    invoice_voided_at: null,
    subtotal: 1050,
    discount_amount: 0,
    delivery_charge: 0,
    total_amount: 1050,
    order_items: [{ name: "Frock", size: "3-4Y", color: "pink", price: 1050, quantity: 1 }],
    payments: [{ payment_method: "cash", status: "completed" }],
    ...o,
  };
}

/** September 2026: 0001 stall ₹1,050; 0002 online ₹1,140 (₹90 shipping); 0003 cancelled on 28 Sep. */
export function salesRegisterFixture(): SalesRegister {
  return buildSalesRegister({
    month: "2026-09",
    orders: [
      orderRow(),
      orderRow({
        id: "order-2",
        order_number: "ORD-2",
        invoice_number: "CB/26-27/0002",
        invoice_date: "2026-09-27T06:00:00.000Z",
        status: "delivered",
        fulfilment_method: "delivery",
        customer_name: "Ravi Kumar",
        place_of_supply: "29",
        shipping_address: { full_name: "Ravi Kumar", city: "Bengaluru", state: "Karnataka", postal_code: "560001" },
        delivery_charge: 90,
        total_amount: 1140,
        payments: [{ payment_method: "upi", status: "completed" }],
      }),
      orderRow({
        id: "order-3",
        order_number: "ORD-3",
        invoice_number: "CB/26-27/0003",
        invoice_date: "2026-09-28T05:00:00.000Z",
        status: "cancelled",
        invoice_voided_at: "2026-09-28T10:00:00.000Z",
        customer_name: "Meena Iyer",
      }),
    ],
    cancelledEarlier: [],
    missingNumbers: [],
    gstin: GSTIN,
    now: NOW,
  });
}
```

Create `lib/gst/sales-register.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildInvoice } from "@/lib/invoice/build-invoice";
import { GSTIN, NOW, orderRow } from "./__fixtures__/register";
import { buildSalesRegister, type RegisterOrderRow } from "./sales-register";

const build = (orders: RegisterOrderRow[], extra: Partial<Parameters<typeof buildSalesRegister>[0]> = {}) =>
  buildSalesRegister({ month: "2026-09", orders, cancelledEarlier: [], missingNumbers: [], gstin: GSTIN, now: NOW, ...extra });

const invoiceTotals = (row: RegisterOrderRow) =>
  buildInvoice({ order: { ...row, customer_email: null, customer_phone: null }, gstin: GSTIN, homeStateCode: "29" }).totals;

describe("buildSalesRegister", () => {
  it("matches buildInvoice to the paisa, line by line and in total", () => {
    const rows = [
      orderRow(),
      orderRow({ id: "o2", invoice_number: "CB/26-27/0002", subtotal: 2100, discount_amount: 50, total_amount: 2050,
        order_items: [{ name: "Set", size: "1-2Y", color: null, price: 700, quantity: 3 }] }),
      orderRow({ id: "o3", invoice_number: "CB/26-27/0003", status: "delivered", fulfilment_method: "delivery",
        place_of_supply: "33", shipping_address: { full_name: "K", state: "Tamil Nadu" }, delivery_charge: 90, total_amount: 1140 }),
    ];
    const r = build(rows);
    rows.forEach((row, i) => {
      const t = invoiceTotals(row);
      expect(r.invoices[i].amounts).toEqual({
        taxablePaise: t.taxablePaise, cgstPaise: t.cgstPaise, sgstPaise: t.sgstPaise, igstPaise: t.igstPaise, valuePaise: t.totalPaise,
      });
    });
    expect(r.totals.month.valuePaise).toBe(105000 + 205000 + 114000);
    expect(r.totals.month.taxablePaise).toBe(rows.reduce((s, row) => s + invoiceTotals(row).taxablePaise, 0));
    expect(r.invoices[1]).toMatchObject({ discountPaise: 5000, shippingPaise: 0 });
    expect(r.invoices[2]).toMatchObject({ shippingPaise: 9000, mode: "inter", channel: "online", placeOfSupply: { code: "33", name: "Tamil Nadu" } });
    expect(r.invoices[2].lines.map((l) => l.quantity)).toEqual([1, 0]);
  });

  it("zeroes nothing itself but marks an invoice cancelled within its month", () => {
    const r = build([orderRow({ status: "cancelled", invoice_voided_at: "2026-09-28T10:00:00.000Z" })]);
    expect(r.invoices[0]).toMatchObject({ status: "cancelled", cancelledAt: "2026-09-28T10:00:00.000Z", amounts: { valuePaise: 105000 } });
    expect(r.totals).toMatchObject({ issued: 1, cancelled: 1, month: { valuePaise: 0 } });
    expect(r.documents).toEqual([{ from: "CB/26-27/0001", to: "CB/26-27/0001", total: 1, cancelled: 1 }]);
    expect(r.b2cs).toEqual([]);
  });

  it("keeps an invoice cancelled after the month end valid in its month", () => {
    const r = build([orderRow({ status: "cancelled", invoice_voided_at: "2026-10-02T10:00:00.000Z" })]);
    expect(r.invoices[0]).toMatchObject({ status: "valid", cancelledAt: null });
    expect(r.totals).toMatchObject({ cancelled: 0, month: { valuePaise: 105000 } });
  });

  it("voided exactly at the month end stays valid; a millisecond earlier is cancelled", () => {
    const atEnd = build([orderRow({ status: "cancelled", invoice_voided_at: "2026-09-30T18:30:00.000Z" })]);
    const justBefore = build([orderRow({ status: "cancelled", invoice_voided_at: "2026-09-30T18:29:59.999Z" })]);
    expect(atEnd.invoices[0].status).toBe("valid");
    expect(justBefore.invoices[0].status).toBe("cancelled");
  });

  it("subtracts earlier months' invoices cancelled this month", () => {
    const r = buildSalesRegister({
      month: "2026-10",
      orders: [orderRow({ id: "o17", invoice_number: "CB/26-27/0017", invoice_date: "2026-10-02T06:00:00.000Z" })],
      cancelledEarlier: [orderRow({ status: "cancelled", invoice_voided_at: "2026-10-02T09:00:00.000Z" })],
      missingNumbers: [],
      gstin: GSTIN,
      now: NOW,
    });
    expect(r.cancelledEarlier[0]).toMatchObject({ invoiceNumber: "CB/26-27/0001", status: "cancelled", cancelledAt: "2026-10-02T09:00:00.000Z" });
    expect(r.totals.cancelledEarlier.valuePaise).toBe(105000);
    expect(r.totals.net).toEqual({ taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, valuePaise: 0 });
    expect(r.b2cs[0]).toMatchObject({ monthTaxablePaise: 100000, lessCancelledTaxablePaise: 100000, net: { taxablePaise: 0 } });
    expect(r.hsn[0].quantity).toBe(0);
    expect(r.period).toEqual({ from: "01-10-2026", to: "03-10-2026", unfinished: true });
  });

  it("splits valid invoices between Stall and Online", () => {
    const r = build([
      orderRow(),
      orderRow({ id: "o2", invoice_number: "CB/26-27/0002", status: "delivered", fulfilment_method: "delivery",
        shipping_address: { full_name: "R", state: "Karnataka" }, place_of_supply: null, delivery_charge: 90, total_amount: 1140 }),
      orderRow({ id: "o3", invoice_number: "CB/26-27/0003", status: "cancelled", invoice_voided_at: "2026-09-28T10:00:00.000Z" }),
    ]);
    expect(r.totals.byChannel).toEqual({ stall: { count: 1, valuePaise: 105000 }, online: { count: 1, valuePaise: 114000 } });
    expect(r.invoices[1].placeOfSupply).toEqual({ code: "29", name: "Karnataka" });
  });

  it("puts inter-state invoices above ₹1,00,000 in B2CL and out of B2CS", () => {
    const r = build([
      orderRow({ invoice_number: "CB/26-27/0005", status: "delivered", fulfilment_method: "delivery", place_of_supply: "27",
        shipping_address: { full_name: "M", state: "Maharashtra" }, subtotal: 100000.01, total_amount: 100000.01,
        order_items: [{ name: "Bulk", size: null, color: null, price: 100000.01, quantity: 1 }] }),
    ]);
    expect(r.b2cl.map((i) => i.invoiceNumber)).toEqual(["CB/26-27/0005"]);
    expect(r.b2cs).toEqual([]);
    expect(r.hsn[0].net.valuePaise).toBe(10_000_001);
  });

  it("sorts invoices by number", () => {
    const r = build(["CB/26-27/0010", "CB/26-27/0002", "CB/26-27/0009"].map((n, i) => orderRow({ id: `o${i}`, invoice_number: n })));
    expect(r.invoices.map((i) => i.invoiceNumber)).toEqual(["CB/26-27/0002", "CB/26-27/0009", "CB/26-27/0010"]);
  });

  it("warns about missing numbers, unknown place of supply, total mismatch and undated cancellations", () => {
    const r = build(
      [
        orderRow({ id: "o4", invoice_number: "CB/26-27/0004", status: "cancelled", invoice_voided_at: null }),
        orderRow({ id: "o2", invoice_number: "CB/26-27/0002", status: "delivered", fulfilment_method: "delivery",
          place_of_supply: null, shipping_address: { full_name: "R", state: "test" }, delivery_charge: 90, total_amount: 1140 }),
        orderRow({ id: "o3", invoice_number: "CB/26-27/0003", total_amount: 999 }),
      ],
      { missingNumbers: [{ order_number: "ORD-A" }, { order_number: "ORD-B" }] },
    );
    expect(r.warnings).toEqual([
      "Paid orders with no invoice number: ORD-A, ORD-B",
      "Place of supply unknown for CB/26-27/0002: check the delivery address. It is shown as IGST.",
      "CB/26-27/0003 adds up to ₹1,050.00 but the order total is ₹999.00.",
      "CB/26-27/0004 is cancelled but has no cancellation date; counted as cancelled in its own month.",
    ]);
    expect(r.invoices[0]).toMatchObject({ invoiceNumber: "CB/26-27/0002", mode: "inter" });
    expect(r.invoices[2]).toMatchObject({ invoiceNumber: "CB/26-27/0004", status: "cancelled", cancelledAt: null });
  });

  it("builds an empty month: zero totals, no rows, no warnings", () => {
    const r = build([]);
    expect(r).toMatchObject({
      month: "2026-09",
      period: { from: "01-09-2026", to: "30-09-2026", unfinished: false },
      generatedAt: NOW.toISOString(),
      seller: { legalName: "Cozyberries", gstin: GSTIN, stateCode: "29", stateName: "Karnataka" },
      invoices: [], cancelledEarlier: [], b2cs: [], b2cl: [], hsn: [], documents: [], warnings: [],
      totals: { issued: 0, cancelled: 0, month: { valuePaise: 0 }, net: { valuePaise: 0 },
        byChannel: { stall: { count: 0, valuePaise: 0 }, online: { count: 0, valuePaise: 0 } } },
    });
  });

  it("carries the customer name and payment method, never phone or email", () => {
    const r = build([orderRow()]);
    expect(r.invoices[0]).toMatchObject({ customerName: "Asha Rao", paymentMethod: "Cash", orderNumber: "ORD-1" });
    expect(JSON.stringify(r)).not.toMatch(/phone|email/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/gst/sales-register.test.ts`
Expected: FAIL — `./sales-register` cannot be resolved.

- [ ] **Step 3: Implement `lib/gst/sales-register.ts`**

```ts
import { GST_RATE_PERCENT, SELLER } from "@/lib/config/business";
import { PAID_ORDER_STATUSES } from "@/lib/admin/sales-metrics";
import { buildInvoice, type InvoiceOrderRow } from "@/lib/invoice/build-invoice";
import { gstStateName } from "@/lib/invoice/state-codes";
import { formatPaise } from "./register-format";
import { monthBounds, registerPeriod } from "./register-month";
import { b2csRows, compareInvoiceNumbers, documentRuns, hsnRows, isB2cl, subtractAmounts, sumAmounts } from "./register-summaries";
import type { Channel, ChannelTotal, RegisterInvoice, RegisterLine, SalesRegister } from "./register-types";

/** An invoiced order as the register reads it. Phone and email are never selected. */
export type RegisterOrderRow = Omit<InvoiceOrderRow, "customer_email" | "customer_phone" | "invoice_number" | "invoice_date"> & {
  invoice_number: string;
  invoice_date: string;
  invoice_voided_at: string | null;
};

export interface MissingNumberRow {
  order_number: string;
}

const PAID = new Set<string>(PAID_ORDER_STATUSES);

/** Whether an invoice counts as cancelled as at `end` (the month's exclusive end). */
function cancellationAsAt(row: RegisterOrderRow, end: Date): { cancelled: boolean; at: string | null; undated: boolean } {
  if (row.invoice_voided_at) {
    return { cancelled: new Date(row.invoice_voided_at) < end, at: row.invoice_voided_at, undated: false };
  }
  // Voided before invoice_voided_at existed and never dated: cancelled in its own month.
  if (!PAID.has(row.status)) return { cancelled: true, at: null, undated: true };
  return { cancelled: false, at: null, undated: false };
}

function toRegisterInvoice(row: RegisterOrderRow, gstin: string, cancelled: boolean, cancelledAt: string | null): RegisterInvoice {
  const invoice = buildInvoice({
    order: { ...row, customer_email: null, customer_phone: null },
    gstin,
    homeStateCode: gstin.slice(0, 2),
  });
  // computeGst() lists the goods lines in order_items order, then the shipping line.
  const goodsCount = row.order_items.length;
  const lines: RegisterLine[] = invoice.lines.map((line, i) => ({
    hsn: line.hsn,
    quantity: i < goodsCount ? line.quantity : 0,
    taxablePaise: line.taxablePaise,
    cgstPaise: line.cgstPaise,
    sgstPaise: line.sgstPaise,
    igstPaise: line.igstPaise,
    valuePaise: line.amountPaise,
  }));
  const t = invoice.totals;
  return {
    orderId: row.id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    orderNumber: row.order_number,
    channel: row.fulfilment_method === "pickup" ? "stall" : "online",
    customerName: invoice.buyer.name,
    placeOfSupply: invoice.placeOfSupply,
    mode: invoice.mode,
    ratePercent: GST_RATE_PERCENT,
    status: cancelled ? "cancelled" : "valid",
    cancelledAt: cancelled ? cancelledAt : null,
    amounts: { taxablePaise: t.taxablePaise, cgstPaise: t.cgstPaise, sgstPaise: t.sgstPaise, igstPaise: t.igstPaise, valuePaise: t.totalPaise },
    discountPaise: t.discountPaise,
    shippingPaise: lines.slice(goodsCount).reduce((sum, line) => sum + line.valuePaise, 0),
    paymentMethod: invoice.paymentMethod,
    lines,
  };
}

function checkInvoice(row: RegisterOrderRow, inv: RegisterInvoice, warnings: string[]) {
  if (inv.placeOfSupply.code === null) {
    warnings.push(`Place of supply unknown for ${inv.invoiceNumber}: check the delivery address. It is shown as IGST.`);
  }
  const orderPaise = Math.round(Number(row.total_amount) * 100);
  if (orderPaise !== inv.amounts.valuePaise) {
    warnings.push(`${inv.invoiceNumber} adds up to ${formatPaise(inv.amounts.valuePaise)} but the order total is ${formatPaise(orderPaise)}.`);
  }
}

function channelTotals(valid: RegisterInvoice[]): Record<Channel, ChannelTotal> {
  const totals: Record<Channel, ChannelTotal> = { stall: { count: 0, valuePaise: 0 }, online: { count: 0, valuePaise: 0 } };
  for (const inv of valid) {
    totals[inv.channel].count += 1;
    totals[inv.channel].valuePaise += inv.amounts.valuePaise;
  }
  return totals;
}

const byNumber = (a: RegisterOrderRow, b: RegisterOrderRow) => compareInvoiceNumbers(a.invoice_number, b.invoice_number);

/**
 * One month's GST sales register, as at the month's end (as at now for the
 * current month). `orders` are the invoices dated in the month;
 * `cancelledEarlier` are invoices dated before it and voided in it.
 */
export function buildSalesRegister(input: {
  month: string;
  orders: RegisterOrderRow[];
  cancelledEarlier: RegisterOrderRow[];
  missingNumbers: MissingNumberRow[];
  gstin: string;
  now: Date;
}): SalesRegister {
  const { month, gstin, now } = input;
  const { end } = monthBounds(month);
  const warnings: string[] = [];
  if (input.missingNumbers.length > 0) {
    warnings.push(`Paid orders with no invoice number: ${input.missingNumbers.map((r) => r.order_number).join(", ")}`);
  }

  const invoices = [...input.orders].sort(byNumber).map((row) => {
    const c = cancellationAsAt(row, end);
    const inv = toRegisterInvoice(row, gstin, c.cancelled, c.at);
    checkInvoice(row, inv, warnings);
    if (c.undated) {
      warnings.push(`${inv.invoiceNumber} is cancelled but has no cancellation date; counted as cancelled in its own month.`);
    }
    return inv;
  });
  const cancelledEarlier = [...input.cancelledEarlier]
    .sort(byNumber)
    .map((row) => toRegisterInvoice(row, gstin, true, row.invoice_voided_at));

  const valid = invoices.filter((inv) => inv.status === "valid");
  const monthTotals = sumAmounts(valid.map((inv) => inv.amounts));
  const earlierTotals = sumAmounts(cancelledEarlier.map((inv) => inv.amounts));
  const stateCode = gstin.slice(0, 2);

  return {
    month,
    period: registerPeriod(month, now),
    generatedAt: now.toISOString(),
    seller: { legalName: SELLER.legalName, gstin, stateCode, stateName: gstStateName(stateCode) ?? SELLER.stateName },
    invoices,
    cancelledEarlier,
    b2cs: b2csRows(invoices, cancelledEarlier),
    b2cl: valid.filter(isB2cl),
    hsn: hsnRows(invoices, cancelledEarlier),
    documents: documentRuns(invoices),
    totals: {
      issued: invoices.length,
      cancelled: invoices.length - valid.length,
      month: monthTotals,
      cancelledEarlier: earlierTotals,
      net: subtractAmounts(monthTotals, earlierTotals),
      byChannel: channelTotals(valid),
    },
    warnings,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/gst`
Expected: PASS (all `lib/gst` files).

- [ ] **Step 5: Commit**

```bash
git add lib/gst/sales-register.ts lib/gst/sales-register.test.ts lib/gst/__fixtures__/register.ts
git commit -m "feat(gst): buildSalesRegister, as at month end, from buildInvoice"
```

---

### Task 5: Excel writer

**Files:**
- Modify: `package.json`, `package-lock.json` (add `write-excel-file`, dev `read-excel-file`)
- Create: `lib/gst/register-xlsx.ts`, `lib/gst/register-xlsx.test.ts`

**Interfaces:**
- Consumes: `SalesRegister`, `RegisterInvoice` (Task 3); `effectiveAmounts`, `taxOf` (Task 3); `cancellationNote`, `formatIstDateTime`, `istDateCell`, `paiseToRupees`, `placeOfSupplyLabel` (Task 2); `monthLabel` (Task 2); fixtures `buildSalesRegister`, `orderRow`, `GSTIN`, `NOW` (Task 4).
- Produces: `XLSX_CONTENT_TYPE: string`, `SHEET_NAMES` (readonly tuple), `INVOICE_COLUMNS: string[]`, `registerXlsx(register: SalesRegister): Promise<Buffer>`.

- [ ] **Step 1: Install the libraries**

```bash
npm install write-excel-file@^4.1.1
npm install --save-dev read-excel-file@^9.3.10
```
Expected: `package.json` gains `"write-excel-file": "^4.1.1"` in dependencies and `"read-excel-file": "^9.3.10"` in devDependencies.

- [ ] **Step 2: Write the failing test**

Create `lib/gst/register-xlsx.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import readExcelFile from "read-excel-file/node";
import { HSN_DESCRIPTION } from "@/lib/config/business";
import { GSTIN, NOW, orderRow } from "./__fixtures__/register";
import { INVOICE_COLUMNS, registerXlsx, SHEET_NAMES } from "./register-xlsx";
import { buildSalesRegister } from "./sales-register";
import type { SalesRegister } from "./register-types";

type Cell = string | number | boolean | Date | null;

async function workbook(register: SalesRegister): Promise<Record<string, Cell[][]>> {
  const sheets = await readExcelFile(await registerXlsx(register));
  return Object.fromEntries(sheets.map((s) => [s.sheet, s.data as Cell[][]]));
}

const FORMULA_NAME = '=HYPERLINK("http://x","y")';

/** 0001 stall ₹1,050 (formula-like name); 0002 cancelled 28 Sep; 0003 online ₹1,140 dated 30 Sep 23:59 IST. */
function september(): SalesRegister {
  return buildSalesRegister({
    month: "2026-09",
    orders: [
      orderRow({ customer_name: FORMULA_NAME }),
      orderRow({ id: "o2", invoice_number: "CB/26-27/0002", status: "cancelled", invoice_voided_at: "2026-09-28T10:00:00.000Z" }),
      orderRow({ id: "o3", invoice_number: "CB/26-27/0003", invoice_date: "2026-09-30T18:29:00.000Z", status: "delivered",
        fulfilment_method: "delivery", shipping_address: { full_name: "R", state: "Karnataka" }, delivery_charge: 90, total_amount: 1140,
        payments: [{ payment_method: "upi", status: "completed" }] }),
    ],
    cancelledEarlier: [],
    missingNumbers: [{ order_number: "ORD-X" }],
    gstin: GSTIN,
    now: NOW,
  });
}

const valueOf = (rows: Cell[][], label: string): Cell[] => rows.filter((r) => r[0] === label).map((r) => r[1]);

describe("registerXlsx", () => {
  it("writes seven sheets in order", async () => {
    expect(Object.keys(await workbook(september()))).toEqual([...SHEET_NAMES]);
    expect(SHEET_NAMES).toEqual(["Summary", "Invoices", "B2CS", "B2CL", "HSN summary", "Documents issued", "Cancelled earlier"]);
  });

  it("lists every invoice with a Total row equal to the Summary and to the sum of its rows", async () => {
    const book = await workbook(september());
    const rows = book.Invoices;
    expect(rows[0]).toEqual(INVOICE_COLUMNS);
    expect(rows.slice(1, 4).map((r) => r[0])).toEqual(["CB/26-27/0001", "CB/26-27/0002", "CB/26-27/0003"]);
    const total = rows[4];
    expect(total[0]).toBe("Total");
    expect(total.slice(8, 15)).toEqual([2085.71, 52.14, 52.15, 0, 2190, 0, 90]);
    for (let col = 8; col <= 12; col++) {
      const sum = rows.slice(1, 4).reduce((s, r) => s + Number(r[col]), 0);
      expect(sum).toBeCloseTo(Number(total[col]), 2);
    }
    expect(valueOf(book.Summary, "Invoice value")).toEqual([2190, 0, 2190]);
  });

  it("zeroes a cancelled row and notes the cancellation", async () => {
    const row = (await workbook(september())).Invoices[2];
    expect(row.slice(8, 15)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(row[16]).toBe("Cancelled 28-09-2026 (was ₹1,050.00)");
  });

  it("writes dates as date cells on the IST day", async () => {
    const row = (await workbook(september())).Invoices[3];
    expect((row[1] as Date).toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });

  it("keeps a formula-like name as text", async () => {
    expect((await workbook(september())).Invoices[1][4]).toBe(FORMULA_NAME);
  });

  it("fills the Summary with business, period, counts and warnings", async () => {
    const s = (await workbook(september())).Summary;
    expect(s[0][0]).toBe("Sales register — Sep 2026");
    expect(valueOf(s, "GSTIN")).toEqual([GSTIN]);
    expect(valueOf(s, "Period")).toEqual(["01-09-2026 to 30-09-2026"]);
    expect(valueOf(s, "Invoices issued")).toEqual([3]);
    expect(valueOf(s, "Invoices cancelled")).toEqual([1]);
    expect(valueOf(s, "Stall invoice value")).toEqual([1050]);
    expect(s.some((r) => r[0] === "Paid orders with no invoice number: ORD-X")).toBe(true);
  });

  it("writes B2CS, HSN and document runs", async () => {
    const book = await workbook(september());
    expect(book.B2CS[1]).toEqual(["OE", "29-Karnataka", 5, 2085.71, 0, 2085.71, 0, 52.14, 52.15, 0]);
    expect(book["HSN summary"][1]).toEqual(["6111", HSN_DESCRIPTION, "PCS-PIECES", 2, 5, 2085.71, 0, 52.14, 52.15, 0, 2190]);
    expect(book["Documents issued"][1]).toEqual(["Invoices for outward supply", "CB/26-27/0001", "CB/26-27/0003", 3, 1, 2]);
    expect(book.B2CL[1][0]).toBe("None this month");
    expect(book["Cancelled earlier"][1][0]).toBe("None this month");
  });

  it("writes earlier cancellations as minus figures", async () => {
    const register = buildSalesRegister({
      month: "2026-10",
      orders: [],
      cancelledEarlier: [orderRow({ status: "cancelled", invoice_voided_at: "2026-10-02T09:00:00.000Z" })],
      missingNumbers: [],
      gstin: GSTIN,
      now: NOW,
    });
    const row = (await workbook(register))["Cancelled earlier"][1];
    expect(row[0]).toBe("CB/26-27/0001");
    expect((row[1] as Date).toISOString()).toBe("2026-09-25T00:00:00.000Z");
    expect((row[2] as Date).toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(row.slice(3)).toEqual(["29-Karnataka", 5, -1000, -25, -25, 0, -1050]);
  });

  it("writes a nil register for an empty month", async () => {
    const book = await workbook(buildSalesRegister({ month: "2026-09", orders: [], cancelledEarlier: [], missingNumbers: [], gstin: GSTIN, now: NOW }));
    expect(book.Invoices).toHaveLength(2);
    expect(book.Invoices[1].slice(0, 13)).toEqual(["Total", null, null, null, null, null, null, null, 0, 0, 0, 0, 0]);
    for (const sheet of ["B2CS", "B2CL", "HSN summary", "Documents issued", "Cancelled earlier"]) {
      expect(book[sheet][1][0]).toBe("None this month");
    }
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run lib/gst/register-xlsx.test.ts`
Expected: FAIL — `./register-xlsx` cannot be resolved.

- [ ] **Step 4: Implement `lib/gst/register-xlsx.ts`**

```ts
import writeExcelFile, { type Row, type SheetData } from "write-excel-file/node";
import { cancellationNote, formatIstDateTime, istDateCell, paiseToRupees, placeOfSupplyLabel } from "./register-format";
import { monthLabel } from "./register-month";
import { effectiveAmounts, taxOf } from "./register-summaries";
import type { RegisterInvoice, SalesRegister, TaxAmounts } from "./register-types";

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const SHEET_NAMES = ["Summary", "Invoices", "B2CS", "B2CL", "HSN summary", "Documents issued", "Cancelled earlier"] as const;
export const INVOICE_COLUMNS = [
  "Invoice no.", "Invoice date", "Order no.", "Channel", "Customer name", "Place of supply", "Supply", "Rate %",
  "Taxable value", "CGST", "SGST", "IGST", "Invoice value", "Discount", "Shipping", "Payment method", "Status",
];

const NONE = "None this month";
const head = (labels: string[]): Row => labels.map((value) => ({ value, fontWeight: "bold" as const }));
// Every text cell is typed String, so a value starting with "=" is stored as text, never as a formula.
const text = (value: string) => ({ value, type: String });
const money = (paise: number) => ({ value: paiseToRupees(paise), type: Number, format: "#,##0.00" });
const count = (n: number) => ({ value: n, type: Number });
const date = (iso: string) => ({ value: istDateCell(iso), type: Date, format: "dd-mm-yyyy" });
const orNone = (header: Row, rows: Row[]): SheetData => [header, ...(rows.length ? rows : [[text(NONE)]])];

function amountRows(a: TaxAmounts): Row[] {
  return [
    [text("Taxable value"), money(a.taxablePaise)],
    [text("CGST"), money(a.cgstPaise)],
    [text("SGST"), money(a.sgstPaise)],
    [text("IGST"), money(a.igstPaise)],
    [text("Total tax"), money(taxOf(a))],
    [text("Invoice value"), money(a.valuePaise)],
  ];
}

function summarySheet(r: SalesRegister): SheetData {
  const t = r.totals;
  const period = `${r.period.from} to ${r.period.to}${r.period.unfinished ? " (month not finished)" : ""}`;
  return [
    head([`Sales register — ${monthLabel(r.month)}`, ""]),
    [text("Business"), text(r.seller.legalName)],
    [text("GSTIN"), text(r.seller.gstin)],
    [text("State"), text(`${r.seller.stateCode}-${r.seller.stateName}`)],
    [text("Period"), text(period)],
    [text("Generated at"), text(formatIstDateTime(r.generatedAt))],
    [],
    [text("Invoices issued"), count(t.issued)],
    [text("Invoices cancelled"), count(t.cancelled)],
    [text("Net invoices issued"), count(t.issued - t.cancelled)],
    [],
    head(["This month's invoices", ""]),
    ...amountRows(t.month),
    [text("Stall invoices"), count(t.byChannel.stall.count)],
    [text("Stall invoice value"), money(t.byChannel.stall.valuePaise)],
    [text("Online invoices"), count(t.byChannel.online.count)],
    [text("Online invoice value"), money(t.byChannel.online.valuePaise)],
    [],
    head(["Less: earlier months' invoices cancelled this month", ""]),
    ...amountRows(t.cancelledEarlier),
    [],
    head(["Net for the month (GSTR-3B 3.1(a))", ""]),
    ...amountRows(t.net),
    ...(r.warnings.length ? [[], head(["Warnings", ""]), ...r.warnings.map((w) => [text(w)])] : []),
  ];
}

function invoiceRow(inv: RegisterInvoice): Row {
  const a = effectiveAmounts(inv);
  const valid = inv.status === "valid";
  return [
    text(inv.invoiceNumber),
    date(inv.invoiceDate),
    text(inv.orderNumber),
    text(inv.channel === "stall" ? "Stall" : "Online"),
    text(inv.customerName),
    text(placeOfSupplyLabel(inv.placeOfSupply)),
    text(inv.mode === "intra" ? "Intra" : "Inter"),
    count(inv.ratePercent),
    money(a.taxablePaise),
    money(a.cgstPaise),
    money(a.sgstPaise),
    money(a.igstPaise),
    money(a.valuePaise),
    money(valid ? inv.discountPaise : 0),
    money(valid ? inv.shippingPaise : 0),
    text(inv.paymentMethod ?? ""),
    text(valid ? "Valid" : cancellationNote(inv.cancelledAt, inv.amounts.valuePaise)),
  ];
}

function invoicesSheet(r: SalesRegister): SheetData {
  const valid = r.invoices.filter((inv) => inv.status === "valid");
  const sum = (pick: (inv: RegisterInvoice) => number) => valid.reduce((s, inv) => s + pick(inv), 0);
  const t = r.totals.month;
  return [
    head(INVOICE_COLUMNS),
    ...r.invoices.map(invoiceRow),
    [
      { value: "Total", type: String, fontWeight: "bold" as const },
      null, null, null, null, null, null, null,
      money(t.taxablePaise), money(t.cgstPaise), money(t.sgstPaise), money(t.igstPaise), money(t.valuePaise),
      money(sum((inv) => inv.discountPaise)), money(sum((inv) => inv.shippingPaise)),
      null, null,
    ],
  ];
}

function b2csSheet(r: SalesRegister): SheetData {
  return orNone(
    head(["Type", "Place of supply", "Rate %", "Taxable value (this month)", "Less: cancelled earlier", "Net taxable value", "IGST", "CGST", "SGST", "Cess"]),
    r.b2cs.map((row) => [
      text("OE"), text(row.placeOfSupply), count(row.ratePercent), money(row.monthTaxablePaise), money(row.lessCancelledTaxablePaise),
      money(row.net.taxablePaise), money(row.net.igstPaise), money(row.net.cgstPaise), money(row.net.sgstPaise), money(0),
    ]),
  );
}

function b2clSheet(r: SalesRegister): SheetData {
  return orNone(
    head(["Invoice no.", "Invoice date", "Place of supply", "Invoice value", "Rate %", "Taxable value", "IGST", "Cess"]),
    r.b2cl.map((inv) => [
      text(inv.invoiceNumber), date(inv.invoiceDate), text(placeOfSupplyLabel(inv.placeOfSupply)), money(inv.amounts.valuePaise),
      count(inv.ratePercent), money(inv.amounts.taxablePaise), money(inv.amounts.igstPaise), money(0),
    ]),
  );
}

function hsnSheet(r: SalesRegister): SheetData {
  return orNone(
    head(["HSN", "Description", "UQC", "Total quantity", "Rate %", "Taxable value", "IGST", "CGST", "SGST", "Cess", "Total value"]),
    r.hsn.map((row) => [
      text(row.hsn), text(row.description), text(row.uqc), count(row.quantity), count(row.ratePercent), money(row.net.taxablePaise),
      money(row.net.igstPaise), money(row.net.cgstPaise), money(row.net.sgstPaise), money(0), money(row.net.valuePaise),
    ]),
  );
}

function documentsSheet(r: SalesRegister): SheetData {
  return orNone(
    head(["Nature of document", "Sr. no. from", "Sr. no. to", "Total number", "Cancelled", "Net issued"]),
    r.documents.map((run) => [
      text("Invoices for outward supply"), text(run.from), text(run.to), count(run.total), count(run.cancelled), count(run.total - run.cancelled),
    ]),
  );
}

function cancelledEarlierSheet(r: SalesRegister): SheetData {
  return orNone(
    head(["Invoice no.", "Invoice date", "Cancelled on", "Place of supply", "Rate %", "Taxable value", "CGST", "SGST", "IGST", "Invoice value"]),
    r.cancelledEarlier.map((inv) => [
      text(inv.invoiceNumber), date(inv.invoiceDate), inv.cancelledAt ? date(inv.cancelledAt) : null,
      text(placeOfSupplyLabel(inv.placeOfSupply)), count(inv.ratePercent), money(-inv.amounts.taxablePaise),
      money(-inv.amounts.cgstPaise), money(-inv.amounts.sgstPaise), money(-inv.amounts.igstPaise), money(-inv.amounts.valuePaise),
    ]),
  );
}

const WIDTHS: Record<(typeof SHEET_NAMES)[number], number[]> = {
  Summary: [48, 24],
  Invoices: [16, 12, 26, 8, 24, 18, 7, 7, 14, 12, 12, 12, 14, 12, 12, 14, 36],
  B2CS: [6, 22, 7, 22, 20, 16, 12, 12, 12, 8],
  B2CL: [16, 12, 22, 14, 7, 14, 12, 8],
  "HSN summary": [8, 52, 12, 14, 7, 14, 12, 12, 12, 8, 14],
  "Documents issued": [28, 16, 16, 12, 10, 10],
  "Cancelled earlier": [16, 12, 12, 22, 7, 14, 12, 12, 12, 14],
};

/** The register as a GSTR-1-ready .xlsx, one sheet per section, header row frozen. */
export async function registerXlsx(register: SalesRegister): Promise<Buffer> {
  const data: Record<(typeof SHEET_NAMES)[number], SheetData> = {
    Summary: summarySheet(register),
    Invoices: invoicesSheet(register),
    B2CS: b2csSheet(register),
    B2CL: b2clSheet(register),
    "HSN summary": hsnSheet(register),
    "Documents issued": documentsSheet(register),
    "Cancelled earlier": cancelledEarlierSheet(register),
  };
  return writeExcelFile(
    SHEET_NAMES.map((sheet) => ({
      sheet,
      data: data[sheet],
      columns: WIDTHS[sheet].map((width) => ({ width })),
      stickyRowsCount: 1,
    })),
  ).toBuffer();
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/gst/register-xlsx.test.ts`
Expected: PASS. If a TypeScript or runtime error says a cell's `type` is invalid, check `node_modules/write-excel-file/types/SheetData.d.ts`: `type` must be the constructor (`String`, `Number`, `Date`), not a string.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/gst/register-xlsx.ts lib/gst/register-xlsx.test.ts
git commit -m "feat(gst): GSTR-1-ready Excel writer (write-excel-file)"
```

---

### Task 6: Data access — reads for a month

**Files:**
- Create: `lib/gst/register-orders.ts`, `lib/gst/register-orders.test.ts`

**Interfaces:**
- Consumes: `PAID_ORDER_STATUSES`; `monthBounds` (Task 2); `buildSalesRegister`, `type RegisterOrderRow`, `type MissingNumberRow` (Task 4); `SalesRegister` (Task 3); `SupabaseClient` from `@supabase/supabase-js`.
- Produces: `REGISTER_COLUMNS: string`, `fetchMonthInvoices(admin, start: Date, end: Date): Promise<RegisterOrderRow[]>`, `fetchCancelledEarlier(admin, start, end): Promise<RegisterOrderRow[]>`, `fetchMissingNumbers(admin, start, end): Promise<MissingNumberRow[]>`, `loadSalesRegister(admin: SupabaseClient, input: { month: string; gstin: string; now: Date }): Promise<SalesRegister>`.

- [ ] **Step 1: Write the failing test**

Create `lib/gst/register-orders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GSTIN, NOW, orderRow } from "./__fixtures__/register";
import {
  fetchCancelledEarlier,
  fetchMissingNumbers,
  fetchMonthInvoices,
  loadSalesRegister,
  REGISTER_COLUMNS,
} from "./register-orders";
import { monthBounds } from "./register-month";

type Call = [string, unknown[]];
type Response = { data: unknown[] | null; error: { message: string } | null };

/** A Supabase stand-in: each from() is one query that records its calls and resolves to the next response. */
function fakeAdmin(responses: Response[]) {
  const queries: Call[][] = [];
  const admin = {
    from(table: string) {
      const calls: Call[] = [["from", [table]]];
      queries.push(calls);
      const response = responses.shift() ?? { data: [], error: null };
      const builder: object = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") return (resolve: (v: Response) => unknown) => resolve(response);
            return (...args: unknown[]) => {
              calls.push([String(prop), args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
  return { admin: admin as unknown as SupabaseClient, queries };
}

const { start, end } = monthBounds("2026-09");
const S = "2026-08-31T18:30:00.000Z";
const E = "2026-09-30T18:30:00.000Z";

describe("register reads", () => {
  it("never selects phone, email or user id", () => {
    expect(REGISTER_COLUMNS).not.toMatch(/phone|email|user_id/);
    expect(REGISTER_COLUMNS).toContain("invoice_voided_at");
  });

  it("reads invoices dated in the month", async () => {
    const { admin, queries } = fakeAdmin([{ data: [orderRow()], error: null }]);
    expect(await fetchMonthInvoices(admin, start, end)).toEqual([orderRow()]);
    expect(queries[0]).toEqual(expect.arrayContaining([
      ["from", ["orders"]],
      ["select", [REGISTER_COLUMNS]],
      ["not", ["invoice_number", "is", null]],
      ["gte", ["invoice_date", S]],
      ["lt", ["invoice_date", E]],
      ["range", [0, 999]],
    ]));
  });

  it("reads earlier invoices voided in the month", async () => {
    const { admin, queries } = fakeAdmin([{ data: [], error: null }]);
    await fetchCancelledEarlier(admin, start, end);
    expect(queries[0]).toEqual(expect.arrayContaining([
      ["not", ["invoice_number", "is", null]],
      ["lt", ["invoice_date", S]],
      ["gte", ["invoice_voided_at", S]],
      ["lt", ["invoice_voided_at", E]],
    ]));
  });

  it("finds paid orders of the month with no invoice number", async () => {
    const { admin, queries } = fakeAdmin([{ data: [{ order_number: "ORD-A" }], error: null }]);
    expect(await fetchMissingNumbers(admin, start, end)).toEqual([{ order_number: "ORD-A" }]);
    expect(queries[0]).toEqual(expect.arrayContaining([
      ["select", ["order_number"]],
      ["is", ["invoice_number", null]],
      ["in", ["status", ["payment_confirmed", "processing", "ready_for_pickup", "collected", "shipped", "delivered"]]],
      ["or", [`and(stock_committed_at.gte.${S},stock_committed_at.lt.${E}),and(stock_committed_at.is.null,created_at.gte.${S},created_at.lt.${E})`]],
    ]));
  });

  it("reads past PostgREST's 1,000-row page", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => orderRow({ id: `o${i}` }));
    const { admin, queries } = fakeAdmin([{ data: page, error: null }, { data: [orderRow({ id: "last" })], error: null }]);
    expect(await fetchMonthInvoices(admin, start, end)).toHaveLength(1001);
    expect(queries[1]).toContainEqual(["range", [1000, 1999]]);
  });

  it("throws the database error", async () => {
    const { admin } = fakeAdmin([{ data: null, error: { message: "boom" } }]);
    await expect(fetchMonthInvoices(admin, start, end)).rejects.toThrow("boom");
  });

  it("loads the three reads into one register", async () => {
    const { admin } = fakeAdmin([
      { data: [orderRow()], error: null },
      { data: [], error: null },
      { data: [{ order_number: "ORD-A" }], error: null },
    ]);
    const r = await loadSalesRegister(admin, { month: "2026-09", gstin: GSTIN, now: NOW });
    expect(r.invoices.map((i) => i.invoiceNumber)).toEqual(["CB/26-27/0001"]);
    expect(r.warnings).toEqual(["Paid orders with no invoice number: ORD-A"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/gst/register-orders.test.ts`
Expected: FAIL — `./register-orders` cannot be resolved.

- [ ] **Step 3: Implement `lib/gst/register-orders.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAID_ORDER_STATUSES } from "@/lib/admin/sales-metrics";
import { monthBounds } from "./register-month";
import { buildSalesRegister, type MissingNumberRow, type RegisterOrderRow } from "./sales-register";
import type { SalesRegister } from "./register-types";

/** Every column the register needs. Customer phone and email are deliberately absent. */
export const REGISTER_COLUMNS =
  "id, order_number, created_at, status, fulfilment_method, customer_name, shipping_address, place_of_supply, " +
  "invoice_number, invoice_date, invoice_voided_at, subtotal, discount_amount, delivery_charge, total_amount, " +
  "order_items(name, size, color, price, quantity), payments(payment_method, status)";

const PAGE = 1000;

type PageResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Reads every page: PostgREST caps one response at 1,000 rows. */
async function readAll<T>(page: (from: number, to: number) => PageResult): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await page(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

/** Invoices dated in [start, end). Service-role client; callers gate on requireAdmin() first. */
export function fetchMonthInvoices(admin: SupabaseClient, start: Date, end: Date): Promise<RegisterOrderRow[]> {
  return readAll<RegisterOrderRow>((from, to) =>
    admin
      .from("orders")
      .select(REGISTER_COLUMNS)
      .not("invoice_number", "is", null)
      .gte("invoice_date", start.toISOString())
      .lt("invoice_date", end.toISOString())
      .order("invoice_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/** Invoices dated before start and voided in [start, end). */
export function fetchCancelledEarlier(admin: SupabaseClient, start: Date, end: Date): Promise<RegisterOrderRow[]> {
  return readAll<RegisterOrderRow>((from, to) =>
    admin
      .from("orders")
      .select(REGISTER_COLUMNS)
      .not("invoice_number", "is", null)
      .lt("invoice_date", start.toISOString())
      .gte("invoice_voided_at", start.toISOString())
      .lt("invoice_voided_at", end.toISOString())
      .order("invoice_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/** Paid orders whose sale date (stock_committed_at, else created_at) is in [start, end) but that have no invoice number. */
export function fetchMissingNumbers(admin: SupabaseClient, start: Date, end: Date): Promise<MissingNumberRow[]> {
  const s = start.toISOString();
  const e = end.toISOString();
  return readAll<MissingNumberRow>((from, to) =>
    admin
      .from("orders")
      .select("order_number")
      .is("invoice_number", null)
      .in("status", [...PAID_ORDER_STATUSES])
      .or(`and(stock_committed_at.gte.${s},stock_committed_at.lt.${e}),and(stock_committed_at.is.null,created_at.gte.${s},created_at.lt.${e})`)
      .order("created_at", { ascending: true })
      .range(from, to),
  );
}

/** The month's register, read live. */
export async function loadSalesRegister(
  admin: SupabaseClient,
  { month, gstin, now }: { month: string; gstin: string; now: Date },
): Promise<SalesRegister> {
  const { start, end } = monthBounds(month);
  const [orders, cancelledEarlier, missingNumbers] = await Promise.all([
    fetchMonthInvoices(admin, start, end),
    fetchCancelledEarlier(admin, start, end),
    fetchMissingNumbers(admin, start, end),
  ]);
  return buildSalesRegister({ month, orders, cancelledEarlier, missingNumbers, gstin, now });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/gst/register-orders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/gst/register-orders.ts lib/gst/register-orders.test.ts
git commit -m "feat(gst): live reads for a month's register (invoices, earlier cancellations, missing numbers)"
```

---

### Task 7: API routes — JSON preview and Excel download

**Files:**
- Create: `lib/gst/register-route.ts`
- Create: `app/api/admin/sales-register/route.ts`, `app/api/admin/sales-register/route.test.ts`
- Create: `app/api/admin/sales-register/download/route.ts`, `app/api/admin/sales-register/download/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (`lib/services/admin-gate.ts`); `createAdminSupabaseClient` (`lib/supabase-server`); `getBusinessGstin` (`lib/config/gstin.ts`); `parseRegisterMonth`, `currentIstMonth` (Task 2); `registerFileName` (Task 2); `loadSalesRegister` (Task 6); `registerXlsx`, `XLSX_CONTENT_TYPE` (Task 5); fixture `salesRegisterFixture` (Task 4).
- Produces: `NO_STORE`, `readRegisterRequest(request: NextRequest, now: Date): { ok: true; month: string; gstin: string; now: Date } | { ok: false; response: NextResponse }`; `GET /api/admin/sales-register?month=YYYY-MM` → `{ register: SalesRegister }`; `GET /api/admin/sales-register/download?month=YYYY-MM` → `.xlsx` attachment; errors `{ error: string }`.

- [ ] **Step 1: Write the failing tests**

Create `app/api/admin/sales-register/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { salesRegisterFixture } from "@/lib/gst/__fixtures__/register";

const h = vi.hoisted(() => ({ user: null as unknown, loadSalesRegister: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({ tag: "admin-client" })),
}));
vi.mock("@/lib/gst/register-orders", () => ({ loadSalesRegister: h.loadSalesRegister }));

import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET } from "./route";

const NOW = new Date("2026-10-03T04:30:00.000Z");
const req = (query = "?month=2026-09") => new NextRequest(`http://localhost/api/admin/sales-register${query}`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("BUSINESS_GSTIN", "29EPDPR9174E1ZB");
  h.user = { id: "a", app_metadata: { role: "admin" } };
  h.loadSalesRegister.mockReset().mockResolvedValue(salesRegisterFixture());
  vi.mocked(createAdminSupabaseClient).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("GET /api/admin/sales-register", () => {
  it("401s a guest and 403s a customer before any service-role call", async () => {
    h.user = null;
    expect((await GET(req())).status).toBe(401);
    h.user = { id: "c", app_metadata: { role: "customer" } };
    expect((await GET(req())).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(h.loadSalesRegister).not.toHaveBeenCalled();
  });

  it.each(["", "?month=2026-08", "?month=2026-11", "?month=2026-13", "?month=26-09"])("400s a month with no register (%s)", async (query) => {
    const res = await GET(req(query));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Pick a month from 2026-09 to 2026-10 (YYYY-MM)" });
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("500s with a clear message when the GSTIN is not configured", async () => {
    vi.stubEnv("BUSINESS_GSTIN", "");
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "The GSTIN is not configured, so no register can be made" });
    expect(h.loadSalesRegister).not.toHaveBeenCalled();
  });

  it("returns the month's register, never stored by the browser", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await res.json()).register.totals.issued).toBe(3);
    expect(h.loadSalesRegister).toHaveBeenCalledWith({ tag: "admin-client" }, expect.objectContaining({ month: "2026-09", gstin: "29EPDPR9174E1ZB", now: NOW }));
  });

  it("500s with a generic message when the read fails", async () => {
    h.loadSalesRegister.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't load the sales register" });
  });
});
```

Create `app/api/admin/sales-register/download/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import readExcelFile from "read-excel-file/node";
import { GSTIN, salesRegisterFixture } from "@/lib/gst/__fixtures__/register";
import { buildSalesRegister } from "@/lib/gst/sales-register";

const h = vi.hoisted(() => ({ user: null as unknown, loadSalesRegister: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  })),
  createAdminSupabaseClient: vi.fn(() => ({ tag: "admin-client" })),
}));
vi.mock("@/lib/gst/register-orders", () => ({ loadSalesRegister: h.loadSalesRegister }));

import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET } from "./route";

const NOW = new Date("2026-10-03T04:30:00.000Z");
const req = (month: string) => new NextRequest(`http://localhost/api/admin/sales-register/download?month=${month}`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("BUSINESS_GSTIN", GSTIN);
  h.user = { id: "a", app_metadata: { role: "admin" } };
  h.loadSalesRegister.mockReset().mockResolvedValue(salesRegisterFixture());
  vi.mocked(createAdminSupabaseClient).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("GET /api/admin/sales-register/download", () => {
  it("403s a customer before any service-role call", async () => {
    h.user = { id: "c", app_metadata: { role: "customer" } };
    expect((await GET(req("2026-09"))).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("400s a month with no register", async () => {
    expect((await GET(req("2026-08"))).status).toBe(400);
  });

  it("sends the Excel file as a private, unindexed attachment", async () => {
    const res = await GET(req("2026-09"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="cozyberries-sales-register-2026-09.xlsx"');
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    const sheets = await readExcelFile(Buffer.from(await res.arrayBuffer()));
    expect(sheets.map((s) => s.sheet)).toEqual(["Summary", "Invoices", "B2CS", "B2CL", "HSN summary", "Documents issued", "Cancelled earlier"]);
  });

  it("names an unfinished month's file up to today", async () => {
    h.loadSalesRegister.mockResolvedValueOnce(
      buildSalesRegister({ month: "2026-10", orders: [], cancelledEarlier: [], missingNumbers: [], gstin: GSTIN, now: NOW }),
    );
    const res = await GET(req("2026-10"));
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="cozyberries-sales-register-2026-10-upto-03.xlsx"');
  });

  it("500s with a generic message when the read fails", async () => {
    h.loadSalesRegister.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(req("2026-09"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't download the register" });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run app/api/admin/sales-register`
Expected: FAIL — `./route` cannot be resolved.

- [ ] **Step 3: Implement**

Create `lib/gst/register-route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { GST_REGISTERED_FROM } from "@/lib/config/business";
import { getBusinessGstin } from "@/lib/config/gstin";
import { currentIstMonth, parseRegisterMonth } from "./register-month";

export const NO_STORE = { "Cache-Control": "private, no-store" };

export type RegisterRequest =
  | { ok: true; month: string; gstin: string; now: Date }
  | { ok: false; response: NextResponse };

/** The month and GSTIN for a register route. Call only after requireAdmin() has passed. */
export function readRegisterRequest(request: NextRequest, now: Date): RegisterRequest {
  const month = parseRegisterMonth(request.nextUrl.searchParams.get("month"), now);
  if (!month) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Pick a month from ${GST_REGISTERED_FROM} to ${currentIstMonth(now)} (YYYY-MM)` },
        { status: 400, headers: NO_STORE },
      ),
    };
  }
  try {
    return { ok: true, month, gstin: getBusinessGstin(), now };
  } catch (e) {
    console.error("[sales-register] BUSINESS_GSTIN misconfigured:", e instanceof Error ? e.message : e);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "The GSTIN is not configured, so no register can be made" },
        { status: 500, headers: NO_STORE },
      ),
    };
  }
}
```

Create `app/api/admin/sales-register/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { loadSalesRegister } from "@/lib/gst/register-orders";
import { NO_STORE, readRegisterRequest } from "@/lib/gst/register-route";

export const dynamic = "force-dynamic";

/** One month's GST sales register as JSON, for the /admin/sales-register preview. Live read, no cache. */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const req = readRegisterRequest(request, new Date());
  if (!req.ok) return req.response;

  try {
    const register = await loadSalesRegister(createAdminSupabaseClient(), req);
    return NextResponse.json({ register }, { headers: NO_STORE });
  } catch (e) {
    console.error("[sales-register]", e);
    return NextResponse.json({ error: "Couldn't load the sales register" }, { status: 500, headers: NO_STORE });
  }
}
```

Create `app/api/admin/sales-register/download/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { registerFileName } from "@/lib/gst/register-format";
import { loadSalesRegister } from "@/lib/gst/register-orders";
import { NO_STORE, readRegisterRequest } from "@/lib/gst/register-route";
import { registerXlsx, XLSX_CONTENT_TYPE } from "@/lib/gst/register-xlsx";

export const dynamic = "force-dynamic";

/** One month's GST sales register as a GSTR-1-ready .xlsx attachment. Built fresh per request. */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const req = readRegisterRequest(request, new Date());
  if (!req.ok) return req.response;

  try {
    const register = await loadSalesRegister(createAdminSupabaseClient(), req);
    const file = await registerXlsx(register);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${registerFileName(register.month, register.period)}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    console.error("[sales-register] download", e);
    return NextResponse.json({ error: "Couldn't download the register" }, { status: 500, headers: NO_STORE });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/api/admin/sales-register`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/gst/register-route.ts app/api/admin/sales-register
git commit -m "feat(admin): GET /api/admin/sales-register and its .xlsx download, admin-gated"
```

---

### Task 8: Download button

**Files:**
- Create: `components/admin/gst/RegisterDownloadButton.tsx`, `components/admin/gst/RegisterDownloadButton.test.tsx`

**Interfaces:**
- Consumes: `Button` (`components/ui/button`), `toast` (`sonner`), `Download`, `Loader2` (`lucide-react`).
- Produces: `attachmentName(header: string | null): string | null`; `RegisterDownloadButton({ month, unfinished }: { month: string; unfinished: boolean })`.

- [ ] **Step 1: Write the failing test**

Create `components/admin/gst/RegisterDownloadButton.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";
import { attachmentName, RegisterDownloadButton } from "./RegisterDownloadButton";

const clicked: string[] = [];

beforeEach(() => {
  clicked.length = 0;
  URL.createObjectURL = vi.fn(() => "blob:register");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this.download);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const fileResponse = () =>
  new Response(new Uint8Array([80, 75, 3, 4]), {
    headers: { "Content-Disposition": 'attachment; filename="cozyberries-sales-register-2026-09.xlsx"' },
  });

describe("attachmentName", () => {
  it("reads the filename from Content-Disposition", () => {
    expect(attachmentName('attachment; filename="a.xlsx"')).toBe("a.xlsx");
    expect(attachmentName(null)).toBeNull();
    expect(attachmentName("attachment")).toBeNull();
  });
});

describe("RegisterDownloadButton", () => {
  it("fetches the month's file and saves it under the server's name", async () => {
    // shouldAdvanceTime keeps waitFor's polling working while the 60 s revoke timer stays under test control.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    const f = vi.fn(async () => fileResponse());
    vi.stubGlobal("fetch", f);
    render(<RegisterDownloadButton month="2026-09" unfinished={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Download Excel" }));
    await waitFor(() => expect(clicked).toEqual(["cozyberries-sales-register-2026-09.xlsx"]));
    expect(f).toHaveBeenCalledWith("/api/admin/sales-register/download?month=2026-09", expect.objectContaining({ cache: "no-store" }));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:register");
  });

  it("disables itself with a spinner while the file is being made", async () => {
    let release: (r: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => (release = resolve))));
    render(<RegisterDownloadButton month="2026-09" unfinished={false} />);
    const button = screen.getByRole("button", { name: "Download Excel" });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(button.querySelector(".animate-spin")).not.toBeNull();
    await act(async () => release(fileResponse()));
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("shows the server's error in a toast and saves nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Couldn't download the register" }), { status: 500 })));
    render(<RegisterDownloadButton month="2026-09" unfinished={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Download Excel" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't download the register"));
    expect(clicked).toEqual([]);
  });

  it("says the month is not finished", () => {
    const { rerender } = render(<RegisterDownloadButton month="2026-10" unfinished />);
    expect(screen.getByText("Month not finished")).toBeInTheDocument();
    rerender(<RegisterDownloadButton month="2026-09" unfinished={false} />);
    expect(screen.queryByText("Month not finished")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run components/admin/gst/RegisterDownloadButton.test.tsx`
Expected: FAIL — `./RegisterDownloadButton` cannot be resolved.

- [ ] **Step 3: Implement `components/admin/gst/RegisterDownloadButton.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** The filename from a Content-Disposition header, if the server sent one. */
export function attachmentName(header: string | null): string | null {
  const match = header ? /filename="([^"]+)"/.exec(header) : null;
  return match ? match[1] : null;
}

/** Fetches the month's .xlsx and saves it; a failure shows a toast and leaves the page as it is. */
export function RegisterDownloadButton({ month, unfinished }: { month: string; unfinished: boolean }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sales-register/download?month=${month}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Couldn't download the register");
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = attachmentName(res.headers.get("Content-Disposition")) ?? `cozyberries-sales-register-${month}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking at once can cancel the save in Safari; a minute is plenty for the browser to take the file.
      // Global setTimeout (not window.setTimeout) so vitest's fake timers control it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't download the register");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" className="rounded-full" onClick={download} disabled={busy} aria-label="Download Excel">
        {busy ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Download className="mr-1.5 h-4 w-4" aria-hidden />
        )}
        Excel
      </Button>
      {unfinished && <p className="text-xs text-cb-muted-fg">Month not finished</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/admin/gst/RegisterDownloadButton.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/gst/RegisterDownloadButton.tsx components/admin/gst/RegisterDownloadButton.test.tsx
git commit -m "feat(admin): sales register download button (fetch + save, spinner, toast)"
```

---

### Task 9: The page, its table component and the nav tab

**Files:**
- Modify: `components/admin/nav.ts:14-22` (add the tab after Stock)
- Modify: `components/admin/nav.test.ts` (labels list; new case)
- Create: `components/admin/gst/RegisterTable.tsx`
- Create: `app/admin/sales-register/page.tsx`
- Create: `app/admin/sales-register/sales-register-client.tsx`, `app/admin/sales-register/sales-register-client.test.tsx`

**Interfaces:**
- Consumes: kit (`EmptyState`, `ErrorBanner`, `FilterChips`, `type FilterChip`, `ListCard`, `LoadingList`, `PageHeader`, `StatGrid`, `StatTile` from `@/components/admin/kit`); `SegmentBar`; `ChartTable`, `type ChartColumn`; `CHART_COLORS`; Task 2 `availableMonths`, `defaultRegisterMonth`, `isUnfinishedMonth`, `monthLabel`, `parseRegisterMonth`, `cancellationNote`, `formatIstDate`, `formatPaise`; Task 3 `taxOf`, types; Task 8 `RegisterDownloadButton`; fixture `salesRegisterFixture`.
- Produces: `RegisterTable({ title, columns, rows })`; default export `SalesRegisterClient`; `monthFromLocation(now: Date): string`; route `/admin/sales-register`; `ADMIN_TABS` entry `{ href: "/admin/sales-register", label: "Sales register" }`.

- [ ] **Step 1: Write the failing tests**

In `components/admin/nav.test.ts`, replace the first case's label list and add a case:

```ts
  it("lists tabs in order with the bottom-bar five flagged", () => {
    expect(ADMIN_TABS.map((t) => t.label)).toEqual([
      "Dashboard", "Orders", "Pickups", "Refills", "Stock", "Sales register", "On-behalf", "Impersonate", "Admins",
    ]);
    expect(ADMIN_TABS.filter((t) => t.bottom).map((t) => t.label)).toEqual([
      "Dashboard", "Orders", "Pickups", "Refills", "Stock",
    ]);
  });
  it("shows Sales register to admins in the sidebar only", () => {
    const tab = ADMIN_TABS.find((t) => t.href === "/admin/sales-register");
    expect(tab).toMatchObject({ label: "Sales register" });
    expect(tab?.bottom).toBeFalsy();
    expect(tabsForRole("admin").some((t) => t.href === "/admin/sales-register")).toBe(true);
  });
```

Create `app/admin/sales-register/sales-register-client.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import SalesRegisterClient from "./sales-register-client";
import { GSTIN, NOW, salesRegisterFixture } from "@/lib/gst/__fixtures__/register";
import { buildSalesRegister } from "@/lib/gst/sales-register";
import type { SalesRegister } from "@/lib/gst/register-types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function stubRegister(respond: (url: string) => Response = () => json({ register: salesRegisterFixture() })) {
  const f = vi.fn(async (url: string) => respond(url));
  vi.stubGlobal("fetch", f);
  return f;
}

function renderPage(qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={qc}>
      <SalesRegisterClient />
    </QueryClientProvider>,
  );
}

const tile = (label: string) => screen.getByText(label).parentElement!;
const empty = (month: string): SalesRegister =>
  buildSalesRegister({ month, orders: [], cancelledEarlier: [], missingNumbers: [], gstin: GSTIN, now: NOW });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  window.history.replaceState(null, "", "/admin/sales-register");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SalesRegisterClient", () => {
  it("opens on the last completed month and lists every month since registration", async () => {
    const f = stubRegister();
    renderPage();
    expect(await screen.findByText("01-09-2026 to 30-09-2026")).toBeInTheDocument();
    expect(f).toHaveBeenCalledWith("/api/admin/sales-register?month=2026-09", expect.objectContaining({ cache: "no-store" }));
    const chips = within(screen.getByRole("radiogroup", { name: "Month" })).getAllByRole("radio");
    expect(chips.map((c) => c.textContent)).toEqual(["Oct 2026 · so far", "Sep 2026"]);
    expect(chips[1]).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Download Excel" })).toBeInTheDocument();
    expect(screen.queryByText("Month not finished")).toBeNull();
  });

  it("shows the net totals, the tax split and the invoice counts", async () => {
    stubRegister();
    renderPage();
    await screen.findByText("01-09-2026 to 30-09-2026");
    expect(tile("Invoice value")).toHaveTextContent("₹2,190.00");
    expect(within(tile("Net invoices")).getByText("2")).toBeInTheDocument();
    expect(tile("Net invoices")).toHaveTextContent("3 issued · 1 cancelled");
    expect(tile("Taxable value")).toHaveTextContent("₹2,085.71");
    expect(tile("Total tax")).toHaveTextContent("₹104.29");
    expect(tile("Total tax")).toHaveTextContent("CGST ₹52.14 · SGST ₹52.15 · IGST ₹0.00");
    const split = screen.getByRole("region", { name: "Stall vs Online" });
    expect(split).toHaveTextContent("Stall ₹1,050.00 · 48%");
    expect(split).toHaveTextContent("Online ₹1,140.00 · 52%");
  });

  it("shows B2CS, HSN and the invoice numbers used", async () => {
    stubRegister();
    renderPage();
    const b2cs = await screen.findByRole("region", { name: "By place of supply (B2CS)" });
    expect(within(b2cs).getAllByRole("row")[1]).toHaveTextContent("29-Karnataka5%₹2,085.71₹52.14₹52.15₹0.00");
    expect(within(screen.getByRole("region", { name: "HSN summary" })).getAllByRole("row")[1]).toHaveTextContent("61112₹2,085.71₹104.29₹2,190.00");
    expect(within(screen.getByRole("region", { name: "Invoice numbers used" })).getAllByRole("row")[1]).toHaveTextContent("CB/26-27/0001CB/26-27/000331");
    expect(screen.queryByRole("region", { name: "Inter-state over ₹1,00,000 (B2CL)" })).toBeNull();
  });

  it("lists invoices, greying a cancelled one with its note", async () => {
    stubRegister();
    renderPage();
    const list = await screen.findByRole("region", { name: "Invoices" });
    const rows = within(list).getAllByTestId("register-invoice");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("CB/26-27/0001");
    expect(rows[0]).toHaveTextContent("25-09-2026 · Asha Rao · Stall");
    expect(rows[0]).toHaveTextContent("₹1,050.00 · tax ₹50.00");
    expect(rows[2]).toHaveTextContent("Cancelled 28-09-2026 (was ₹1,050.00)");
    expect(rows[2].className).toMatch(/opacity-60/);
    expect(screen.queryByRole("region", { name: "Cancelled from earlier months" })).toBeNull();
  });

  it("lists earlier months' cancellations when there are any", async () => {
    const register = buildSalesRegister({
      month: "2026-09",
      orders: [],
      cancelledEarlier: [],
      missingNumbers: [],
      gstin: GSTIN,
      now: NOW,
    });
    register.cancelledEarlier = salesRegisterFixture().invoices.slice(2);
    stubRegister(() => json({ register }));
    renderPage();
    const earlier = await screen.findByRole("region", { name: "Cancelled from earlier months" });
    expect(earlier).toHaveTextContent("Cancelled 28-09-2026 · less ₹1,050.00");
  });

  it("puts one block per row at every width", async () => {
    stubRegister();
    renderPage();
    const list = await screen.findByRole("region", { name: "Invoices" });
    expect(list.parentElement!.className).not.toMatch(/\b\w+:grid-cols-/);
  });

  it("reads ?month= and marks an unfinished month", async () => {
    window.history.replaceState(null, "", "/admin/sales-register?month=2026-10");
    const f = stubRegister(() => json({ register: empty("2026-10") }));
    renderPage();
    expect(await screen.findByText("No invoices in Oct 2026")).toBeInTheDocument();
    expect(screen.getByText("The download still gives a nil register to file.")).toBeInTheDocument();
    expect(f).toHaveBeenCalledWith("/api/admin/sales-register?month=2026-10", expect.anything());
    expect(screen.getByText("Month not finished")).toBeInTheDocument();
  });

  it.each(["2026-08", "2026-13", "2026-11"])("falls back to the default month for a month with no register (%s)", async (month) => {
    window.history.replaceState(null, "", `/admin/sales-register?month=${month}`);
    const f = stubRegister();
    renderPage();
    await screen.findByText("01-09-2026 to 30-09-2026");
    expect(f).toHaveBeenCalledWith("/api/admin/sales-register?month=2026-09", expect.anything());
  });

  it("switches month from a chip and keeps it in the URL", async () => {
    const f = stubRegister((url) => json({ register: url.endsWith("2026-10") ? empty("2026-10") : salesRegisterFixture() }));
    renderPage();
    await screen.findByText("01-09-2026 to 30-09-2026");
    fireEvent.click(screen.getByRole("radio", { name: "Oct 2026 · so far" }));
    expect(await screen.findByText("No invoices in Oct 2026")).toBeInTheDocument();
    expect(f).toHaveBeenLastCalledWith("/api/admin/sales-register?month=2026-10", expect.anything());
    expect(window.location.search).toBe("?month=2026-10");
  });

  it("shows the warnings before anything else", async () => {
    const register = salesRegisterFixture();
    register.warnings = ["Paid orders with no invoice number: ORD-A"];
    stubRegister(() => json({ register }));
    renderPage();
    const warnings = await screen.findByRole("region", { name: "Warnings" });
    expect(warnings).toHaveTextContent("Check before sending");
    expect(warnings).toHaveTextContent("Paid orders with no invoice number: ORD-A");
  });

  it("shows the error banner with Retry when loading fails", async () => {
    stubRegister(() => json({ error: "Couldn't load the sales register" }, 500));
    renderPage();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the sales register"));
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("keeps the last register on screen when a refresh fails", async () => {
    let calls = 0;
    stubRegister(() => (calls++ === 0 ? json({ register: salesRegisterFixture() }) : json({ error: "Couldn't load the sales register" }, 500)));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderPage(qc);
    await screen.findByText("01-09-2026 to 30-09-2026");
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["admin", "sales-register", "2026-09"] });
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the sales register");
    expect(tile("Invoice value")).toHaveTextContent("₹2,190.00");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run components/admin/nav.test.ts app/admin/sales-register`
Expected: FAIL — nav labels differ; `./sales-register-client` cannot be resolved.

- [ ] **Step 3: Implement**

In `components/admin/nav.ts`, add after the Stock entry:

```ts
  { href: "/admin/sales-register", label: "Sales register" },
```

Create `components/admin/gst/RegisterTable.tsx`:

```tsx
"use client";

import { useId } from "react";
import { ChartTable, type ChartColumn } from "@/components/admin/charts/ChartTable";

/** A titled card holding one small table of already-formatted values. */
export function RegisterTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: ChartColumn[];
  rows: Array<Record<string, string>>;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="min-w-0 rounded-2xl border border-cb-border bg-cb-white p-4">
      <h3 id={headingId} className="text-sm font-semibold text-cb-fg">
        {title}
      </h3>
      <div className="mt-2">
        {rows.length ? (
          <ChartTable caption={title} columns={columns} rows={rows} />
        ) : (
          <p className="text-sm text-cb-muted-fg">None this month</p>
        )}
      </div>
    </section>
  );
}
```

Create `app/admin/sales-register/page.tsx`:

```tsx
import type { Metadata } from "next";
import SalesRegisterClient from "./sales-register-client";

export const metadata: Metadata = { title: "Sales register — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminSalesRegisterPage() {
  return <SalesRegisterClient />;
}
```

Create `app/admin/sales-register/sales-register-client.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import {
  EmptyState,
  ErrorBanner,
  FilterChips,
  ListCard,
  LoadingList,
  PageHeader,
  StatGrid,
  StatTile,
  type FilterChip,
} from "@/components/admin/kit";
import { SegmentBar } from "@/components/admin/charts/SegmentBar";
import { CHART_COLORS } from "@/components/admin/charts/chart-colors";
import { RegisterDownloadButton } from "@/components/admin/gst/RegisterDownloadButton";
import { RegisterTable } from "@/components/admin/gst/RegisterTable";
import { cancellationNote, formatIstDate, formatPaise } from "@/lib/gst/register-format";
import { availableMonths, defaultRegisterMonth, isUnfinishedMonth, monthLabel, parseRegisterMonth } from "@/lib/gst/register-month";
import { taxOf } from "@/lib/gst/register-summaries";
import type { RegisterInvoice, SalesRegister } from "@/lib/gst/register-types";

/** Seeds from ?month= so a refresh or a shared link keeps the month. Read in an effect: no useSearchParams. */
export function monthFromLocation(now: Date): string {
  if (typeof window === "undefined") return defaultRegisterMonth(now);
  return parseRegisterMonth(new URLSearchParams(window.location.search).get("month"), now) ?? defaultRegisterMonth(now);
}

function writeMonthToLocation(month: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("month", month);
  window.history.replaceState(window.history.state, "", url);
}

async function fetchRegister(month: string): Promise<SalesRegister> {
  const res = await fetch(`/api/admin/sales-register?month=${month}`, { credentials: "same-origin", cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || "Couldn't load the sales register"), { status: res.status });
  return body.register as SalesRegister;
}

export default function SalesRegisterClient() {
  const [now] = useState(() => new Date());
  const [month, setMonth] = useState<string | null>(null);

  useEffect(() => {
    setMonth(monthFromLocation(now));
  }, [now]);

  const query = useQuery({
    queryKey: ["admin", "sales-register", month],
    queryFn: () => fetchRegister(month as string),
    enabled: month !== null,
    staleTime: 30_000,
  });
  const register = query.data;
  const status = (query.error as { status?: number } | null)?.status;
  const chips: FilterChip<string>[] = availableMonths(now).map((m) => ({
    value: m,
    label: isUnfinishedMonth(m, now) ? `${monthLabel(m)} · so far` : monthLabel(m),
  }));

  const select = (next: string) => {
    setMonth(next);
    writeMonthToLocation(next);
  };

  return (
    <div>
      <PageHeader
        title="Sales register"
        subtitle={register ? `${register.period.from} to ${register.period.to}` : undefined}
        action={month ? <RegisterDownloadButton month={month} unfinished={isUnfinishedMonth(month, now)} /> : undefined}
      />
      {month && (
        <div className="mb-4">
          <FilterChips label="Month" chips={chips} value={month} onChange={select} />
        </div>
      )}
      {query.isError && (
        <ErrorBanner
          message={(query.error as Error).message}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          loginRedirect={status === 401 || status === 403 ? "/admin/sales-register" : undefined}
        />
      )}
      {register ? (
        <RegisterBody register={register} />
      ) : (
        !query.isError && <LoadingList rows={3} label="Loading the sales register" />
      )}
    </div>
  );
}

function RegisterBody({ register: r }: { register: SalesRegister }) {
  const t = r.totals;
  const empty = r.invoices.length === 0 && r.cancelledEarlier.length === 0;
  return (
    <div className="grid grid-cols-1 gap-3">
      {r.warnings.length > 0 && <Warnings warnings={r.warnings} />}
      {empty ? (
        <EmptyState title={`No invoices in ${monthLabel(r.month)}`} hint="The download still gives a nil register to file." />
      ) : (
        <>
          <StatGrid>
            <StatTile
              label="Invoice value"
              value={formatPaise(t.net.valuePaise)}
              hint={
                t.cancelledEarlier.valuePaise > 0
                  ? `after ${formatPaise(t.cancelledEarlier.valuePaise)} of earlier cancellations`
                  : "net for the month"
              }
            />
            <StatTile label="Net invoices" value={String(t.issued - t.cancelled)} hint={`${t.issued} issued · ${t.cancelled} cancelled`} />
            <StatTile label="Taxable value" value={formatPaise(t.net.taxablePaise)} />
            <StatTile
              label="Total tax"
              value={formatPaise(taxOf(t.net))}
              hint={`CGST ${formatPaise(t.net.cgstPaise)} · SGST ${formatPaise(t.net.sgstPaise)} · IGST ${formatPaise(t.net.igstPaise)}`}
            />
          </StatGrid>
          <SegmentBar
            label="Stall vs Online"
            parts={[
              { key: "stall", label: "Stall", value: t.byChannel.stall.valuePaise, color: CHART_COLORS.stall, valueLabel: formatPaise(t.byChannel.stall.valuePaise) },
              { key: "online", label: "Online", value: t.byChannel.online.valuePaise, color: CHART_COLORS.online, valueLabel: formatPaise(t.byChannel.online.valuePaise) },
            ]}
          />
          <RegisterTable
            title="By place of supply (B2CS)"
            columns={[
              { key: "pos", label: "Place of supply" },
              { key: "rate", label: "Rate", numeric: true },
              { key: "taxable", label: "Taxable", numeric: true },
              { key: "cgst", label: "CGST", numeric: true },
              { key: "sgst", label: "SGST", numeric: true },
              { key: "igst", label: "IGST", numeric: true },
            ]}
            rows={r.b2cs.map((row) => ({
              pos: row.placeOfSupply,
              rate: `${row.ratePercent}%`,
              taxable: formatPaise(row.net.taxablePaise),
              cgst: formatPaise(row.net.cgstPaise),
              sgst: formatPaise(row.net.sgstPaise),
              igst: formatPaise(row.net.igstPaise),
            }))}
          />
          {r.b2cl.length > 0 && (
            <RegisterTable
              title="Inter-state over ₹1,00,000 (B2CL)"
              columns={[
                { key: "number", label: "Invoice" },
                { key: "pos", label: "Place of supply" },
                { key: "value", label: "Value", numeric: true },
                { key: "igst", label: "IGST", numeric: true },
              ]}
              rows={r.b2cl.map((inv) => ({
                number: inv.invoiceNumber,
                pos: inv.placeOfSupply.code ? `${inv.placeOfSupply.code}-${inv.placeOfSupply.name}` : "—",
                value: formatPaise(inv.amounts.valuePaise),
                igst: formatPaise(inv.amounts.igstPaise),
              }))}
            />
          )}
          <RegisterTable
            title="HSN summary"
            columns={[
              { key: "hsn", label: "HSN" },
              { key: "qty", label: "Qty", numeric: true },
              { key: "taxable", label: "Taxable", numeric: true },
              { key: "tax", label: "Tax", numeric: true },
              { key: "value", label: "Value", numeric: true },
            ]}
            rows={r.hsn.map((row) => ({
              hsn: row.hsn,
              qty: String(row.quantity),
              taxable: formatPaise(row.net.taxablePaise),
              tax: formatPaise(taxOf(row.net)),
              value: formatPaise(row.net.valuePaise),
            }))}
          />
          <RegisterTable
            title="Invoice numbers used"
            columns={[
              { key: "from", label: "From" },
              { key: "to", label: "To" },
              { key: "total", label: "Issued", numeric: true },
              { key: "cancelled", label: "Cancelled", numeric: true },
            ]}
            rows={r.documents.map((run) => ({ from: run.from, to: run.to, total: String(run.total), cancelled: String(run.cancelled) }))}
          />
          <InvoiceList title="Invoices" invoices={r.invoices} />
          {r.cancelledEarlier.length > 0 && <InvoiceList title="Cancelled from earlier months" invoices={r.cancelledEarlier} earlier />}
        </>
      )}
    </div>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  return (
    <section aria-label="Warnings" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        Check before sending
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}

function invoiceDetail(inv: RegisterInvoice, earlier: boolean): string {
  if (earlier) {
    const when = inv.cancelledAt ? `Cancelled ${formatIstDate(inv.cancelledAt)}` : "Cancelled";
    return `${when} · less ${formatPaise(inv.amounts.valuePaise)}`;
  }
  if (inv.status === "cancelled") return cancellationNote(inv.cancelledAt, inv.amounts.valuePaise);
  return `${formatPaise(inv.amounts.valuePaise)} · tax ${formatPaise(taxOf(inv.amounts))}`;
}

function InvoiceList({ title, invoices, earlier = false }: { title: string; invoices: RegisterInvoice[]; earlier?: boolean }) {
  return (
    <section aria-label={title} className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold text-cb-fg">{title}</h3>
      <ul className="space-y-2">
        {invoices.map((inv) => (
          <ListCard
            key={inv.orderId}
            testId="register-invoice"
            title={inv.invoiceNumber}
            meta={`${formatIstDate(inv.invoiceDate)} · ${inv.customerName} · ${inv.channel === "stall" ? "Stall" : "Online"}`}
            dimmed={inv.status === "cancelled" && !earlier}
          >
            {invoiceDetail(inv, earlier)}
          </ListCard>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run components/admin app/admin/sales-register`
Expected: PASS (including `AdminShell.test.tsx`, whose bottom-bar list is unchanged).

- [ ] **Step 5: Check it in the browser at phone width**

Run `npm run dev`, sign in as an admin, open `http://localhost:3000/admin/sales-register` at 375×812 (the owner's preferred preview size). Check that the chips scroll sideways, the header button does not push the title off screen, and the B2CS table scrolls inside its card rather than widening the page. Fix any overflow with `min-w-0` / `overflow-x-auto` on the offending block and re-run Step 4.

- [ ] **Step 6: Commit**

```bash
git add components/admin/nav.ts components/admin/nav.test.ts components/admin/gst/RegisterTable.tsx app/admin/sales-register
git commit -m "feat(admin): Sales register page with month chips, totals, B2CS, HSN, invoice numbers and invoices"
```

---

### Task 10: Docs, full verification and hand-over

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-10-03-gst-sales-register-design.md` (status line)

**Interfaces:**
- Consumes: everything above.
- Produces: documentation only.

- [ ] **Step 1: Update CLAUDE.md**

1. In the "This Repo's Role" paragraph's admin list, after `` `/admin/stock`, `` add `` `/admin/sales-register`, ``.
2. In the "Admin-gated routes" bullet, change `dashboard/actions, dashboard/sales, stock)` to `dashboard/actions, dashboard/sales, stock, sales-register)`.
3. In "Commands", after the `db:test-category-data` line, add:
   ```
   npm run db:test-sales-register           # invoice_voided_at trigger, guard and invoice-number backfill (rolled back)
   ```
4. In "Route Structure", after the `/admin/stock` line add `  /admin/sales-register      # Admin: monthly GST sales register preview + .xlsx for the CA (live)`, and after the `/api/admin/stock` line add `  /api/admin/sales-register   # ?month=YYYY-MM JSON; /download → .xlsx; live, no cache`.
5. After the "### Admin stock (`/admin/stock`)" section, add:

```markdown
### GST sales register (`/admin/sales-register`)
- Monthly register for the CA's GSTR-1 / GSTR-3B: preview with totals, B2CS, HSN and invoice-number runs, plus a GSTR-1-ready `.xlsx` (sheets Summary, Invoices, B2CS, B2CL, HSN summary, Documents issued, Cancelled earlier). Spec: `docs/superpowers/specs/2026-10-03-gst-sales-register-design.md`.
- GST registration took effect in September 2026 (`GST_REGISTERED_FROM`). Store sales only: the monthly Cellstrat consulting invoice is billed outside the app and goes to the CA separately.
- A month holds the invoices whose `invoice_date` falls in it (IST). Every figure comes from `buildInvoice()`, so it matches the invoice PDFs to the paisa.
- "As at month end": `orders.invoice_voided_at` is stamped by `orders_on_status_change` when an invoiced order leaves a paid status and cleared when it is paid again. An invoice voided in its own month stays listed with zero amounts; one voided in a later month stays valid in its own month and appears in the later month's "Cancelled earlier" as minus figures. A past month's file therefore never changes. Limitation: an order cancelled and later reinstated loses its "Cancelled earlier" line.
- `public.backfill_invoice_numbers(p_from)` (service role only) numbers paid orders that have none, in paid-time order, dated with their paid time. The migration ran it from 1 Sep 2026: `CB/26-27/0025` and `0026` are 1 Sep sales numbered on the migration date.
- `lib/gst/` holds it: `register-month` (IST months), `sales-register` (pure builder), `register-summaries` (B2CS/B2CL/HSN/runs), `register-xlsx` (`write-excel-file`), `register-orders` (reads; phone and email never selected). Both routes run `requireAdmin()` first; the download is `private, no-store` and `noindex`.
```

- [ ] **Step 2: Mark the spec as planned**

In the spec, replace `**Status:** draft for review` with `**Status:** approved 2026-10-03; plan at \`docs/superpowers/plans/2026-10-03-gst-sales-register.md\``. In its Section 2 migration item 6, replace `in \`cancelled\`/\`refunded\`` with `in any non-paid status`, and in "Warnings" replace `An invoiced order in \`cancelled\`/\`refunded\` with no \`invoice_voided_at\`` with `An invoiced order in a non-paid status with no \`invoice_voided_at\``.

- [ ] **Step 3: Run the whole verification**

```bash
npm run test:unit
npx tsc --noEmit
npm run lint
npm run build
```
Expected: all unit tests pass; no type errors; lint clean; build succeeds and lists `/admin/sales-register` and `/api/admin/sales-register/download`. If `next build` fails to bundle `write-excel-file/node`, add `"write-excel-file"` to `serverExternalPackages` in `next.config.mjs`, rebuild, and add that change to this task's commit.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git add -f docs/superpowers/specs/2026-10-03-gst-sales-register-design.md docs/superpowers/plans/2026-10-03-gst-sales-register.md
git commit -m "docs: GST sales register in CLAUDE.md; spec marked approved"
```

- [ ] **Step 5: Hand over to the owner (do not run these yourself)**

Tell the owner, in this order:

1. Run the rolled-back tests against the live database:
   `! npm run db:test-sales-register` → expect `15/15 assertions passed.`
2. Apply the migration:
   ```
   ! psql "$(node --input-type=module -e "import {connectionString} from './scripts/lib/run-psql-assertions.mjs'; process.stdout.write(connectionString())")" -v ON_ERROR_STOP=1 -f supabase/migrations/20261003120000_gst_sales_register.sql
   ```
3. `! npm run db:lint` and `! npm run db:probe` → expect no new findings (`ERROR=0`, the one known `duplicate_index` warning).
4. Only after the migration is live: merge to `develop` and `main` and deploy (the routes select `invoice_voided_at`).
5. Live check on `/admin/sales-register` for September 2026: 18 invoices, ₹28,320.00 invoice value (Stall 16 · ₹26,167.00, Online 2 · ₹2,153.00), invoice numbers `0001–0016` and `0025–0026`; it should match a read-only `select count(*), sum(total_amount) from orders where invoice_date >= '2026-09-01 00:00+05:30' and invoice_date < '2026-10-01 00:00+05:30'`.
6. Tell the CA that `CB/26-27/0025` and `0026` were numbered on the migration date for sales paid on 1 Sep 2026.
