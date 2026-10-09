# Retail Approved Discounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Cozyberries approve discount rates per shop per month, let the shop report sales per rate on the monthly sheet, and invoice each sale line at `share × MRP × (1 − rate)`.

**Architecture:** A new admin-tier table `retailer_discount_rates` holds the approved rates; sale lines gain `discount_pct`. SQL functions (`consignment_add_rate`, `consignment_remove_rate`, and updated `consignment_fill_from_batches` / `consignment_save_sale` / `consignment_issue`) enforce the rules. The TS layer (pricing, sheet v2, routes, PDF, SalesPanel) carries the rate through, and the GST register needs no logic change because it reads stored `unit_price_paise`.

**Tech Stack:** Next.js 15 App Router, Supabase Postgres (plpgsql), zod, write-excel-file / read-excel-file, @react-pdf/renderer, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-09-retail-approved-discounts-design.md`

## Global Constraints

- Branch: `feature/retail-approved-discounts`. Never commit to `main`/`develop` directly.
- Unit price: `round(mrp_paise × (100 − discount_pct) × share_pct / 10000)`, rounded once, half away from zero. Example: MRP ₹923, 10% off, 75% share → 62303 paise.
- `discount_pct` / `rate_pct`: numeric(5,2), `> 0 and < 100` for rates, `>= 0 and < 100` on lines; 0 means full MRP. At most two decimals.
- At most **4** rates per shop per month (`TOO_MANY_RATES`).
- Error codes (P0001 messages): `BAD_RATE`, `TOO_MANY_RATES`, `RATE_IN_USE:<rate>`, `RATE_NOT_APPROVED:<rate>`, plus the existing ones. `<rate>` is `trim_scale(rate)` (e.g. `10`, `12.5`).
- New table is admin/internal tier: RLS enabled + forced, no policies, `revoke all from public, anon, authenticated`, grants to `service_role` only. Functions: `SECURITY INVOKER`, `set search_path = ''`, service role only (same as the other `consignment_*`).
- Sheet template id becomes `cozyberries-retail-sales-v2`; columns `Code (do not edit)`, `Product`, `Size`, `MRP`, `You hold`, `Sold at full MRP`, then `Sold at <r>% off` per rate, ascending.
- Every `/api/admin/*` route calls `requireAdmin()` before creating the service-role client.
- Every bug or behaviour gets an automated test (vitest or the rolled-back SQL test). No manual verification.
- Rates are formatted with `formatRate` (`10`, `12.5`): no trailing zeros anywhere in UI, sheet or PDF.

## Review Focus

1. A rate removed (or added) after the shop downloaded the sheet: the upload must be refused with "download it again", never silently drop or mis-price a column. (Task 4 test "refuses a sheet whose discounts changed".)
2. A product sold at two rates whose combined quantity exceeds what the shop holds: refused per variant total in SQL and in the parser. (Task 1 test 37, Task 4 test "checks held against the total across rate columns".)
3. A draft saved at 10% and then the 10% rate removed: removal refused while the draft uses it; issue re-checks rates if the table was edited directly. (Task 1 tests 38 and 42.)
4. Rates entered as `12.345`, `0`, `100`, or text: refused before the database (zod) and in SQL (`BAD_RATE`). (Task 3 `parseRateInput` tests, Task 1 test 33.)
5. Already-issued invoices and old drafts (lines with no rate) keep their price and display: every existing line defaults to 0 and prices unchanged. (Task 1 test 24 unchanged; Task 2 pricing test "rate 0 keeps the old price".)

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20261009120000_retail_discount_rates.sql` (new) | table, column, add/remove rate functions, updated fill/save_sale/issue |
| `scripts/sql/test-retail.sql`, `scripts/db-test-retail.mjs` | rolled-back SQL behaviour tests (expected count 38 → 49) |
| `scripts/sql/security-probe.sql` | probe lists the new table |
| `lib/retail/types.ts` | `ConsignmentLine.discount_pct`, `DiscountRate` |
| `lib/retail/pricing.ts` | `unitPricePaise(mrp, share, discount)`, `formatRate`, `ratesFor`, rate-aware merge |
| `lib/retail/queries.ts`, `lib/retail/api-types.ts` | `discount_pct` column, `discountRates` on the detail |
| `lib/retail/requests.ts`, `lib/retail/rpc-errors.ts` | rate input parsing, sale line `discount_pct`, new error codes |
| `app/api/admin/retail/[id]/rates/route.ts` (new) | POST/DELETE a rate |
| `lib/retail/sheet.ts`, `app/api/admin/retail/[id]/sheet/route.ts` | sheet v2 build/parse with rate columns |
| `lib/retail/documents.ts`, `lib/retail/pdf.tsx` | `discountPct` on invoice lines, Disc. column, footer wording |
| `components/admin/retail/SalesPanel.tsx` | rate chips, per-rate manual inputs, preview text |
| `CLAUDE.md`, retail specs | docs |

---

### Task 1: Database — rates table, line discount, functions, SQL tests

**Files:**
- Create: `supabase/migrations/20261009120000_retail_discount_rates.sql`
- Modify: `scripts/sql/test-retail.sql` (lines 8-9 includes, 52-53 table list, 157-166 function list, new tests before the final `select`)
- Modify: `scripts/db-test-retail.mjs:6` (`expected: 38` → `expected: 49`)
- Modify: `scripts/sql/security-probe.sql` (the admin table array that lists `'retailer_batch_balances'`)

**Interfaces:**
- Produces (SQL, service_role only):
  - `public.retailer_discount_rates(retailer_id uuid, period text, rate_pct numeric(5,2), created_by uuid, created_at timestamptz)`, PK `(retailer_id, period, rate_pct)`
  - `public.consignment_lines.discount_pct numeric(5,2) not null default 0`
  - `public.consignment_add_rate(p_retailer_id uuid, p_period text, p_rate_pct numeric, p_actor uuid) returns void`
  - `public.consignment_remove_rate(p_retailer_id uuid, p_period text, p_rate_pct numeric) returns void`
  - `consignment_save_sale` / `consignment_fill_from_batches` accept line objects `{variant_slug, quantity, discount_pct?}`

- [ ] **Step 1: Write the failing SQL tests**

In `scripts/sql/test-retail.sql`:

1. After line 9 (`\ir ../../supabase/migrations/20261008120100_retail_consignment_functions.sql`) add:

```sql
\ir ../../supabase/migrations/20261009120000_retail_discount_rates.sql
```

2. In test 1's table array (lines 52-53) add `'retailer_discount_rates'`:

```sql
  foreach t in array array['retailers', 'consignment_docs', 'consignment_lines',
                           'retailer_payments', 'consignment_counters', 'retailer_batch_balances',
                           'retailer_discount_rates'] loop
```

3. In test 9's function array (lines 157-166) add the two new functions after `'public.consignment_cancel(uuid)'`:

```sql
    'public.consignment_cancel(uuid)',
    'public.consignment_add_rate(uuid,text,numeric,uuid)',
    'public.consignment_remove_rate(uuid,text,numeric)'] loop
```

4. Insert these tests immediately before the final `select case when ok then 'PASS ' ...` (after test 32):

```sql
-- Approved discounts (agreement revised 2026-10-09). A second shop gets 4 pieces
-- of size a at Rs 923 today; rates are per shop and month.
do $$
declare v_shop uuid;
begin
  insert into public.retailers (legal_name, gstin, address)
    values ('ZZ Discount Shop', '29AAACR5055K1Z5', '2 Test Road, Bengaluru')
    returning id into v_shop;
  insert into t_ctx values ('shop2', v_shop::text);
  perform public.consignment_issue(public.consignment_save_challan(v_shop, pg_temp.today(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":4,"mrp_paise":92300}]', pg_temp.actor(), null));
end $$;

create function pg_temp.shop2() returns uuid language sql as $$ select v::uuid from t_ctx where k = 'shop2' $$;
create function pg_temp.rate_lines(p_doc uuid) returns text language sql as $$
  select string_agg(quantity || '@' || trim_scale(discount_pct), ',' order by discount_pct, quantity)
    from public.consignment_lines where doc_id = p_doc
$$;

-- 33. A rate must be above 0, below 100, with at most two decimals; the month can't be in the future.
do $$
declare e0 text; e100 text; e3 text; ef text;
begin
  e0 := pg_temp.err(format('select public.consignment_add_rate(%L, %L, 0, %L)', pg_temp.shop2(), pg_temp.period(), pg_temp.actor()));
  e100 := pg_temp.err(format('select public.consignment_add_rate(%L, %L, 100, %L)', pg_temp.shop2(), pg_temp.period(), pg_temp.actor()));
  e3 := pg_temp.err(format('select public.consignment_add_rate(%L, %L, 12.345, %L)', pg_temp.shop2(), pg_temp.period(), pg_temp.actor()));
  ef := pg_temp.err(format('select public.consignment_add_rate(%L, %L, 10, %L)', pg_temp.shop2(),
    to_char(pg_temp.today() + interval '1 month', 'YYYY-MM'), pg_temp.actor()));
  insert into t_result values ('rate_bounds_refused',
    e0 = 'BAD_RATE' and e100 = 'BAD_RATE' and e3 = 'BAD_RATE' and ef = 'BAD_PERIOD',
    format('0=%s 100=%s 12.345=%s future=%s', e0, e100, e3, ef));
end $$;

-- 34. Adding a rate twice is a no-op; a fifth rate is refused.
do $$
declare v_err text; v_n int;
begin
  perform public.consignment_add_rate(pg_temp.shop2(), pg_temp.period(), 10, pg_temp.actor());
  perform public.consignment_add_rate(pg_temp.shop2(), pg_temp.period(), 10, pg_temp.actor());
  perform public.consignment_add_rate(pg_temp.shop2(), pg_temp.period(), 20, pg_temp.actor());
  perform public.consignment_add_rate(pg_temp.shop2(), pg_temp.period(), 30, pg_temp.actor());
  perform public.consignment_add_rate(pg_temp.shop2(), pg_temp.period(), 40, pg_temp.actor());
  v_err := pg_temp.err(format('select public.consignment_add_rate(%L, %L, 50, %L)', pg_temp.shop2(), pg_temp.period(), pg_temp.actor()));
  select count(*) into v_n from public.retailer_discount_rates where retailer_id = pg_temp.shop2() and period = pg_temp.period();
  perform public.consignment_remove_rate(pg_temp.shop2(), pg_temp.period(), 40);
  insert into t_result values ('rate_duplicate_noop_and_max_four',
    v_err = 'TOO_MANY_RATES' and v_n = 4, format('err=%s count=%s', coalesce(v_err, 'accepted'), v_n));
end $$;

-- 35. A sale line at a rate that was not approved for its month is refused.
insert into t_result
select 'sale_unapproved_rate_refused', e = 'RATE_NOT_APPROVED:15', coalesce(e, 'accepted')
  from pg_temp.err(format('select public.consignment_save_sale(%L, %L, %L, %L)', pg_temp.shop2(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":1,"discount_pct":15}]', pg_temp.actor())) e;

-- 36. One product sold at full MRP and at two rates becomes one line per rate.
do $$
declare v_doc uuid;
begin
  v_doc := public.consignment_save_sale(pg_temp.shop2(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":2},
      {"variant_slug":"zz-retail-frock-a","quantity":1,"discount_pct":10},
      {"variant_slug":"zz-retail-frock-a","quantity":1,"discount_pct":20}]', pg_temp.actor());
  insert into t_ctx values ('s2', v_doc::text);
  insert into t_result values ('sale_splits_lines_per_rate', pg_temp.rate_lines(v_doc) = '2@0,1@10,1@20',
    'lines=' || coalesce(pg_temp.rate_lines(v_doc), 'none'));
end $$;

-- 37. The held check counts every rate together (3 + 2 > 4); the old draft survives.
insert into t_result
select 'sale_held_check_spans_rates',
       e like 'NOT_HELD:4:%' and pg_temp.rate_lines((select v::uuid from t_ctx where k = 's2')) = '2@0,1@10,1@20',
       coalesce(e, 'accepted')
  from pg_temp.err(format('select public.consignment_save_sale(%L, %L, %L, %L)', pg_temp.shop2(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":3},{"variant_slug":"zz-retail-frock-a","quantity":2,"discount_pct":10}]',
    pg_temp.actor())) e;

-- 38. A rate the draft uses can't be removed; an unused one can (and removing it again is a no-op).
do $$
declare v_err text; v_n int;
begin
  v_err := pg_temp.err(format('select public.consignment_remove_rate(%L, %L, 10)', pg_temp.shop2(), pg_temp.period()));
  perform public.consignment_remove_rate(pg_temp.shop2(), pg_temp.period(), 30);
  perform public.consignment_remove_rate(pg_temp.shop2(), pg_temp.period(), 30);
  select count(*) into v_n from public.retailer_discount_rates where retailer_id = pg_temp.shop2() and period = pg_temp.period();
  insert into t_result values ('remove_rate_in_use_refused', v_err = 'RATE_IN_USE:10' and v_n = 2,
    format('err=%s count=%s', coalesce(v_err, 'removed'), v_n));
end $$;

-- 39. Issue prices each line at 75% of MRP less its rate: 69225, 62303, 55380.
do $$
declare v_doc public.consignment_docs; v_prices text;
begin
  v_doc := public.consignment_issue((select v::uuid from t_ctx where k = 's2'));
  select string_agg(trim_scale(discount_pct) || ':' || unit_price_paise, ',' order by discount_pct) into v_prices
    from public.consignment_lines where doc_id = v_doc.id;
  insert into t_result values ('issue_prices_selling_price_share', v_prices = '0:69225,10:62303,20:55380',
    'prices=' || coalesce(v_prices, 'none'));
end $$;

-- 40. Once the month's invoice is issued its rates are frozen.
do $$
declare e_add text; e_rm text;
begin
  e_add := pg_temp.err(format('select public.consignment_add_rate(%L, %L, 5, %L)', pg_temp.shop2(), pg_temp.period(), pg_temp.actor()));
  e_rm := pg_temp.err(format('select public.consignment_remove_rate(%L, %L, 20)', pg_temp.shop2(), pg_temp.period()));
  insert into t_result values ('rates_frozen_after_issue', e_add = 'ALREADY_ISSUED' and e_rm = 'ALREADY_ISSUED',
    format('add=%s remove=%s', coalesce(e_add, 'accepted'), coalesce(e_rm, 'accepted')));
end $$;

-- 41. Challan and return lines never carry a discount.
insert into t_result
select 'non_sale_lines_have_no_discount', bool_and(l.discount_pct = 0), 'a non-sale line has a discount'
  from public.consignment_lines l join public.consignment_docs d on d.id = l.doc_id
 where d.kind <> 'sale';

-- 42. Issue re-checks the rates, and the Rs 2,500 ceiling is judged on the discounted
--     price: MRP Rs 4,000 at 20% off → 75% × 3,200 = Rs 2,400 (full MRP would be Rs 3,000).
do $$
declare v_ch uuid; v_sale uuid; v_err text; v_doc public.consignment_docs; v_price int;
begin
  v_ch := public.consignment_save_challan(pg_temp.shop2(), pg_temp.today(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":1,"mrp_paise":400000}]', pg_temp.actor(), null);
  update public.consignment_docs set doc_date = '2026-05-15' where id = v_ch;
  perform public.consignment_issue(v_ch);
  perform public.consignment_add_rate(pg_temp.shop2(), '2026-05', 20, pg_temp.actor());
  v_sale := public.consignment_save_sale(pg_temp.shop2(), '2026-05',
    '[{"variant_slug":"zz-retail-frock-a","quantity":1,"discount_pct":20}]', pg_temp.actor());
  delete from public.retailer_discount_rates where retailer_id = pg_temp.shop2() and period = '2026-05';
  v_err := pg_temp.err(format('select public.consignment_issue(%L)', v_sale));
  insert into t_result values ('issue_rechecks_rates', v_err = 'RATE_NOT_APPROVED:20', coalesce(v_err, 'issued'));
  insert into public.retailer_discount_rates (retailer_id, period, rate_pct) values (pg_temp.shop2(), '2026-05', 20);
  v_doc := public.consignment_issue(v_sale);
  select unit_price_paise into v_price from public.consignment_lines where doc_id = v_sale;
  insert into t_result values ('low_rate_ceiling_uses_discounted_price',
    v_doc.status = 'issued' and v_price = 240000, format('status=%s price=%s', v_doc.status, v_price));
end $$;
```

In `scripts/db-test-retail.mjs` change `expected: 38` to `expected: 49`.

In `scripts/sql/security-probe.sql`, in the admin table array, change `'retailer_batch_balances']` to `'retailer_batch_balances','retailer_discount_rates']`.

- [ ] **Step 2: Set up a throwaway local Postgres and run the tests to verify they fail**

Live Supabase is the owner's to run; verify locally first. Create the stub schema file in the scratchpad (not committed), e.g. `$SCRATCH/retail-stub.sql`:

```sql
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.sizes (slug text primary key, name text);
insert into public.sizes values ('0-3m', '0-3M'), ('3-6m', '3-6M');
create table public.products (slug text primary key, name text not null, price numeric, base_price numeric, is_active boolean default true);
create table public.product_variants (
  slug text primary key, product_slug text references public.products(slug),
  size_slug text references public.sizes(slug), price numeric, base_price numeric, stock_quantity integer);
grant usage on schema public to service_role;
grant select, update on public.product_variants to service_role;
grant select on public.products, public.sizes to service_role;
create or replace function public.gst_financial_year(p_at timestamptz)
returns text language sql stable set search_path = '' as $$
  select lpad((s.y % 100)::text, 2, '0') || '-' || lpad(((s.y + 1) % 100)::text, 2, '0')
    from (select extract(year from ((p_at at time zone 'Asia/Kolkata') - interval '3 months'))::int as y) s
$$;
```

Then (the scratchpad path is too long for a Unix socket, so use TCP):

```bash
SCRATCH=<this session's scratchpad>
initdb -D "$SCRATCH/pg" -U postgres --auth=trust >/dev/null
pg_ctl -D "$SCRATCH/pg" -o "-p 54329 -c unix_socket_directories='' -c listen_addresses=127.0.0.1" -l "$SCRATCH/pg.log" start
psql "postgresql://postgres@127.0.0.1:54329/postgres" -q -f "$SCRATCH/retail-stub.sql"
node scripts/db-test-retail.mjs --url=postgresql://postgres@127.0.0.1:54329/postgres
```

Expected: FAIL — psql stops at the `\ir` of the missing `20261009120000_retail_discount_rates.sql` (file not found). If it fails earlier, inside the two existing retail migrations, because they reference an object the stub lacks, add the smallest stub for that object to `retail-stub.sql` and re-run until the only failure is the missing new file.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261009120000_retail_discount_rates.sql`:

```sql
-- Approved discounts on shop sales (consignment agreement revised 2026-10-09,
-- clauses 3.5-3.7). Cozyberries approves fixed discount rates per shop and
-- month; a sale line carries the rate it sold at and is invoiced at
-- share × MRP × (1 − rate), so a discount is borne 75 : 25.
-- Spec: docs/superpowers/specs/2026-10-09-retail-approved-discounts-design.md.
-- Admin/internal tier: no grants to anon/authenticated, RLS forced, no
-- policies; written only through the functions below (service role).
-- Idempotent, so scripts/sql/test-retail.sql can load it again.

create table if not exists public.retailer_discount_rates (
  retailer_id uuid not null references public.retailers(id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  rate_pct numeric(5, 2) not null check (rate_pct > 0 and rate_pct < 100),
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (retailer_id, period, rate_pct)
);

alter table public.retailer_discount_rates enable row level security;
alter table public.retailer_discount_rates force row level security;
revoke all on table public.retailer_discount_rates from public, anon, authenticated;
grant select, insert, delete on table public.retailer_discount_rates to service_role;

-- Sale lines: the approved discount the pieces sold at (0 = full MRP).
-- Challan and return lines are always 0.
alter table public.consignment_lines
  add column if not exists discount_pct numeric(5, 2) not null default 0
  check (discount_pct >= 0 and discount_pct < 100);

create or replace function public.consignment_add_rate(p_retailer_id uuid, p_period text, p_rate_pct numeric, p_actor uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  perform pg_advisory_xact_lock(hashtext('consignment:' || p_retailer_id::text));
  if not exists (select 1 from public.retailers r where r.id = p_retailer_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_period > to_char(v_today, 'YYYY-MM') then
    raise exception 'BAD_PERIOD' using errcode = 'P0001';
  end if;
  if p_rate_pct is null or p_rate_pct <= 0 or p_rate_pct >= 100 or p_rate_pct <> round(p_rate_pct, 2) then
    raise exception 'BAD_RATE' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.consignment_docs d
              where d.retailer_id = p_retailer_id and d.kind = 'sale' and d.period = p_period and d.status = 'issued') then
    raise exception 'ALREADY_ISSUED' using errcode = 'P0001';
  end if;
  if (select count(*) from public.retailer_discount_rates r
       where r.retailer_id = p_retailer_id and r.period = p_period and r.rate_pct <> p_rate_pct) >= 4 then
    raise exception 'TOO_MANY_RATES' using errcode = 'P0001';
  end if;
  insert into public.retailer_discount_rates (retailer_id, period, rate_pct, created_by)
  values (p_retailer_id, p_period, p_rate_pct, p_actor)
  on conflict (retailer_id, period, rate_pct) do nothing;
end;
$$;

create or replace function public.consignment_remove_rate(p_retailer_id uuid, p_period text, p_rate_pct numeric)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('consignment:' || p_retailer_id::text));
  if exists (select 1 from public.consignment_docs d
              where d.retailer_id = p_retailer_id and d.kind = 'sale' and d.period = p_period and d.status = 'issued') then
    raise exception 'ALREADY_ISSUED' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.consignment_lines l
               join public.consignment_docs d on d.id = l.doc_id
              where d.retailer_id = p_retailer_id and d.kind = 'sale' and d.period = p_period
                and d.status = 'draft' and l.discount_pct = p_rate_pct) then
    raise exception 'RATE_IN_USE:%', trim_scale(p_rate_pct) using errcode = 'P0001';
  end if;
  delete from public.retailer_discount_rates r
   where r.retailer_id = p_retailer_id and r.period = p_period and r.rate_pct = p_rate_pct;
end;
$$;

-- Turns "variant × quantity [× discount]" into lines per batch, oldest batch
-- first, using only batches sent on or before p_until. The held check is per
-- variant across every rate: NOT_HELD:<held>:<name size> when the shop holds
-- less. A missing discount_pct is 0 (returns never pass one).
create or replace function public.consignment_fill_from_batches(p_doc_id uuid, p_retailer_id uuid, p_lines jsonb, p_until date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v record;
  item record;
  b record;
  v_avail integer;
  v_label text;
  v_left integer;
  v_free integer;
  v_take integer;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'BAD_LINE' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer, discount_pct numeric)
     where x.variant_slug is null or x.quantity is null or x.quantity < 0
        or coalesce(x.discount_pct, 0) < 0 or coalesce(x.discount_pct, 0) >= 100
  ) then
    raise exception 'BAD_LINE' using errcode = 'P0001';
  end if;

  for v in
    select x.variant_slug, sum(x.quantity)::integer as quantity
      from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer)
     group by x.variant_slug
    having sum(x.quantity) > 0
     order by x.variant_slug
  loop
    select coalesce(sum(bb.held), 0)::integer, min(trim(bb.product_name || ' ' || bb.size))
      into v_avail, v_label
      from public.retailer_batch_balances bb
     where bb.retailer_id = p_retailer_id
       and bb.variant_slug = v.variant_slug
       and bb.held > 0
       and bb.sent_on <= p_until;
    if v_avail < v.quantity then
      raise exception 'NOT_HELD:%:%', v_avail, coalesce(v_label, v.variant_slug) using errcode = 'P0001';
    end if;

    for item in
      select coalesce(x.discount_pct, 0) as discount_pct, sum(x.quantity)::integer as quantity
        from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer, discount_pct numeric)
       where x.variant_slug = v.variant_slug
       group by coalesce(x.discount_pct, 0)
      having sum(x.quantity) > 0
       order by 1
    loop
      v_left := item.quantity;
      for b in
        select bb.batch_line_id, bb.product_name, bb.size, bb.mrp_paise, bb.held
          from public.retailer_batch_balances bb
         where bb.retailer_id = p_retailer_id
           and bb.variant_slug = v.variant_slug
           and bb.held > 0
           and bb.sent_on <= p_until
         order by bb.sent_on, bb.batch_line_id
      loop
        exit when v_left = 0;
        -- Pieces of this batch already given to an earlier rate in this document.
        select b.held - coalesce(sum(l.quantity), 0)::integer into v_free
          from public.consignment_lines l
         where l.doc_id = p_doc_id and l.batch_line_id = b.batch_line_id;
        continue when v_free <= 0;
        v_take := least(v_left, v_free);
        insert into public.consignment_lines (doc_id, variant_slug, product_name, size, quantity, mrp_paise, batch_line_id, discount_pct)
        values (p_doc_id, v.variant_slug, b.product_name, b.size, v_take, b.mrp_paise, b.batch_line_id, item.discount_pct);
        v_left := v_left - v_take;
      end loop;
    end loop;
  end loop;
end;
$$;

-- Creates or replaces the period's draft sale. An empty list is a "nothing sold"
-- month. Every non-zero discount must be approved for the period.
create or replace function public.consignment_save_sale(
  p_retailer_id uuid,
  p_period text,
  p_lines jsonb,
  p_actor uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_doc uuid;
  v_status text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_end date;
  v_lines jsonb := coalesce(p_lines, '[]'::jsonb);
  v_rate numeric;
begin
  perform pg_advisory_xact_lock(hashtext('consignment:' || p_retailer_id::text));
  if not exists (select 1 from public.retailers r where r.id = p_retailer_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_period > to_char(v_today, 'YYYY-MM') then
    raise exception 'BAD_PERIOD' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_lines) is distinct from 'array' then
    raise exception 'BAD_LINE' using errcode = 'P0001';
  end if;
  select x.discount_pct into v_rate
    from jsonb_to_recordset(v_lines) as x(discount_pct numeric)
   where coalesce(x.discount_pct, 0) <> 0
     and not exists (select 1 from public.retailer_discount_rates r
                      where r.retailer_id = p_retailer_id and r.period = p_period and r.rate_pct = x.discount_pct)
   limit 1;
  if found then
    raise exception 'RATE_NOT_APPROVED:%', trim_scale(v_rate) using errcode = 'P0001';
  end if;
  v_end := (to_date(p_period || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;

  select d.id, d.status into v_doc, v_status
    from public.consignment_docs d
   where d.retailer_id = p_retailer_id and d.kind = 'sale' and d.period = p_period and d.status <> 'cancelled'
     for update;
  if v_status = 'issued' then
    raise exception 'ALREADY_ISSUED' using errcode = 'P0001';
  end if;
  if v_doc is null then
    insert into public.consignment_docs (retailer_id, kind, doc_date, period, created_by)
    values (p_retailer_id, 'sale', least(v_end, v_today), p_period, p_actor)
    returning id into v_doc;
  else
    delete from public.consignment_lines where doc_id = v_doc;
    update public.consignment_docs set doc_date = least(v_end, v_today) where id = v_doc;
  end if;
  perform public.consignment_fill_from_batches(v_doc, p_retailer_id, v_lines, v_end);
  return v_doc;
end;
$$;

create or replace function public.consignment_issue(p_doc_id uuid)
returns public.consignment_docs
language plpgsql
set search_path = ''
as $$
declare
  v_doc public.consignment_docs;
  v_retailer public.retailers;
  item record;
  v_bad record;
  v_held integer;
  v_label text;
  v_rate numeric;
begin
  select * into v_doc from public.consignment_docs where id = p_doc_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('consignment:' || v_doc.retailer_id::text));
  -- Re-read under the lock: another call may have issued or deleted it meanwhile.
  select * into v_doc from public.consignment_docs where id = p_doc_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_doc.status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;
  select * into v_retailer from public.retailers where id = v_doc.retailer_id;
  -- Only sale lines carry a discount.
  if v_doc.kind <> 'sale' and exists (select 1 from public.consignment_lines where doc_id = p_doc_id and discount_pct <> 0) then
    raise exception 'BAD_LINE' using errcode = 'P0001';
  end if;

  if v_doc.kind = 'challan' then
    if not v_retailer.active then
      raise exception 'RETAILER_INACTIVE' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.consignment_lines where doc_id = p_doc_id) then
      raise exception 'NO_LINES' using errcode = 'P0001';
    end if;
    for item in
      select l.variant_slug, min(trim(l.product_name || ' ' || l.size)) as label, sum(l.quantity)::integer as quantity
        from public.consignment_lines l
       where l.doc_id = p_doc_id
       group by l.variant_slug
       order by l.variant_slug
    loop
      update public.product_variants v
         set stock_quantity = coalesce(v.stock_quantity, 0) - item.quantity
       where v.slug = item.variant_slug
         and coalesce(v.stock_quantity, 0) >= item.quantity;
      if not found then
        raise exception 'OUT_OF_STOCK:%', item.label using errcode = 'P0001';
      end if;
    end loop;
    v_doc.number := public.consignment_next_number('CBC', v_doc.doc_date);
  else
    -- Sale or return: every batch must still hold what this document takes from it.
    select l.variant_slug, l.label into v_bad
      from (
        select batch_line_id, variant_slug, min(trim(product_name || ' ' || size)) as label,
               sum(quantity)::integer as quantity
          from public.consignment_lines
         where doc_id = p_doc_id
         group by batch_line_id, variant_slug
      ) l
      left join public.retailer_batch_balances b
        on b.batch_line_id = l.batch_line_id and b.retailer_id = v_doc.retailer_id
     where l.quantity > coalesce(b.held, 0)
     limit 1;
    if found then
      select coalesce(sum(held), 0)::integer into v_held
        from public.retailer_batch_balances
       where retailer_id = v_doc.retailer_id and variant_slug = v_bad.variant_slug;
      raise exception 'NOT_HELD:%:%', v_held, v_bad.label using errcode = 'P0001';
    end if;

    if v_doc.kind = 'sale' then
      v_doc.share_pct := v_retailer.our_share_pct;
      -- Invoice date is fixed at issue. While the period's GSTR-1 is not yet due
      -- (before 00:00 IST on the 11th of the next month): the period's last day,
      -- or today if the period is still running. After that the month is filed,
      -- so a late invoice is dated today and lands in an open month.
      if now() < ((to_date(v_doc.period || '-01', 'YYYY-MM-DD') + interval '1 month' + interval '10 days')::timestamp
                  at time zone 'Asia/Kolkata') then
        v_doc.doc_date := least(
          (to_date(v_doc.period || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date,
          (now() at time zone 'Asia/Kolkata')::date);
      else
        v_doc.doc_date := (now() at time zone 'Asia/Kolkata')::date;
      end if;
      -- Every discount must still be approved for the period.
      select l.discount_pct into v_rate
        from public.consignment_lines l
       where l.doc_id = p_doc_id and l.discount_pct <> 0
         and not exists (select 1 from public.retailer_discount_rates r
                          where r.retailer_id = v_doc.retailer_id and r.period = v_doc.period and r.rate_pct = l.discount_pct)
       limit 1;
      if found then
        raise exception 'RATE_NOT_APPROVED:%', trim_scale(v_rate) using errcode = 'P0001';
      end if;
      -- Our share of the selling price (MRP less the approved discount), rounded once.
      update public.consignment_lines
         set unit_price_paise = round(mrp_paise * (100 - discount_pct) * v_doc.share_pct / 10000)::integer
       where doc_id = p_doc_id;
      -- Clothing above Rs 2,500 a piece is 18% GST; the invoice charges a flat 5%
      -- (GST_LOW_RATE_MAX_UNIT_PRICE in lib/config/business.ts).
      select trim(l.product_name || ' ' || l.size) into v_label
        from public.consignment_lines l
       where l.doc_id = p_doc_id and l.unit_price_paise > 250000
       order by l.product_name, l.size
       limit 1;
      if v_label is not null then
        raise exception 'ABOVE_LOW_RATE:%', v_label using errcode = 'P0001';
      end if;
      if exists (select 1 from public.consignment_lines where doc_id = p_doc_id) then
        v_doc.number := public.consignment_next_number('CBR', v_doc.doc_date);
      end if;
    else
      if not exists (select 1 from public.consignment_lines where doc_id = p_doc_id) then
        raise exception 'NO_LINES' using errcode = 'P0001';
      end if;
      for item in
        select l.variant_slug, sum(l.quantity)::integer as quantity
          from public.consignment_lines l
         where l.doc_id = p_doc_id
         group by l.variant_slug
         order by l.variant_slug
      loop
        update public.product_variants v
           set stock_quantity = coalesce(v.stock_quantity, 0) + item.quantity
         where v.slug = item.variant_slug;
      end loop;
      v_doc.number := public.consignment_next_number('RET', v_doc.doc_date);
    end if;
  end if;

  -- Challans and sale invoices keep the shop's details as issued (returns don't need them).
  update public.consignment_docs
     set status = 'issued', issued_at = now(), number = v_doc.number, share_pct = v_doc.share_pct,
         doc_date = v_doc.doc_date,
         buyer_legal_name = case when v_doc.kind in ('challan', 'sale') then v_retailer.legal_name end,
         buyer_trade_name = case when v_doc.kind in ('challan', 'sale') then v_retailer.trade_name end,
         buyer_gstin = case when v_doc.kind in ('challan', 'sale') then v_retailer.gstin end,
         buyer_address = case when v_doc.kind in ('challan', 'sale') then v_retailer.address end,
         buyer_state_code = case when v_doc.kind in ('challan', 'sale') then v_retailer.state_code end
   where id = p_doc_id
  returning * into v_doc;
  return v_doc;
end;
$$;

revoke all on function public.consignment_add_rate(uuid, text, numeric, uuid) from public, anon, authenticated;
revoke all on function public.consignment_remove_rate(uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.consignment_fill_from_batches(uuid, uuid, jsonb, date) from public, anon, authenticated;
revoke all on function public.consignment_save_sale(uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.consignment_issue(uuid) from public, anon, authenticated;
grant execute on function public.consignment_add_rate(uuid, text, numeric, uuid) to service_role;
grant execute on function public.consignment_remove_rate(uuid, text, numeric) to service_role;
grant execute on function public.consignment_fill_from_batches(uuid, uuid, jsonb, date) to service_role;
grant execute on function public.consignment_save_sale(uuid, text, jsonb, uuid) to service_role;
grant execute on function public.consignment_issue(uuid) to service_role;
```

Note: the existing `20261008120100` file must stay unchanged (it is applied live); this migration replaces the three functions with `create or replace`.

- [ ] **Step 4: Run the SQL tests to verify they pass**

```bash
node scripts/db-test-retail.mjs --url=postgresql://postgres@127.0.0.1:54329/postgres
```

Expected: 49 lines, all `PASS`, exit 0. If a line FAILs, read its reason text (it prints the actual values) and fix the migration, not the test, unless the test arithmetic is wrong. Then stop the cluster: `pg_ctl -D "$SCRATCH/pg" stop`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261009120000_retail_discount_rates.sql scripts/sql/test-retail.sql scripts/db-test-retail.mjs scripts/sql/security-probe.sql
git commit -m "feat(retail): approved discount rates per shop and month, priced at share of selling price"
```

---

### Task 2: Types, pricing and loader carry the discount

**Files:**
- Modify: `lib/retail/types.ts` (`ConsignmentLine`, new `DiscountRate`)
- Modify: `lib/retail/pricing.ts`
- Modify: `lib/retail/queries.ts` (`LINE_COLUMNS`, `toDoc`, `loadRetailerDetail`)
- Modify: `lib/retail/api-types.ts` (`RetailerDetail.discountRates`)
- Modify: `lib/retail/__fixtures__/retail.ts` (`line()` default `discount_pct: 0`)
- Modify: `components/admin/retail/SalesPanel.test.tsx:13`, `app/admin/retail/[id]/retailer-client.test.tsx` detail fixture (add `discountRates: []`)
- Test: `lib/retail/pricing.test.ts`, `lib/retail/queries.test.ts`

**Interfaces:**
- Consumes: SQL column `consignment_lines.discount_pct`, table `retailer_discount_rates` (Task 1).
- Produces:
  - `interface DiscountRate { period: string; rate_pct: number }` (types.ts)
  - `ConsignmentLine.discount_pct: number`
  - `unitPricePaise(mrpPaise: number, sharePct: number, discountPct?: number): number`
  - `PricedSaleLine.discountPct: number`
  - `formatRate(pct: number): string` → `"10"`, `"12.5"`
  - `ratesFor(rates: DiscountRate[], period: string): number[]` (ascending)
  - `RetailerDetail.discountRates: DiscountRate[]`
  - `RATE_COLUMNS = "period, rate_pct"` (queries.ts)

- [ ] **Step 1: Write the failing tests**

Append to `lib/retail/pricing.test.ts` inside `describe("retail pricing", ...)` (and add `formatRate, ratesFor` to the import from `./pricing`):

```ts
  it("prices our share of the selling price: MRP less the approved discount", () => {
    expect(unitPricePaise(92300, 75, 10)).toBe(62303);
    expect(unitPricePaise(92300, 75, 20)).toBe(55380);
    expect(unitPricePaise(92300, 75, 12.5)).toBe(60572);
  });

  it("keeps the old price at rate 0", () => {
    expect(unitPricePaise(92300, 75, 0)).toBe(unitPricePaise(92300, 75));
    expect(unitPricePaise(92300, 75)).toBe(69225);
  });

  it("keeps lines at different discounts apart and carries the rate", () => {
    const priced = priceSaleLines(
      [
        line({ id: "a", quantity: 2, mrp_paise: 92300 }),
        line({ id: "b", quantity: 1, mrp_paise: 92300, discount_pct: 10 }),
        line({ id: "c", quantity: 1, mrp_paise: 92300, discount_pct: 10 }),
      ],
      75,
    );
    expect(priced.map((p) => [p.quantity, p.discountPct, p.unitPricePaise])).toEqual([
      [2, 0, 69225],
      [2, 10, 62303],
    ]);
  });

  it("totals a draft at its lines' discounts", () => {
    const d = { share_pct: null, consignment_lines: [line({ mrp_paise: 92300, discount_pct: 10, quantity: 2 })] };
    expect(docTotalPaise(d, 75)).toBe(2 * 62303);
  });

  it("formats rates without trailing zeros and lists a month's rates in order", () => {
    expect(formatRate(10)).toBe("10");
    expect(formatRate(12.5)).toBe("12.5");
    expect(formatRate(7.25)).toBe("7.25");
    const rates = [
      { period: "2026-10", rate_pct: 20 },
      { period: "2026-09", rate_pct: 5 },
      { period: "2026-10", rate_pct: 10 },
    ];
    expect(ratesFor(rates, "2026-10")).toEqual([10, 20]);
    expect(ratesFor(rates, "2026-08")).toEqual([]);
  });
```

Append to `lib/retail/queries.test.ts` inside `describe("retail loaders", ...)`:

```ts
  it("loads the shop's approved discount rates as numbers", async () => {
    const { admin, calls } = fakeAdmin({
      retailers: { data: retailer(), error: null },
      retailer_discount_rates: { data: [{ period: "2026-10", rate_pct: "10.00" }, { period: "2026-10", rate_pct: "12.50" }], error: null },
      consignment_docs: { data: [doc({ consignment_lines: [{ ...doc().consignment_lines[0], discount_pct: "10.00" as unknown as number }] })], error: null },
    });
    const d = await loadRetailerDetail(admin, retailer().id, NOW);
    expect(d?.discountRates).toEqual([{ period: "2026-10", rate_pct: 10 }, { period: "2026-10", rate_pct: 12.5 }]);
    expect(d?.docs[0].consignment_lines[0].discount_pct).toBe(10);
    expect(calls.find((c) => c.table === "retailer_discount_rates")?.ops).toContainEqual(["eq", ["retailer_id", retailer().id]]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/retail/pricing.test.ts lib/retail/queries.test.ts`
Expected: FAIL — `formatRate`/`ratesFor` not exported, `unitPricePaise(92300, 75, 10)` returns 69225, `discountRates` undefined.

- [ ] **Step 3: Implement**

`lib/retail/types.ts` — in `ConsignmentLine` after `unit_price_paise`:

```ts
  /** Sale lines: the approved discount on the MRP these pieces sold at (0 = full MRP). Always 0 on challans and returns. */
  discount_pct: number;
```

and at the end of the file:

```ts
/** A discount rate Cozyberries approved for one shop and month (agreement clause 3.5). */
export interface DiscountRate {
  /** YYYY-MM. */
  period: string;
  rate_pct: number;
}
```

`lib/retail/__fixtures__/retail.ts` — in `line()` after `unit_price_paise: null,` add `discount_pct: 0,`.

`lib/retail/pricing.ts` — replace `unitPricePaise`, `PricedSaleLine`, `priceSaleLines`, `docTotalPaise`, and add the two helpers (change the import to `import type { ConsignmentDoc, ConsignmentLine, DiscountRate } from "./types";`):

```ts
/**
 * The shop's price for one piece: our share of the selling price (MRP less any
 * approved discount), GST included, rounded to the paisa once. Worked in whole
 * hundredths so it matches the SQL in consignment_issue exactly.
 */
export function unitPricePaise(mrpPaise: number, sharePct: number, discountPct = 0): number {
  const keep = Math.round((100 - discountPct) * 100);
  const share = Math.round(sharePct * 100);
  return Math.round((mrpPaise * keep * share) / 100_000_000);
}

/** "10", "12.5": a discount rate as people write it. */
export function formatRate(pct: number): string {
  return String(Math.round(pct * 100) / 100);
}

/** The month's approved discount rates, lowest first. */
export function ratesFor(rates: DiscountRate[], period: string): number[] {
  return rates.filter((r) => r.period === period).map((r) => r.rate_pct).sort((a, b) => a - b);
}

export interface PricedSaleLine {
  description: string;
  productName: string;
  size: string;
  quantity: number;
  mrpPaise: number;
  /** The approved discount these pieces sold at (0 = full MRP). */
  discountPct: number;
  unitPricePaise: number;
}

/**
 * Invoice lines for a sale: batch lines with the same product, size, MRP,
 * discount and price are merged, in first-seen order. An issued line's stored
 * price wins over `sharePct` (the draft preview uses the shop's current share).
 */
export function priceSaleLines(lines: ConsignmentLine[], sharePct: number): PricedSaleLine[] {
  const merged = new Map<string, PricedSaleLine>();
  for (const l of lines) {
    const discount = Number(l.discount_pct ?? 0);
    const price = l.unit_price_paise ?? unitPricePaise(l.mrp_paise, sharePct, discount);
    const key = `${l.product_name}|${l.size}|${l.mrp_paise}|${discount}|${price}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += l.quantity;
    } else {
      merged.set(key, {
        description: `${l.product_name} (${l.size})`,
        productName: l.product_name,
        size: l.size,
        quantity: l.quantity,
        mrpPaise: l.mrp_paise,
        discountPct: discount,
        unitPricePaise: price,
      });
    }
  }
  return [...merged.values()];
}
```

and

```ts
/** What a sale document charges the shop (GST included). */
export function docTotalPaise(doc: Pick<ConsignmentDoc, "consignment_lines" | "share_pct">, fallbackSharePct: number): number {
  const share = doc.share_pct ?? fallbackSharePct;
  return doc.consignment_lines.reduce(
    (sum, l) => sum + (l.unit_price_paise ?? unitPricePaise(l.mrp_paise, share, Number(l.discount_pct ?? 0))) * l.quantity,
    0,
  );
}
```

`lib/retail/queries.ts`:

```ts
export const LINE_COLUMNS = "id, doc_id, variant_slug, product_name, size, quantity, mrp_paise, batch_line_id, unit_price_paise, discount_pct";
export const RATE_COLUMNS = "period, rate_pct";
```

Import `DiscountRate` with the other types. Replace `toDoc`:

```ts
const toDoc = (d: ConsignmentDoc): ConsignmentDoc => ({
  ...d,
  share_pct: d.share_pct === null ? null : Number(d.share_pct),
  consignment_lines: [...(d.consignment_lines ?? [])]
    .map((l) => ({ ...l, discount_pct: Number(l.discount_pct ?? 0) }))
    .sort((a, b) => a.product_name.localeCompare(b.product_name) || a.size.localeCompare(b.size) || a.mrp_paise - b.mrp_paise || a.discount_pct - b.discount_pct),
});
```

In `loadRetailerDetail`, add a fourth read and return field:

```ts
  const [balances, docs, payments, rates] = await Promise.all([
    /* the three existing reads unchanged */
    rows<DiscountRate>((f, t) =>
      admin.from("retailer_discount_rates").select(RATE_COLUMNS).eq("retailer_id", id)
        .order("period", { ascending: true }).order("rate_pct", { ascending: true }).range(f, t),
    ),
  ]);
```

and in the returned object, after `payments,`:

```ts
    discountRates: rates.map((r) => ({ period: r.period, rate_pct: Number(r.rate_pct) })),
```

`lib/retail/api-types.ts` — import `DiscountRate` and add to `RetailerDetail` after `payments`:

```ts
  /** Approved discount rates for every month of this shop. */
  discountRates: DiscountRate[];
```

Fixtures that build a `RetailerDetail`:
- `components/admin/retail/SalesPanel.test.tsx` line 13: return `{ retailer: retailer(), summary, holdings: ..., docs, payments: [], discountRates: [], today: "2026-11-08" }`.
- `app/admin/retail/[id]/retailer-client.test.tsx` detail object: add `discountRates: [],` after `payments: [payment()],`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/retail components/admin/retail app/admin/retail`
Expected: PASS (all existing retail tests still pass; the existing pricing assertions such as `unitPricePaise(99950, 75) === 74963` are unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/retail/types.ts lib/retail/pricing.ts lib/retail/pricing.test.ts lib/retail/queries.ts lib/retail/queries.test.ts lib/retail/api-types.ts lib/retail/__fixtures__/retail.ts components/admin/retail/SalesPanel.test.tsx "app/admin/retail/[id]/retailer-client.test.tsx"
git commit -m "feat(retail): price sale lines at their approved discount and load a shop's rates"
```

---

### Task 3: Request parsing, error messages, manual sale lines and the rates API

**Files:**
- Modify: `lib/retail/requests.ts`
- Modify: `lib/retail/rpc-errors.ts`
- Create: `app/api/admin/retail/[id]/rates/route.ts`
- Test: `lib/retail/requests.test.ts`, `lib/retail/rpc-errors.test.ts`, `app/api/admin/retail/[id]/docs/route.test.ts`, create `app/api/admin/retail/[id]/rates/route.test.ts`

**Interfaces:**
- Consumes: SQL `consignment_add_rate`, `consignment_remove_rate`, `consignment_save_sale` with `discount_pct` (Task 1).
- Produces:
  - `DISCOUNT_ERROR = "Discount must be above 0% and below 100%"` (requests.ts)
  - `parseRateInput(body: unknown, now: Date): Parsed<{ period: string; rate_pct: number }>`
  - `DocSave` sale lines: `{ variant_slug: string; quantity: number; discount_pct: number }[]`
  - `POST /api/admin/retail/[id]/rates` body `{ period, rate_pct }` → 201 `{ ok: true }`
  - `DELETE /api/admin/retail/[id]/rates?period=YYYY-MM&rate=10` → 200 `{ ok: true }`

- [ ] **Step 1: Write the failing tests**

`lib/retail/rpc-errors.test.ts` — add rows to the `it.each` table before `["something odd", ...]`:

```ts
    ["BAD_RATE", 400, "Discount must be above 0% and below 100%"],
    ["TOO_MANY_RATES", 409, "A month can have at most 4 discount rates"],
    ["RATE_IN_USE:10", 409, "The draft has sales at 10% off. Change the draft first"],
    ["RATE_NOT_APPROVED:12.5", 409, "12.5% isn't an approved discount for this month"],
```

`lib/retail/requests.test.ts` — add (import `parseRateInput`, `parseDocSave` as needed):

```ts
describe("parseRateInput", () => {
  const NOW = new Date("2026-10-09T06:00:00Z");
  it("accepts a rate for this month or an earlier one", () => {
    expect(parseRateInput({ period: "2026-10", rate_pct: 10 }, NOW)).toEqual({ ok: true, value: { period: "2026-10", rate_pct: 10 } });
    expect(parseRateInput({ period: "2026-09", rate_pct: 12.5 }, NOW)).toEqual({ ok: true, value: { period: "2026-09", rate_pct: 12.5 } });
  });
  it.each([
    [{ period: "2026-10", rate_pct: 0 }, "Discount must be above 0% and below 100%"],
    [{ period: "2026-10", rate_pct: 100 }, "Discount must be above 0% and below 100%"],
    [{ period: "2026-10", rate_pct: "10" }, "Discount must be above 0% and below 100%"],
    [{ period: "2026-10" }, "Discount must be above 0% and below 100%"],
    [{ period: "2026-10", rate_pct: 12.345 }, "Use at most two decimals"],
    [{ period: "2026-11", rate_pct: 10 }, "Pick a month up to this one"],
    [{ period: "October", rate_pct: 10 }, "Pick a month up to this one"],
  ])("refuses %j", (body, error) => {
    expect(parseRateInput(body, NOW)).toEqual({ ok: false, error });
  });
});

describe("parseDocSave sale discounts", () => {
  const NOW = new Date("2026-10-09T06:00:00Z");
  it("defaults a sale line's discount to 0 and keeps a given one", () => {
    const r = parseDocSave({ kind: "sale", period: "2026-09", lines: [{ variant_slug: "a", quantity: 1 }, { variant_slug: "a", quantity: 2, discount_pct: 10 }] }, NOW);
    expect(r).toEqual({ ok: true, value: { kind: "sale", period: "2026-09", lines: [{ variant_slug: "a", quantity: 1, discount_pct: 0 }, { variant_slug: "a", quantity: 2, discount_pct: 10 }] } });
  });
  it("refuses a discount of 100% or more", () => {
    expect(parseDocSave({ kind: "sale", period: "2026-09", lines: [{ variant_slug: "a", quantity: 1, discount_pct: 100 }] }, NOW).ok).toBe(false);
  });
});
```

`app/api/admin/retail/[id]/docs/route.test.ts` — add:

```ts
  it("passes each sale line's discount to the database", async () => {
    h.rpc.mockResolvedValue({ data: "doc-3", error: null });
    await post({ kind: "sale", period: "2026-09", lines: [{ variant_slug: "a", quantity: 1 }, { variant_slug: "a", quantity: 2, discount_pct: 10 }] });
    expect(h.rpc).toHaveBeenLastCalledWith("consignment_save_sale", {
      p_retailer_id: ID, p_period: "2026-09", p_actor: "admin-1",
      p_lines: [{ variant_slug: "a", quantity: 1, discount_pct: 0 }, { variant_slug: "a", quantity: 2, discount_pct: 10 }],
    });
  });
```

Create `app/api/admin/retail/[id]/rates/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER, CUSTOMER_USER } from "../../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, rpc: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({ rpc: h.rpc })),
}));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { DELETE, POST } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: ID }) };
const post = (body: unknown, id = ID) =>
  POST(new NextRequest(`http://localhost/api/admin/retail/${id}/rates`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id }) });
const del = (query: string) => DELETE(new NextRequest(`http://localhost/api/admin/retail/${ID}/rates?${query}`, { method: "DELETE" }), ctx);

beforeEach(() => {
  h.user = ADMIN_USER;
  h.rpc.mockReset();
  vi.mocked(createAdminSupabaseClient).mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T06:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("/api/admin/retail/[id]/rates", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await post({ period: "2026-10", rate_pct: 10 })).status).toBe(403);
    expect((await del("period=2026-10&rate=10")).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("approves a rate as the signed-in admin", async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    const res = await post({ period: "2026-10", rate_pct: 10, actor: "evil" });
    expect(res.status).toBe(201);
    expect(h.rpc).toHaveBeenCalledWith("consignment_add_rate", { p_retailer_id: ID, p_period: "2026-10", p_rate_pct: 10, p_actor: "admin-1" });
  });

  it("removes a rate", async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    expect((await del("period=2026-10&rate=12.5")).status).toBe(200);
    expect(h.rpc).toHaveBeenCalledWith("consignment_remove_rate", { p_retailer_id: ID, p_period: "2026-10", p_rate_pct: 12.5 });
  });

  it("400s a bad rate or month before calling the database", async () => {
    expect((await post({ period: "2026-10", rate_pct: 0 })).status).toBe(400);
    expect((await del("period=2026-10&rate=")).status).toBe(400);
    expect((await del("period=2026-11&rate=10")).status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("404s a malformed shop id", async () => {
    expect((await post({ period: "2026-10", rate_pct: 10 }, "nope")).status).toBe(404);
  });

  it("maps database refusals", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "RATE_IN_USE:10" } });
    const res = await del("period=2026-10&rate=10");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "The draft has sales at 10% off. Change the draft first" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/retail/requests.test.ts lib/retail/rpc-errors.test.ts "app/api/admin/retail/[id]"`
Expected: FAIL — `parseRateInput` not exported, `./route` missing under `rates`, new error codes map to 500, sale lines lack `discount_pct`.

- [ ] **Step 3: Implement**

`lib/retail/requests.ts`:

After `const slug = ...` add:

```ts
export const DISCOUNT_ERROR = "Discount must be above 0% and below 100%";
const discountPct = z.number().min(0, DISCOUNT_ERROR).lt(100, DISCOUNT_ERROR).multipleOf(0.01, "Use at most two decimals");
```

In `docSaveSchema`, the sale variant's lines become:

```ts
    lines: z.array(z.object({ variant_slug: slug, quantity, discount_pct: discountPct.default(0) })).max(500),
```

In `DocSave`, the sale member becomes:

```ts
  | { kind: "sale"; period: string; lines: { variant_slug: string; quantity: number; discount_pct: number }[] };
```

Add at the end of the file:

```ts
const rateSchema = z.object({
  period: z.unknown(),
  rate_pct: z
    .number({ required_error: DISCOUNT_ERROR, invalid_type_error: DISCOUNT_ERROR })
    .gt(0, DISCOUNT_ERROR)
    .lt(100, DISCOUNT_ERROR)
    .multipleOf(0.01, "Use at most two decimals"),
});

/** A discount rate to approve or remove for one month (up to the current IST month). */
export function parseRateInput(body: unknown, now: Date): Parsed<{ period: string; rate_pct: number }> {
  const parsed = rateSchema.safeParse(body ?? {});
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  const { period, rate_pct } = parsed.data;
  if (!isPeriod(period) || period > currentPeriod(now)) return { ok: false, error: "Pick a month up to this one" };
  return { ok: true, value: { period, rate_pct } };
}
```

(`isPeriod(v: unknown): v is string` in `lib/retail/dates.ts` narrows `period` to `string`.)

`lib/retail/rpc-errors.ts` — import `DISCOUNT_ERROR` alongside `CLOSED_MONTH_ERROR` and add cases before `default`:

```ts
    case "BAD_RATE":
      return { status: 400, error: DISCOUNT_ERROR };
    case "TOO_MANY_RATES":
      return { status: 409, error: "A month can have at most 4 discount rates" };
    case "RATE_IN_USE":
      return { status: 409, error: `The draft has sales at ${tail}% off. Change the draft first` };
    case "RATE_NOT_APPROVED":
      return { status: 409, error: `${tail}% isn't an approved discount for this month` };
```

Create `app/api/admin/retail/[id]/rates/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { isUuid, parseRateInput } from "@/lib/retail/requests";
import { retailRpcError } from "@/lib/retail/rpc-errors";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

function failed(error: { message: string }) {
  const mapped = retailRpcError(error.message);
  if (mapped.status === 500) console.error("[retail] rate change failed:", error);
  return NextResponse.json({ error: mapped.error }, { status: mapped.status });
}

/** Approves a discount rate for one shop and month (agreement clause 3.5). The actor is the verified session. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = parseRateInput(await request.json().catch(() => null), new Date());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { error } = await createAdminSupabaseClient().rpc("consignment_add_rate", {
    p_retailer_id: id, p_period: parsed.value.period, p_rate_pct: parsed.value.rate_pct, p_actor: gate.user.id,
  });
  if (error) return failed(error);
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Withdraws a rate, unless the month is issued or its draft has sales at that rate. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const q = request.nextUrl.searchParams;
  const rate = q.get("rate")?.trim();
  const parsed = parseRateInput({ period: q.get("period"), rate_pct: rate ? Number(rate) : undefined }, new Date());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { error } = await createAdminSupabaseClient().rpc("consignment_remove_rate", {
    p_retailer_id: id, p_period: parsed.value.period, p_rate_pct: parsed.value.rate_pct,
  });
  if (error) return failed(error);
  return NextResponse.json({ ok: true });
}
```

`app/api/admin/retail/[id]/docs/route.ts` needs no change (it passes `v.lines` through); the docs route test above pins it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/retail "app/api/admin/retail"`
Expected: PASS. (The existing docs-route test `p_lines: []` for an empty sale still passes.)

- [ ] **Step 5: Commit**

```bash
git add lib/retail/requests.ts lib/retail/requests.test.ts lib/retail/rpc-errors.ts lib/retail/rpc-errors.test.ts "app/api/admin/retail/[id]/rates" "app/api/admin/retail/[id]/docs/route.test.ts"
git commit -m "feat(retail): approve and withdraw discount rates; manual sale lines carry their rate"
```

---

### Task 4: Sales sheet v2 with one column per rate

**Files:**
- Modify: `lib/retail/sheet.ts`
- Modify: `app/api/admin/retail/[id]/sheet/route.ts` (GET line 35, POST line 76)
- Test: `lib/retail/sheet.test.ts`, `app/api/admin/retail/[id]/sheet/route.test.ts`

**Interfaces:**
- Consumes: `formatRate`, `ratesFor` (Task 2), `RetailerDetail.discountRates` (Task 2).
- Produces:
  - `TEMPLATE_ID = "cozyberries-retail-sales-v2"`
  - `BASE_COLUMNS = ["Code (do not edit)", "Product", "Size", "MRP", "You hold"] as const`
  - `salesColumns(rates: number[]): string[]`
  - `ratesLabel(rates: number[]): string` → `"10%, 20%"` or `"None"`
  - `SheetLine = { variant_slug: string; quantity: number; discount_pct: number }`
  - `buildSalesSheet({ shop, month, holdings, rates })`, `parseSalesSheet(sheets, { shop, month, holdings, rates })`
  - `SALES_COLUMNS` is removed (callers use `salesColumns([])`).

- [ ] **Step 1: Write the failing tests**

Replace `lib/retail/sheet.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import readExcelFile from "read-excel-file/node";
import { balance } from "./__fixtures__/retail";
import { holdingsFrom } from "./holdings";
import { ABOUT_SHEET, buildSalesSheet, parseSalesSheet, ratesLabel, SALES_SHEET, salesColumns, salesSheetFileName, TEMPLATE_ID, type ParsedSheet } from "./sheet";

const SHOP = { id: "11111111-1111-4111-8111-111111111111", name: "Kids Corner" };
const MONTH = "2026-10";
const HOLDINGS = holdingsFrom(
  [
    balance({ held: 3 }),
    balance({ batch_line_id: "b2", mrp_paise: 110000, held: 1, sent_on: "2026-10-05" }),
    balance({ batch_line_id: "c1", variant_slug: "bloom-romper-0-3m", product_name: "Bloom Romper", size: "0-3M", held: 2 }),
  ],
  "2026-10-31",
);
const expected = { shop: SHOP, month: MONTH, holdings: HOLDINGS, rates: [] as number[] };
const withRates = { ...expected, rates: [10, 12.5] };

function about(rates: number[], over: unknown[][] = []): unknown[][] {
  return over.length ? over : [["Shop", SHOP.name], ["Shop id", SHOP.id], ["Month", MONTH], ["Template", TEMPLATE_ID], ["Discounts", ratesLabel(rates)]];
}
function sheets(rows: unknown[][], rates: number[] = [], aboutRows?: unknown[][]): ParsedSheet[] {
  return [
    { sheet: SALES_SHEET, data: [salesColumns(rates), ...rows] as ParsedSheet["data"] },
    { sheet: ABOUT_SHEET, data: about(rates, aboutRows) as ParsedSheet["data"] },
  ];
}

describe("salesColumns", () => {
  it("adds one column per approved rate after full MRP", () => {
    expect(salesColumns([])).toEqual(["Code (do not edit)", "Product", "Size", "MRP", "You hold", "Sold at full MRP"]);
    expect(salesColumns([10, 12.5]).slice(5)).toEqual(["Sold at full MRP", "Sold at 10% off", "Sold at 12.5% off"]);
    expect(ratesLabel([10, 12.5])).toBe("10%, 12.5%");
    expect(ratesLabel([])).toBe("None");
  });
});

describe("buildSalesSheet", () => {
  it("writes one row per held size with blank Sold columns, and an About sheet with the discounts", async () => {
    const book = await readExcelFile(await buildSalesSheet(withRates));
    const sales = book.find((s) => s.sheet === SALES_SHEET)!.data;
    expect(sales[0]).toEqual(salesColumns([10, 12.5]));
    expect(sales.slice(1)).toEqual([
      ["bloom-romper-0-3m", "Bloom Romper", "0-3M", 1000, 2, null, null, null],
      ["petal-frock-1-2y", "Petal Pops Frock", "1-2Y", "1,000.00 / 1,100.00", 4, null, null, null],
    ]);
    const aboutRows = book.find((s) => s.sheet === ABOUT_SHEET)!.data;
    expect(aboutRows).toContainEqual(["Shop id", SHOP.id]);
    expect(aboutRows).toContainEqual(["Month", MONTH]);
    expect(aboutRows).toContainEqual(["Template", TEMPLATE_ID]);
    expect(aboutRows).toContainEqual(["Discounts", "10%, 12.5%"]);
  });

  it("round-trips: an untouched download parses as nothing sold", async () => {
    const book = await readExcelFile(await buildSalesSheet(withRates));
    expect(parseSalesSheet(book as ParsedSheet[], withRates)).toEqual({ ok: true, lines: [] });
  });

  it("names the file after the shop and month", () => {
    expect(salesSheetFileName("Kids Corner & Co.", "2026-10")).toBe("cozyberries-sales-kids-corner-co-2026-10.xlsx");
  });
});

describe("parseSalesSheet", () => {
  it("reads numbers, numeric text and blanks, and sums repeated codes", () => {
    const r = parseSalesSheet(
      sheets([
        ["petal-frock-1-2y", "Petal Pops Frock", "1-2Y", 1000, 4, 2],
        ["bloom-romper-0-3m", "Bloom Romper", "0-3M", 1000, 2, " 1 "],
        ["petal-frock-1-2y", "", "", null, null, "1.0"],
        ["bloom-romper-0-3m", "Bloom Romper", "0-3M", 1000, 2],
        [null, null, null, null, null, null],
      ]),
      expected,
    );
    expect(r).toEqual({
      ok: true,
      lines: [
        { variant_slug: "petal-frock-1-2y", quantity: 3, discount_pct: 0 },
        { variant_slug: "bloom-romper-0-3m", quantity: 1, discount_pct: 0 },
      ],
    });
  });

  it("returns one line per product and rate", () => {
    const r = parseSalesSheet(sheets([["petal-frock-1-2y", "", "", null, null, 1, 2, null], ["bloom-romper-0-3m", "", "", null, null, null, null, 1]], [10, 12.5]), withRates);
    expect(r).toEqual({
      ok: true,
      lines: [
        { variant_slug: "petal-frock-1-2y", quantity: 1, discount_pct: 0 },
        { variant_slug: "petal-frock-1-2y", quantity: 2, discount_pct: 10 },
        { variant_slug: "bloom-romper-0-3m", quantity: 1, discount_pct: 12.5 },
      ],
    });
  });

  it("checks held against the total across rate columns", () => {
    const r = parseSalesSheet(sheets([["bloom-romper-0-3m", "", "", null, null, 1, 1, 1]], [10, 12.5]), withRates);
    expect(r).toEqual({ ok: false, rowErrors: [{ row: 2, code: "bloom-romper-0-3m", message: "Sold 3 of Bloom Romper (0-3M) but the shop holds 2" }] });
  });

  it("reports each bad row with its spreadsheet row number and column", () => {
    const r = parseSalesSheet(
      sheets(
        [
          ["petal-frock-1-2y", "", "", null, null, 2.5, null],
          ["bloom-romper-0-3m", "", "", null, null, null, -1],
          ["ghost-code", "", "", null, null, 1, null],
          [null, "", "", null, null, null, 3],
          ["ghost-zero", "", "", null, null, 0, null],
        ],
        [10],
      ),
      { ...expected, rates: [10] },
    );
    expect(r).toEqual({
      ok: false,
      rowErrors: [
        { row: 2, code: "petal-frock-1-2y", message: 'Sold at full MRP must be a whole number of pieces (found "2.5")' },
        { row: 3, code: "bloom-romper-0-3m", message: 'Sold at 10% off must be a whole number of pieces (found "-1")' },
        { row: 4, code: "ghost-code", message: "ghost-code is not stock this shop holds" },
        { row: 5, code: "", message: "This row has a quantity but no code" },
      ],
    });
  });

  it("refuses selling more than the shop holds, at the code's first row", () => {
    const r = parseSalesSheet(sheets([["bloom-romper-0-3m", "", "", null, null, 2], ["bloom-romper-0-3m", "", "", null, null, 1]]), expected);
    expect(r).toEqual({ ok: false, rowErrors: [{ row: 2, code: "bloom-romper-0-3m", message: "Sold 3 of Bloom Romper (0-3M) but the shop holds 2" }] });
  });

  it("refuses a sheet for another shop or month, an old template, or changed columns", () => {
    const wrong = "Please use the sheet downloaded for Kids Corner, Oct 2026";
    expect(parseSalesSheet(sheets([], [], [["Shop id", "other"], ["Month", MONTH], ["Template", TEMPLATE_ID], ["Discounts", "None"]]), expected)).toEqual({ ok: false, fileError: wrong });
    expect(parseSalesSheet(sheets([], [], [["Shop id", SHOP.id], ["Month", "2026-09"], ["Template", TEMPLATE_ID], ["Discounts", "None"]]), expected)).toEqual({ ok: false, fileError: wrong });
    expect(parseSalesSheet(sheets([], [], [["Shop id", SHOP.id], ["Month", MONTH], ["Template", "cozyberries-retail-sales-v1"]]), expected)).toEqual({ ok: false, fileError: wrong });
    expect(parseSalesSheet([{ sheet: "Sheet1", data: [] }], expected)).toEqual({ ok: false, fileError: wrong });
    const renamed = sheets([]);
    renamed[0].data[0] = ["Code", "Product", "Size", "MRP", "You hold", "Sold"];
    expect(parseSalesSheet(renamed, expected)).toEqual({ ok: false, fileError: `${wrong}. Its column headings were changed.` });
  });

  it("refuses a sheet whose discounts changed after it was downloaded", () => {
    const msg = "The discount rates for Oct 2026 changed after this sheet was downloaded. Download it again.";
    // Downloaded with 10%, and 10% was then removed.
    expect(parseSalesSheet(sheets([], [10]), expected)).toEqual({ ok: false, fileError: msg });
    // Downloaded with none, and 10% was then added.
    expect(parseSalesSheet(sheets([], []), { ...expected, rates: [10] })).toEqual({ ok: false, fileError: msg });
  });
});
```

In `app/api/admin/retail/[id]/sheet/route.test.ts`:

1. Change the `beforeEach` mock to `h.loadRetailerDetail.mockResolvedValue({ retailer: retailer(), holdings: HOLDINGS, discountRates: [] });`
2. Replace `filled()` so it can fill any Sold column and build with rates:

```ts
async function filled(cells: Record<number, number | null>, month = "2026-09", rates: number[] = []): Promise<Blob> {
  const book = await readExcelFile(await buildSalesSheet({ shop: SHOP, month, holdings: HOLDINGS, rates }));
  const { default: writeExcelFile } = await import("write-excel-file/node");
  const cell = (v: unknown) => (v === null || v === undefined ? null : { value: v, type: typeof v === "number" ? Number : String });
  const data = book.map((s) => ({
    sheet: s.sheet,
    data: s.data.map((r, i) => r.map((v, j) => (s.sheet === "Sales" && i === 1 && j in cells ? cell(cells[j]) : cell(v)))),
  }));
  const buffer = await writeExcelFile(data as never).toBuffer();
  return new Blob([new Uint8Array(buffer)]);
}
```

3. Update callers: `filled(2)` → `filled({ 5: 2 })`, `filled(9)` → `filled({ 5: 9 })`, `filled(1, "2026-08")` → `filled({ 5: 1 }, "2026-08")`.
4. Update the expected RPC call in "turns a filled sheet into the month's draft" to `p_lines: [{ variant_slug: "petal-frock-1-2y", quantity: 2, discount_pct: 0 }]`.
5. Add:

```ts
  it("reads the month's discount columns and passes each rate", async () => {
    h.loadRetailerDetail.mockResolvedValue({ retailer: retailer(), holdings: HOLDINGS, discountRates: [{ period: "2026-09", rate_pct: 10 }, { period: "2026-08", rate_pct: 20 }] });
    h.rpc.mockResolvedValue({ data: "doc-9", error: null });
    const res = await upload(await filled({ 5: 1, 6: 2 }, "2026-09", [10]));
    expect(res.status).toBe(201);
    expect(h.rpc).toHaveBeenCalledWith("consignment_save_sale", {
      p_retailer_id: ID, p_period: "2026-09", p_actor: "admin-1",
      p_lines: [{ variant_slug: "petal-frock-1-2y", quantity: 1, discount_pct: 0 }, { variant_slug: "petal-frock-1-2y", quantity: 2, discount_pct: 10 }],
    });
  });

  it("downloads a sheet with a column per approved rate for that month", async () => {
    h.loadRetailerDetail.mockResolvedValue({ retailer: retailer(), holdings: HOLDINGS, discountRates: [{ period: "2026-09", rate_pct: 10 }] });
    const res = await GET(new NextRequest(`http://localhost/x?month=2026-09`), ctx);
    const book = await readExcelFile(Buffer.from(await res.arrayBuffer()));
    expect(book.find((s) => s.sheet === "Sales")!.data[0]).toContain("Sold at 10% off");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/retail/sheet.test.ts "app/api/admin/retail/[id]/sheet"`
Expected: FAIL — `salesColumns`/`ratesLabel` not exported, lines lack `discount_pct`, template id is v1.

- [ ] **Step 3: Implement**

`lib/retail/sheet.ts` — replace the constants block through `parseSalesSheet` (keep `salesSheetFileName`, `parseSold`, `str`, `text`, `head`, `RUPEES`, `mrpCell` as they are) with:

```ts
import { formatRate } from "./pricing";

/** Server-only: the monthly sales sheet a shop fills in, and the parser for the filled copy. */
export const SALES_SHEET = "Sales";
export const ABOUT_SHEET = "About";
export const TEMPLATE_ID = "cozyberries-retail-sales-v2";
export const BASE_COLUMNS = ["Code (do not edit)", "Product", "Size", "MRP", "You hold"] as const;
const FULL_PRICE = "Sold at full MRP";
const FIRST_SOLD = BASE_COLUMNS.length;

/** The Sales sheet headings for a month with these approved rates (ascending). */
export function salesColumns(rates: number[]): string[] {
  return [...BASE_COLUMNS, FULL_PRICE, ...rates.map((r) => `Sold at ${formatRate(r)}% off`)];
}

/** "10%, 12.5%", or "None": the About sheet's Discounts row. */
export function ratesLabel(rates: number[]): string {
  return rates.length ? rates.map((r) => `${formatRate(r)}%`).join(", ") : "None";
}

export interface SheetShop {
  id: string;
  name: string;
}

export type Cell = string | number | boolean | Date | null;
export interface ParsedSheet {
  sheet: string;
  data: Cell[][];
}
export interface SheetLine {
  variant_slug: string;
  quantity: number;
  /** 0 = full MRP. */
  discount_pct: number;
}
export type ParseResult =
  | { ok: true; lines: SheetLine[] }
  | { ok: false; fileError: string; rowErrors?: undefined }
  | { ok: false; rowErrors: RowError[]; fileError?: undefined };
```

`buildSalesSheet`:

```ts
export async function buildSalesSheet({ shop, month, holdings, rates }: { shop: SheetShop; month: string; holdings: Holding[]; rates: number[] }): Promise<Buffer> {
  const columns = salesColumns(rates);
  const blanks = columns.slice(FIRST_SOLD).map(() => null);
  const sales: SheetData = [
    head(columns),
    ...holdings.map((h) => [text(h.variantSlug), text(h.productName), text(h.size), mrpCell(h), { value: h.held, type: Number }, ...blanks]),
  ];
  const how = rates.length
    ? `Type how many pieces of each size sold in ${monthLabel(month)}: at full MRP in "${FULL_PRICE}", and at an approved discount in its "Sold at …% off" column. Leave a cell blank if none sold.`
    : `Type how many pieces of each size sold in ${monthLabel(month)} in the "${FULL_PRICE}" column of the Sales sheet. Leave it blank if none sold.`;
  const about: SheetData = [
    [text("Shop"), text(shop.name)],
    [text("Shop id"), text(shop.id)],
    [text("Month"), text(month)],
    [text("Template"), text(TEMPLATE_ID)],
    [text("Discounts"), text(ratesLabel(rates))],
    [],
    [text("How to fill"), text(how)],
    [text("Do not edit"), text("This sheet, the codes, or any column heading. Send the file back as it is.")],
  ];
  return writeExcelFile([
    {
      sheet: SALES_SHEET,
      data: sales,
      columns: [{ width: 30 }, { width: 36 }, { width: 10 }, { width: 18 }, { width: 10 }, ...blanks.map(() => ({ width: 18 }))],
      stickyRowsCount: 1,
    },
    { sheet: ABOUT_SHEET, data: about, columns: [{ width: 14 }, { width: 90 }] },
  ]).toBuffer();
}
```

`parseSalesSheet`:

```ts
export function parseSalesSheet(
  sheets: ParsedSheet[],
  expected: { shop: SheetShop; month: string; holdings: Pick<Holding, "variantSlug" | "held" | "productName" | "size">[]; rates: number[] },
): ParseResult {
  const wrongFile = `Please use the sheet downloaded for ${expected.shop.name}, ${monthLabel(expected.month)}`;
  const about = sheets.find((s) => s.sheet === ABOUT_SHEET);
  const sales = sheets.find((s) => s.sheet === SALES_SHEET);
  if (!about || !sales) return { ok: false, fileError: wrongFile };

  const meta = new Map(about.data.map((r) => [str(r[0]), str(r[1])] as const));
  if (meta.get("Template") !== TEMPLATE_ID || meta.get("Shop id") !== expected.shop.id || meta.get("Month") !== expected.month) {
    return { ok: false, fileError: wrongFile };
  }
  if (meta.get("Discounts") !== ratesLabel(expected.rates)) {
    return { ok: false, fileError: `The discount rates for ${monthLabel(expected.month)} changed after this sheet was downloaded. Download it again.` };
  }
  const columns = salesColumns(expected.rates);
  const header = (sales.data[0] ?? []).map(str);
  if (columns.some((label, i) => header[i] !== label) || header.slice(columns.length).some((h) => h !== "")) {
    return { ok: false, fileError: `${wrongFile}. Its column headings were changed.` };
  }
  const soldRates = [0, ...expected.rates];

  const held = new Map(expected.holdings.map((h) => [h.variantSlug, h]));
  const totals = new Map<string, { quantity: number; firstRow: number; byRate: number[] }>();
  const errors: RowError[] = [];

  sales.data.slice(1).forEach((r, i) => {
    const row = i + 2;
    const code = str(r[0]);
    const counts: number[] = [];
    for (let k = 0; k < soldRates.length; k++) {
      const cell = r[FIRST_SOLD + k];
      const sold = parseSold(cell);
      if (sold.kind === "bad") {
        errors.push({ row, code, message: `${columns[FIRST_SOLD + k]} must be a whole number of pieces (found "${str(cell)}")` });
        return;
      }
      counts.push(sold.kind === "ok" ? sold.value : 0);
    }
    const quantity = counts.reduce((a, b) => a + b, 0);
    if (!code) {
      if (quantity > 0) errors.push({ row, code: "", message: "This row has a quantity but no code" });
      return;
    }
    if (!held.has(code)) {
      if (quantity > 0) errors.push({ row, code, message: `${code} is not stock this shop holds` });
      return;
    }
    const t = totals.get(code);
    if (t) {
      t.quantity += quantity;
      counts.forEach((c, k) => (t.byRate[k] += c));
    } else {
      totals.set(code, { quantity, firstRow: row, byRate: counts });
    }
  });

  for (const [code, t] of totals) {
    const h = held.get(code)!;
    if (t.quantity > h.held) {
      errors.push({ row: t.firstRow, code, message: `Sold ${t.quantity} of ${h.productName} (${h.size}) but the shop holds ${h.held}` });
    }
  }
  if (errors.length) return { ok: false, rowErrors: errors.sort((a, b) => a.row - b.row) };
  return {
    ok: true,
    lines: [...totals].flatMap(([variant_slug, t]) =>
      t.byRate.flatMap((quantity, k) => (quantity > 0 ? [{ variant_slug, quantity, discount_pct: soldRates[k] }] : [])),
    ),
  };
}
```

`app/api/admin/retail/[id]/sheet/route.ts` — import `ratesFor` from `@/lib/retail/pricing`, then:
- GET: `const file = await buildSalesSheet({ shop: { id, name }, month, holdings: detail.holdings, rates: ratesFor(detail.discountRates, month) });`
- POST: `const parsed = parseSalesSheet(sheets, { shop: { id, name: shopName(detail.retailer) }, month, holdings: detail.holdings, rates: ratesFor(detail.discountRates, month) });`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/retail "app/api/admin/retail"`
Expected: PASS. Also `grep -rn "SALES_COLUMNS" app lib components` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add lib/retail/sheet.ts lib/retail/sheet.test.ts "app/api/admin/retail/[id]/sheet"
git commit -m "feat(retail): sales sheet v2 with a Sold column per approved discount"
```

---

### Task 5: Invoice document and PDF show the discount

**Files:**
- Modify: `lib/retail/documents.ts` (`RetailInvoiceDocument.lines`, `buildRetailInvoice`)
- Modify: `lib/retail/pdf.tsx` (styles, invoice table, footer sentence)
- Test: `lib/retail/documents.test.ts`, `lib/retail/pdf.test.ts`

**Interfaces:**
- Consumes: `PricedSaleLine.discountPct`, `formatRate` (Task 2).
- Produces:
  - `RetailInvoiceDocument.lines: (InvoiceLine & { mrpPaise: number; discountPct: number })[]`
  - `invoiceBasis(sharePct: number): string` exported from `pdf.tsx`
  - `discountCell(pct: number): string` exported from `pdf.tsx` → `"10%"` or `"—"`

- [ ] **Step 1: Write the failing tests**

`lib/retail/documents.test.ts` — add inside the invoice `describe` (reuse its `GSTIN` constant and fixture imports):

```ts
  it("carries each line's discount and prices it at the share of the selling price", () => {
    const inv = buildRetailInvoice({
      doc: doc({ status: "draft", number: null, share_pct: null, consignment_lines: [line({ mrp_paise: 92300 }), line({ id: "l2", mrp_paise: 92300, discount_pct: 10 })] }),
      retailer: retailer(),
      gstin: GSTIN,
      challanNumbers: [],
    });
    expect(inv.lines.map((l) => [l.mrpPaise, l.discountPct, l.unitPricePaise])).toEqual([
      [92300, 0, 69225],
      [92300, 10, 62303],
    ]);
    expect(inv.totals.totalPaise).toBe(69225 + 62303);
  });
```

`lib/retail/pdf.test.ts` — import `invoiceBasis, discountCell` and add:

```ts
describe("invoice wording", () => {
  it("states the basis as the share of the selling price", () => {
    expect(invoiceBasis(75)).toBe("Supply on sale-or-return basis at 75% of the selling price (MRP less any approved discount)");
  });
  it("shows a line's discount, or a dash at full MRP", () => {
    expect(discountCell(10)).toBe("10%");
    expect(discountCell(12.5)).toBe("12.5%");
    expect(discountCell(0)).toBe("—");
  });
  it("renders an invoice with a discounted line", async () => {
    const pdf = await renderRetailInvoicePdf(buildRetailInvoice({ doc: doc({ consignment_lines: [line({ batch_line_id: "b", discount_pct: 10, unit_price_paise: 67500 })] }), retailer: retailer(), gstin: GSTIN, challanNumbers: [] }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 20_000);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/retail/documents.test.ts lib/retail/pdf.test.ts`
Expected: FAIL — `discountPct` undefined on lines, `invoiceBasis`/`discountCell` not exported.

- [ ] **Step 3: Implement**

`lib/retail/documents.ts`:
- In `RetailInvoiceDocument`: `lines: (InvoiceLine & { mrpPaise: number; discountPct: number })[];`
- In `buildRetailInvoice`: `lines: gst.lines.map((l, i) => ({ ...l, mrpPaise: priced[i].mrpPaise, discountPct: priced[i].discountPct })),`

`lib/retail/pdf.tsx`:
- Import `formatRate` from `./pricing`.
- Add after `challanHeading`:

```ts
/** The invoice note's basis line (agreement clause 6.1). */
export function invoiceBasis(sharePct: number): string {
  return `Supply on sale-or-return basis at ${sharePct}% of the selling price (MRP less any approved discount)`;
}

/** A line's discount for the Disc. column. */
export function discountCell(pct: number): string {
  return pct ? `${formatRate(pct)}%` : "—";
}
```

- In the styles, change `iItem: { width: "24%", paddingRight: 8 }` to `iItem: { width: "18%", paddingRight: 8 }` and add `iDisc: { width: "6%", textAlign: "right" },` (columns still total 100%).
- In the invoice header row, after `<Text style={s.iMrp}>MRP</Text>` add `<Text style={s.iDisc}>Disc.</Text>`.
- In each line row, after `<Text style={s.iMrp}>{rs(l.mrpPaise)}</Text>` add `<Text style={s.iDisc}>{discountCell(l.discountPct)}</Text>`.
- Replace the note text `Supply on sale-or-return basis at {doc.sharePct}% of MRP` with `{invoiceBasis(doc.sharePct)}` (keep the challan-numbers suffix and the final `.`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/retail lib/gst`
Expected: PASS (the GST register tests read `buildRetailInvoice` and must still pass unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/retail/documents.ts lib/retail/documents.test.ts lib/retail/pdf.tsx lib/retail/pdf.test.ts
git commit -m "feat(retail): invoice shows each line's discount and bills the share of the selling price"
```

---

### Task 6: Sales panel — rate chips, per-rate manual entry, preview

**Files:**
- Modify: `components/admin/retail/SalesPanel.tsx`
- Test: `components/admin/retail/SalesPanel.test.tsx`

**Interfaces:**
- Consumes: `ratesFor`, `formatRate`, `PricedSaleLine.discountPct` (Task 2); `POST|DELETE /api/admin/retail/[id]/rates` (Task 3); sale `lines[].discount_pct` on `POST /api/admin/retail/[id]/docs` (Task 3).
- Produces: UI only.

- [ ] **Step 1: Write the failing tests**

In `components/admin/retail/SalesPanel.test.tsx`, change `detail()` to accept rates:

```ts
function detail(docs = [] as RetailerDetail["docs"], discountRates: RetailerDetail["discountRates"] = []): RetailerDetail {
  return { retailer: retailer(), summary, holdings: holdingsFrom([balance()], "2026-11-08"), docs, payments: [], discountRates, today: "2026-11-08" };
}
```

Add tests:

```ts
  it("lists the month's discounts and adds one", async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const onChanged = vi.fn();
    render(<SalesPanel detail={detail([], [{ period: "2026-10", rate_pct: 10 }, { period: "2026-09", rate_pct: 30 }])} onChanged={onChanged} />);
    // "10% off" also labels a manual-entry input, so find the chip by its remove button.
    expect(screen.getByRole("button", { name: "Remove 10% off" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove 30% off" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New discount %"), { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add discount" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/retail/${retailer().id}/rates`, expect.objectContaining({ method: "POST", body: JSON.stringify({ period: "2026-10", rate_pct: 12.5 }) }));
  });

  it("removes a discount", async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const onChanged = vi.fn();
    render(<SalesPanel detail={detail([], [{ period: "2026-10", rate_pct: 10 }])} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove 10% off" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/retail/${retailer().id}/rates?period=2026-10&rate=10`, expect.objectContaining({ method: "DELETE" }));
  });

  it("types quantities per discount and saves them as lines", async () => {
    const fetchMock = vi.fn(async () => json({ doc_id: "d9" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    render(<SalesPanel detail={detail([], [{ period: "2026-10", rate_pct: 10 }])} onChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Sold Petal Pops Frock 1-2Y at full MRP"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Sold Petal Pops Frock 1-2Y at 10% off"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/retail/${retailer().id}/docs`, expect.objectContaining({
      body: JSON.stringify({
        kind: "sale",
        period: "2026-10",
        lines: [
          { variant_slug: "petal-frock-1-2y", quantity: 1, discount_pct: 0 },
          { variant_slug: "petal-frock-1-2y", quantity: 2, discount_pct: 10 },
        ],
      }),
    }));
  });

  it("previews a discounted line with its rate", () => {
    const draft = doc({ id: "d1", status: "draft", number: null, share_pct: null, period: "2026-10", consignment_lines: [line({ mrp_paise: 92300, discount_pct: 10, batch_line_id: "batch-1" })] });
    render(<SalesPanel detail={detail([draft], [{ period: "2026-10", rate_pct: 10 }])} onChanged={vi.fn()} />);
    expect(screen.getByTestId("sale-preview")).toHaveTextContent("Petal Pops Frock (1-2Y) × 1 · MRP ₹923.00 · 10% off · ₹623.03 each");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/admin/retail/SalesPanel.test.tsx`
Expected: FAIL — no "New discount %" input, no per-rate inputs, preview lacks "10% off".

- [ ] **Step 3: Implement**

In `components/admin/retail/SalesPanel.tsx`:

1. Change the pricing import to `import { formatRate, priceSaleLines, ratesFor, retailGst } from "@/lib/retail/pricing";`.
2. After `const [manual, setManual] = ...` add:

```ts
  const [newRate, setNewRate] = useState("");
  const rates = ratesFor(detail.discountRates, month);
  const soldRates = [0, ...rates];
  const manualKey = (slug: string, rate: number) => `${slug}|${rate}`;
  const rateLabel = (rate: number) => (rate ? `at ${formatRate(rate)}% off` : "at full MRP");
```

3. Replace `saveManual`:

```ts
  const saveManual = () =>
    void run(() =>
      sendJson(`/api/admin/retail/${retailer.id}/docs`, {
        kind: "sale",
        period: month,
        lines: detail.holdings.flatMap((h) =>
          soldRates.map((rate) => ({ variant_slug: h.variantSlug, quantity: Number(manual[manualKey(h.variantSlug, rate)] || 0), discount_pct: rate })),
        ),
      }),
    );

  const addRate = () =>
    void run(async () => {
      await sendJson(`/api/admin/retail/${retailer.id}/rates`, { period: month, rate_pct: Number(newRate) });
      setNewRate("");
    });

  const removeRate = (rate: number) =>
    void run(() => retailFetch(`/api/admin/retail/${retailer.id}/rates?period=${month}&rate=${rate}`, { method: "DELETE" }));
```

(The server drops zero-quantity lines in `parseDocSave`, so sending every holding × rate is fine.)

4. In the issued branch, after the "Dated …" paragraph add:

```tsx
          {rates.length > 0 && <p className="text-sm text-cb-muted-fg">Discounts: {rates.map((r) => `${formatRate(r)}%`).join(", ")}</p>}
```

5. In the not-issued branch, insert before the "Send the shop this month's sheet" section:

```tsx
          <section className="grid gap-2 rounded-2xl border border-cb-border bg-cb-white p-4">
            <p className="text-sm font-semibold">Discounts for {monthLabel(month)}</p>
            <div className="flex flex-wrap items-center gap-2">
              {rates.length === 0 && <span className="text-sm text-cb-muted-fg">None: everything sells at full MRP.</span>}
              {rates.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 rounded-full border border-cb-border px-3 py-1 text-sm">
                  <span>{formatRate(r)}% off</span>
                  <button type="button" aria-label={`Remove ${formatRate(r)}% off`} disabled={busy} onClick={() => removeRate(r)} className="ml-1 text-cb-muted-fg hover:text-red-700">×</button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="rate-input" className="sr-only">New discount %</Label>
              <Input id="rate-input" type="number" inputMode="decimal" min={0.01} max={99.99} step={0.01} placeholder="%" className="w-24"
                value={newRate} onChange={(e) => setNewRate(e.target.value)} />
              <Button size="sm" variant="outline" disabled={busy || newRate.trim() === ""} onClick={addRate}>Add discount</Button>
            </div>
            {rates.length > 0 && <p className="text-xs text-cb-muted-fg">Download the sheet again after changing discounts.</p>}
          </section>
```

6. Preview list item becomes:

```tsx
                  {priced.map((l, i) => (
                    <li key={i}>
                      {l.description} × {l.quantity} · MRP {formatPaise(l.mrpPaise)}
                      {l.discountPct ? ` · ${formatRate(l.discountPct)}% off` : ""} · {formatPaise(l.unitPricePaise)} each
                    </li>
                  ))}
```

7. Manual entry: replace the `detail.holdings.map(...)` block inside `<details>` with:

```tsx
              {detail.holdings.map((h) => (
                <div key={h.variantSlug} className="grid gap-1">
                  <span>{h.productName} ({h.size}) · holds {h.held}</span>
                  <div className="flex flex-wrap gap-2">
                    {soldRates.map((rate) => (
                      <label key={rate} className="flex items-center gap-1 text-xs text-cb-muted-fg">
                        {rate ? `${formatRate(rate)}% off` : "Full MRP"}
                        <Input type="number" inputMode="numeric" min={0} max={h.held} className="w-20"
                          value={manual[manualKey(h.variantSlug, rate)] ?? ""}
                          onChange={(e) => setManual((m) => ({ ...m, [manualKey(h.variantSlug, rate)]: e.target.value }))}
                          aria-label={`Sold ${h.productName} ${h.size} ${rateLabel(rate)}`} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
```

Check the formatted output against the test: `formatPaise(92300)` must render `₹923.00` (it does for `₹1,500.00` in the existing test).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/admin/retail app/admin/retail`
Expected: PASS, including the existing "previews a draft at 75% of MRP" test (rate 0 renders no "off").

- [ ] **Step 5: Commit**

```bash
git add components/admin/retail/SalesPanel.tsx components/admin/retail/SalesPanel.test.tsx
git commit -m "feat(retail): manage a month's discounts and enter sales per discount on the Sales tab"
```

---

### Task 7: Docs and whole-branch verification

**Files:**
- Modify: `CLAUDE.md` ("Retail consignment" section; route list line for `/api/admin/retail/*`)
- Modify: `docs/superpowers/specs/2026-10-08-retail-consignment-design.md` (Implementation notes)
- Modify: `docs/superpowers/specs/2026-10-09-retail-approved-discounts-design.md` (Status)

**Interfaces:** none.

- [ ] **Step 1: Update docs**

In `CLAUDE.md`, "Retail consignment", after the bullet that starts "All writes go through `consignment_save_challan|return|sale`…", add:

```markdown
- Approved discounts (agreement revised 2026-10-09; spec `docs/superpowers/specs/2026-10-09-retail-approved-discounts-design.md`): Cozyberries approves up to 4 rates per shop per month (`retailer_discount_rates`, admin tier, via `consignment_add_rate` / `consignment_remove_rate` and `POST|DELETE /api/admin/retail/[id]/rates`). Sale lines carry `discount_pct` (0 = full MRP) and are invoiced at `round(MRP × (100 − rate) × share / 10000)`, so a discount is borne 75 : 25. A rate can't be removed while the month's draft uses it (`RATE_IN_USE`) or once the month is issued; save and issue refuse unapproved rates (`RATE_NOT_APPROVED`). The ₹2,500 check runs on the discounted price. Sheet template v2 has "Sold at full MRP" plus one "Sold at N% off" column per rate; an upload whose rates no longer match is refused ("download it again").
```

In the same section's "Monthly flow" bullet, change "the shop fills "Sold this month"" to "the shop fills the Sold columns (full MRP and each approved discount)".

In `docs/superpowers/specs/2026-10-08-retail-consignment-design.md` "Implementation notes", add a last bullet:

```markdown
- 2026-10-09: sale lines can carry an approved discount (`discount_pct`); see `2026-10-09-retail-approved-discounts-design.md`. `unit_price_paise = round(mrp × (100 − discount) × share / 10000)`.
```

In the new spec, change `**Status:**` to `approved 2026-10-09; plan at docs/superpowers/plans/2026-10-09-retail-approved-discounts.md`.

- [ ] **Step 2: Run the full checks**

```bash
npm run lint
npx tsc --noEmit
npm run test:unit
```

Expected: lint clean, no type errors, all vitest suites pass. Fix anything that fails before continuing (a type error usually means a `RetailerDetail` or `ConsignmentLine` literal somewhere still lacks `discountRates` / `discount_pct`).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-08-retail-consignment-design.md docs/superpowers/specs/2026-10-09-retail-approved-discounts-design.md docs/superpowers/plans/2026-10-09-retail-approved-discounts.md
git commit -m "docs(retail): approved discounts"
```

- [ ] **Step 4: Hand the live steps to the owner**

Claude cannot read or write live Supabase. Give the owner these lines, in this order, **before** the code is deployed (the new code selects `discount_pct` and `retailer_discount_rates`; the old code keeps working against the migrated database because the column defaults to 0):

```bash
! npm run db:test-retail
! psql "$(grep '^POSTGRES_URL_NON_POOLING=' /Users/abdul.azeez/Personal/cozyberries/vercel-frontend/.env.local | cut -d= -f2- | tr -d '"')" -1 -f supabase/migrations/20261009120000_retail_discount_rates.sql
! npm run db:probe
! npm run db:lint
```

Expected: `db:test-retail` prints 49 PASS lines; the migration applies in one transaction; `db:probe` passes `admin_tables_are_service_role_only`; `db:lint` reports no new ERROR.
