# Retail consignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins place stock in GST-registered retail shops on sale-or-return, take monthly sales back as an uploaded `.xlsx`, issue a B2B tax invoice for Cozyberries' share (75% of MRP, GST included), take unsold stock back, record payments, and carry shop invoices and challans in the GST sales register.

**Architecture:** Five admin/internal-tier tables (`retailers`, `consignment_docs`, `consignment_lines`, `retailer_payments`, `consignment_counters`) and one view (`retailer_batch_balances`), written only through plpgsql functions granted to `service_role` (same shape as `stall_refill_*`). Pure TypeScript in `lib/retail/` does GSTIN checks, pricing (reusing `computeGst`), aging, holdings, the sales sheet and the PDF documents. `/api/admin/retail/*` routes call `requireAdmin()` before any service-role client. Pages live under `/admin/retail`. The GST register gains B2B, HSN B2B and challan runs.

**Tech Stack:** Next.js 15 App Router, Supabase Postgres (plpgsql), TypeScript, zod 3, `write-excel-file` 4, `read-excel-file` 9, `@react-pdf/renderer`, TanStack Query 5, vitest 4 + Testing Library, psql assertion scripts.

**Spec:** `docs/superpowers/specs/2026-10-08-retail-consignment-design.md`

## Global Constraints

- Branch `feature/retail-consignment`. Never commit to `main` or `develop`. The owner's standing rule is "no commits unless asked": confirm at the start of execution that per-task commits are wanted; if not, skip every "Commit" step and leave the changes in the working tree.
- Claude cannot read or write the live Supabase database. Every `npm run db:*` command and every migration apply is handed to the owner as a `! …` command, and Claude waits for the pasted output.
- Every new table is admin/internal tier: RLS enabled and forced, `revoke all … from public, anon, authenticated`, grants to `service_role` only, no policies.
- Every function: `set search_path = ''`, fully qualified names, `revoke all on function … from public, anon, authenticated`, `grant execute … to service_role`.
- Every `/api/admin/retail/*` handler calls `requireAdmin()` (`lib/services/admin-gate.ts`) before `createAdminSupabaseClient()`. The actor is always `gate.user.id`, never the request body.
- Money is integer paise everywhere in the new code. Our share default is `75` (%), stored per shop as `our_share_pct numeric(5,2)`, `0 < x < 100`.
- Unit price = `round(mrp_paise × share_pct / 100)`; GST is worked out of the line totals once by `computeGst` (5%, HSN `6111`). Intra-state when the shop's state code equals the seller's (`29`).
- Number series: challans `CBC/yy-yy/NNNN`, shop invoices `CBR/yy-yy/NNNN`, returns `RET/yy-yy/NNNN`; financial year from the document date (`public.gst_financial_year`). `CB/…` and `invoice_counters` are untouched.
- A sale's `doc_date` is `least(last day of period, today IST)`. A shop invoice can be cancelled only before 00:00 IST on the 11th of the month after its period.
- Six-month rule: amber from `sent_on + 5 months`, red from `sent_on + 6 months` (Section 31(7)).
- PDFs and the sheet download: `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`.
- Static-page rule from CLAUDE.md: no `useSearchParams()`; admin pages are `force-dynamic` client pages like `/admin/stock`.
- Free tiers only: no new services, no Redis caching for this feature.
- `lib/retail/sheet.ts`, `lib/retail/pdf.tsx`, `lib/retail/queries.ts` are server-only; client components import only `types`, `api-types`, `dates`, `aging`, `gstin`, `pricing`, `holdings`, `client`.

## Review Focus

1. **Double tap on "Issue"** (two phones, or a retry): the second call must fail with `NOT_DRAFT`, never decrement stock twice. Pinned in Task 2 (`issue_twice_refused`).
2. **Excel re-saves the sheet with "2" as text, "2.0", trailing blank rows, or a blank Sold cell dropped from the row**: parsed as 2, 2, ignored, 0. "2.5" or "-1" is a row error. Pinned in Task 4.
3. **A variant slug renamed after stock was sent**: lines follow the rename (`on update cascade`); an old sheet then shows "not stock this shop holds" for that row rather than crashing. Pinned in Task 1 (`variant_rename_cascades`) and Task 4.
4. **March sales invoiced in April**: the invoice is numbered in the old financial year's series because the number follows the document date. Pinned in Task 2 (`sale_number_uses_invoice_date_fy`).
5. **Share % changed between draft and issue**: the invoice uses the share at issue time and the client preview uses the shop's current share, so they agree. Pinned in Task 2 (`sale_unit_price_uses_share_at_issue`) and Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261008120000_retail_consignment.sql` | Tables, view, indexes, RLS, grants |
| `supabase/migrations/20261008120100_retail_consignment_functions.sql` | Numbering, draft save, FIFO fill, issue, cancel |
| `scripts/sql/test-retail.sql`, `scripts/db-test-retail.mjs` | Rolled-back SQL assertions (`npm run db:test-retail`) |
| `lib/retail/types.ts` | Row types shared by server and client |
| `lib/retail/api-types.ts` | API response shapes |
| `lib/retail/dates.ts` | IST today, periods, month arithmetic, `dd-mm-yyyy` |
| `lib/retail/gstin.ts` | GSTIN format + checksum + state |
| `lib/retail/pricing.ts` | Unit price, merged priced lines, GST split |
| `lib/retail/aging.ts` | Six-month deadline and age band |
| `lib/retail/holdings.ts` | Per-variant holdings and per-shop summary |
| `lib/retail/sheet.ts` | Sales sheet `.xlsx` build and parse (server) |
| `lib/retail/documents.ts` | Invoice and challan document builders |
| `lib/retail/pdf.tsx` | Invoice and challan PDFs (server) |
| `lib/retail/queries.ts` | Service-role reads and loaders (server) |
| `lib/retail/requests.ts` | zod request parsing |
| `lib/retail/rpc-errors.ts` | Function error → HTTP status + message |
| `lib/retail/client.ts` | Browser fetch helpers |
| `app/api/admin/retail/**` | Routes |
| `components/admin/retail/*` | Forms, sheets, lists, PDF buttons |
| `app/admin/retail/**` | Pages |
| `lib/gst/retail-register.ts` + edits in `lib/gst/*` | B2B in the sales register |

---

### Task 1: Schema migration and SQL test harness

**Files:**
- Create: `supabase/migrations/20261008120000_retail_consignment.sql`
- Create: `scripts/sql/test-retail.sql`
- Create: `scripts/db-test-retail.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: tables `public.retailers`, `public.consignment_docs`, `public.consignment_lines`, `public.retailer_payments`, `public.consignment_counters`; view `public.retailer_batch_balances(batch_line_id, retailer_id, variant_slug, product_name, size, mrp_paise, sent_on, challan_number, sent, held)`; `npm run db:test-retail`.

The SQL tests run against the live database inside one transaction that rolls back. Claude cannot run them (the classifier blocks live-DB access); hand the command to the owner as `! npm run db:test-retail` and wait for the output.

- [ ] **Step 1: Write the failing SQL test**

Create `scripts/sql/test-retail.sql`:

```sql
-- Behavioural tests for the retail consignment migrations. Loads them inside
-- one transaction, runs every assertion, then rolls back, so it is safe to run
-- against the production database and mutates nothing. Prints
-- 'PASS <name>' or 'FAIL <name>: <reason>' per assertion.
\set ON_ERROR_STOP on
begin;

\ir ../../supabase/migrations/20261008120000_retail_consignment.sql
-- FUNCTIONS MIGRATION (Task 2 adds the \ir line here)

create temporary table t_result(name text, ok boolean, reason text) on commit drop;
create temporary table t_ctx(k text primary key, v text) on commit drop;

-- Fixtures: a throwaway inactive product with two sizes (10 and 3 in stock)
-- and one Karnataka shop.
do $$
declare
  v_sizes text[];
  v_shop uuid;
begin
  select array_agg(slug order by slug) into v_sizes
    from (select slug from public.sizes order by slug limit 2) s;
  insert into public.products (name, slug, price, base_price, is_active)
    values ('ZZ Retail Frock', 'zz-retail-frock', 1000, 952, false);
  insert into public.product_variants (slug, product_slug, size_slug, price, base_price, stock_quantity)
    values ('zz-retail-frock-a', 'zz-retail-frock', v_sizes[1], 1000, 952, 10),
           ('zz-retail-frock-b', 'zz-retail-frock', v_sizes[2], 1000, 952, 3);
  insert into public.retailers (legal_name, gstin, address)
    values ('ZZ Kids Corner', '29AAGFC4321M1ZB', '1 Test Road, Bengaluru')
    returning id into v_shop;
  insert into t_ctx values ('shop', v_shop::text), ('actor', gen_random_uuid()::text);
end $$;

create function pg_temp.shop() returns uuid language sql as $$ select v::uuid from t_ctx where k = 'shop' $$;
create function pg_temp.actor() returns uuid language sql as $$ select v::uuid from t_ctx where k = 'actor' $$;
create function pg_temp.stock(p text) returns int language sql as $$
  select stock_quantity from public.product_variants where slug = p
$$;
-- Runs p_sql in a subtransaction; returns the error text, or null on success.
create function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

-- 1. No table or view is reachable by anon or authenticated.
do $$
declare t text; p text; bad text[] := '{}';
begin
  foreach t in array array['retailers', 'consignment_docs', 'consignment_lines',
                           'retailer_payments', 'consignment_counters', 'retailer_batch_balances'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('anon', 'public.' || t, p) or has_table_privilege('authenticated', 'public.' || t, p) then
        bad := bad || (t || ':' || p);
      end if;
    end loop;
  end loop;
  insert into t_result values ('tables_are_service_role_only', cardinality(bad) = 0,
    'reachable: ' || array_to_string(bad, ', '));
end $$;

-- 2. A lower-case or malformed GSTIN is refused.
insert into t_result
select 'gstin_format_enforced', e is not null, coalesce(e, 'accepted')
  from pg_temp.err($q$insert into public.retailers (legal_name, gstin, address)
                      values ('Bad', '29aagfc4321m1zb', 'x')$q$) e;

-- 3. The state code is the GSTIN's first two digits.
insert into t_result
select 'state_code_generated', state_code = '29', 'state_code=' || state_code
  from public.retailers where id = pg_temp.shop();

-- 4. Our share must be strictly between 0 and 100.
insert into t_result
select 'share_pct_bounds', e is not null, coalesce(e, 'accepted 100')
  from pg_temp.err($q$insert into public.retailers (legal_name, gstin, address, our_share_pct)
                      values ('Hundred', '33AAACR5055K1ZE', 'x', 100)$q$) e;

-- 5. One open sale per shop and month.
do $$
declare v_err text;
begin
  insert into public.consignment_docs (retailer_id, kind, doc_date, period, created_by)
    values (pg_temp.shop(), 'sale', '2026-09-30', '2026-09', pg_temp.actor());
  v_err := pg_temp.err(format(
    'insert into public.consignment_docs (retailer_id, kind, doc_date, period, created_by) values (%L, ''sale'', ''2026-09-30'', ''2026-09'', %L)',
    pg_temp.shop(), pg_temp.actor()));
  insert into t_result values ('one_open_sale_per_shop_month', v_err is not null, coalesce(v_err, 'second accepted'));
  delete from public.consignment_docs where retailer_id = pg_temp.shop() and kind = 'sale';
end $$;

-- 6. Only sales carry a period, and every sale has one.
do $$
declare e1 text; e2 text;
begin
  e1 := pg_temp.err(format(
    'insert into public.consignment_docs (retailer_id, kind, doc_date, period, created_by) values (%L, ''challan'', ''2026-09-30'', ''2026-09'', %L)',
    pg_temp.shop(), pg_temp.actor()));
  e2 := pg_temp.err(format(
    'insert into public.consignment_docs (retailer_id, kind, doc_date, created_by) values (%L, ''sale'', ''2026-09-30'', %L)',
    pg_temp.shop(), pg_temp.actor()));
  insert into t_result values ('period_only_on_sales', e1 is not null and e2 is not null,
    format('challan=%s sale=%s', coalesce(e1, 'accepted'), coalesce(e2, 'accepted')));
end $$;

-- 7. A variant with consignment lines cannot be deleted.
do $$
declare v_doc uuid; v_err text;
begin
  insert into public.consignment_docs (retailer_id, kind, doc_date, created_by)
    values (pg_temp.shop(), 'challan', '2026-09-30', pg_temp.actor()) returning id into v_doc;
  insert into public.consignment_lines (doc_id, variant_slug, product_name, size, quantity, mrp_paise)
    values (v_doc, 'zz-retail-frock-b', 'ZZ Retail Frock', 'S', 1, 100000);
  v_err := pg_temp.err($q$delete from public.product_variants where slug = 'zz-retail-frock-b'$q$);
  insert into t_result values ('variant_delete_restricted', v_err is not null, coalesce(v_err, 'deleted'));
  delete from public.consignment_docs where id = v_doc;
end $$;

-- 8. A variant slug rename carries its lines forward, then is undone.
do $$
declare v_doc uuid; v_after text;
begin
  insert into public.consignment_docs (retailer_id, kind, doc_date, created_by)
    values (pg_temp.shop(), 'challan', '2026-09-30', pg_temp.actor()) returning id into v_doc;
  insert into public.consignment_lines (doc_id, variant_slug, product_name, size, quantity, mrp_paise)
    values (v_doc, 'zz-retail-frock-a', 'ZZ Retail Frock', 'S', 1, 100000);
  update public.product_variants set slug = 'zz-retail-frock-a2' where slug = 'zz-retail-frock-a';
  select variant_slug into v_after from public.consignment_lines where doc_id = v_doc;
  update public.product_variants set slug = 'zz-retail-frock-a' where slug = 'zz-retail-frock-a2';
  insert into t_result values ('variant_rename_cascades', v_after = 'zz-retail-frock-a2', 'variant_slug=' || v_after);
  delete from public.consignment_docs where id = v_doc;
end $$;

-- FUNCTION ASSERTIONS (Task 2 inserts its blocks here)

select case when ok then 'PASS ' else 'FAIL ' end || name
       || case when ok then '' else ': ' || coalesce(reason, '') end
  from t_result order by name;

rollback;
```

Create `scripts/db-test-retail.mjs`:

```js
#!/usr/bin/env node
// Behavioural tests for the retail consignment migrations. The SQL loads the
// migrations inside a transaction and rolls back, so it mutates nothing.
import { runPsqlAssertions } from "./lib/run-psql-assertions.mjs";

runPsqlAssertions({ file: "scripts/sql/test-retail.sql", expected: 8 });
```

In `package.json` add after `"db:test-sales-register"`:

```json
    "db:test-retail": "node scripts/db-test-retail.mjs",
```

- [ ] **Step 2: Run it to make sure it fails**

Hand to the owner: `! npm run db:test-retail`
Expected: psql fails: `could not open file "…/20261008120000_retail_consignment.sql"`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261008120000_retail_consignment.sql`:

```sql
-- Retail consignment (sale-or-return to GST-registered shops). Spec:
-- docs/superpowers/specs/2026-10-08-retail-consignment-design.md.
-- Admin/internal tier (CLAUDE.md, Database Security Conventions): no grants to
-- anon/authenticated, RLS forced, no policies. Written only through the
-- functions in 20261008120100_retail_consignment_functions.sql (service role),
-- which /api/admin/retail/* calls after getUser() + isAdmin().
-- Idempotent, so scripts/sql/test-retail.sql can load it again.

create table if not exists public.retailers (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (length(trim(legal_name)) between 1 and 200),
  trade_name text check (trade_name is null or length(trade_name) <= 200),
  gstin text not null unique check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  state_code text generated always as (left(gstin, 2)) stored,
  address text not null check (length(trim(address)) between 1 and 500),
  contact_name text check (contact_name is null or length(contact_name) <= 100),
  phone text check (phone is null or length(phone) <= 20),
  email text check (email is null or length(email) <= 200),
  our_share_pct numeric(5, 2) not null default 75 check (our_share_pct > 0 and our_share_pct < 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consignment_docs (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.retailers(id) on delete restrict,
  kind text not null check (kind in ('challan', 'sale', 'return')),
  status text not null default 'draft' check (status in ('draft', 'issued', 'cancelled')),
  -- Null until issued; a sale with no lines ("nothing sold") stays null when issued.
  number text unique,
  doc_date date not null,
  period text check (period is null or period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  share_pct numeric(5, 2) check (share_pct is null or (share_pct > 0 and share_pct < 100)),
  note text check (note is null or length(note) <= 500),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  cancelled_at timestamptz,
  constraint consignment_docs_period_only_for_sales check ((kind = 'sale') = (period is not null)),
  -- Drafts are deleted, never cancelled, so anything past draft was issued.
  constraint consignment_docs_issued_has_time check (status = 'draft' or issued_at is not null)
);

create unique index if not exists consignment_docs_one_open_sale
  on public.consignment_docs (retailer_id, period)
  where kind = 'sale' and status <> 'cancelled';
create index if not exists consignment_docs_retailer_idx
  on public.consignment_docs (retailer_id, kind, status);
create index if not exists consignment_docs_date_idx
  on public.consignment_docs (kind, doc_date);

create table if not exists public.consignment_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.consignment_docs(id) on delete cascade,
  variant_slug text not null references public.product_variants(slug) on update cascade on delete restrict,
  product_name text not null,
  size text not null,
  quantity integer not null check (quantity > 0),
  -- Challan lines: the MRP on the tag. Sale and return lines: copied from their batch.
  mrp_paise integer not null check (mrp_paise > 0),
  -- Required on sale and return lines: the issued challan line (batch) they draw on.
  batch_line_id uuid references public.consignment_lines(id) on delete restrict,
  -- Sale lines only, set when the sale is issued.
  unit_price_paise integer check (unit_price_paise is null or unit_price_paise > 0)
);

create index if not exists consignment_lines_doc_idx on public.consignment_lines (doc_id);
create index if not exists consignment_lines_batch_idx on public.consignment_lines (batch_line_id);
create index if not exists consignment_lines_variant_idx on public.consignment_lines (variant_slug);

create table if not exists public.retailer_payments (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.retailers(id) on delete restrict,
  doc_id uuid references public.consignment_docs(id) on delete restrict,
  amount_paise integer not null check (amount_paise > 0),
  paid_on date not null,
  method text not null check (method in ('upi', 'bank', 'cash')),
  reference text check (reference is null or length(reference) <= 100),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists retailer_payments_retailer_idx on public.retailer_payments (retailer_id);

-- Gap-free numbering per series and financial year, like invoice_counters.
create table if not exists public.consignment_counters (
  series text not null check (series in ('CBC', 'CBR', 'RET')),
  financial_year text not null check (financial_year ~ '^[0-9]{2}-[0-9]{2}$'),
  last_seq integer not null check (last_seq > 0),
  primary key (series, financial_year)
);

-- What each shop still holds of each batch (issued challan line):
-- sent − issued sales − issued returns. Computed, never stored.
create or replace view public.retailer_batch_balances
with (security_invoker = true) as
select l.id as batch_line_id,
       d.retailer_id,
       l.variant_slug,
       l.product_name,
       l.size,
       l.mrp_paise,
       d.doc_date as sent_on,
       d.number as challan_number,
       l.quantity as sent,
       l.quantity - coalesce((
         select sum(u.quantity)
           from public.consignment_lines u
           join public.consignment_docs ud on ud.id = u.doc_id
          where u.batch_line_id = l.id
            and ud.status = 'issued'
       ), 0)::integer as held
  from public.consignment_lines l
  join public.consignment_docs d on d.id = l.doc_id
 where d.kind = 'challan'
   and d.status = 'issued';

do $$
declare t text;
begin
  foreach t in array array['retailers', 'consignment_docs', 'consignment_lines',
                           'retailer_payments', 'consignment_counters'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end $$;
revoke all on table public.retailer_batch_balances from public, anon, authenticated;

grant select, insert, update on table public.retailers to service_role;
grant select, insert, update, delete on table public.consignment_docs to service_role;
grant select, insert, update, delete on table public.consignment_lines to service_role;
grant select, insert, delete on table public.retailer_payments to service_role;
grant select, insert, update on table public.consignment_counters to service_role;
grant select on table public.retailer_batch_balances to service_role;
```

- [ ] **Step 4: Run it to verify it passes**

Hand to the owner: `! npm run db:test-retail`
Expected: 8 lines, all `PASS`, then exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261008120000_retail_consignment.sql scripts/sql/test-retail.sql scripts/db-test-retail.mjs package.json
git commit -m "feat(retail): consignment tables, batch balances view, SQL tests"
```

---

### Task 2: Consignment functions (save, FIFO, issue, cancel, numbering)

**Files:**
- Create: `supabase/migrations/20261008120100_retail_consignment_functions.sql`
- Modify: `scripts/sql/test-retail.sql`, `scripts/db-test-retail.mjs`

**Interfaces:**
- Consumes: Task 1 tables and view.
- Produces (all `service_role` only; errors are `P0001` with these exact messages):
  - `public.consignment_save_challan(p_retailer_id uuid, p_doc_date date, p_lines jsonb, p_actor uuid, p_doc_id uuid default null) returns uuid` — lines `[{variant_slug, quantity, mrp_paise}]`.
  - `public.consignment_save_return(p_retailer_id uuid, p_doc_date date, p_lines jsonb, p_actor uuid, p_doc_id uuid default null) returns uuid` — lines `[{variant_slug, quantity}]`, filled oldest batch first.
  - `public.consignment_save_sale(p_retailer_id uuid, p_period text, p_lines jsonb, p_actor uuid) returns uuid` — replaces the period's draft; lines `[{variant_slug, quantity}]`, may be empty.
  - `public.consignment_issue(p_doc_id uuid) returns public.consignment_docs`
  - `public.consignment_cancel(p_doc_id uuid) returns text` — `'deleted'` (draft) or `'cancelled'`.
  - Errors: `NOT_FOUND`, `RETAILER_INACTIVE`, `BAD_DATE`, `BAD_PERIOD`, `NO_LINES`, `BAD_LINE`, `UNKNOWN_VARIANT:<slug>`, `OUT_OF_STOCK:<name size>`, `NOT_HELD:<held>:<name size>`, `NOT_DRAFT`, `ALREADY_ISSUED`, `ALREADY_CANCELLED`, `IN_USE`, `STOCK_GONE:<name size>`, `TOO_LATE`.

- [ ] **Step 1: Write the failing SQL tests**

In `scripts/sql/test-retail.sql`, replace the line `-- FUNCTIONS MIGRATION (Task 2 adds the \ir line here)` with:

```sql
\ir ../../supabase/migrations/20261008120100_retail_consignment_functions.sql
```

Replace the line `-- FUNCTION ASSERTIONS (Task 2 inserts its blocks here)` with:

```sql
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Asia/Kolkata')::date $$;
create function pg_temp.period() returns text language sql as $$ select to_char(pg_temp.today(), 'YYYY-MM') $$;
create function pg_temp.challan(p_date date, p_lines jsonb) returns uuid language sql as $$
  select public.consignment_save_challan(pg_temp.shop(), p_date, p_lines, pg_temp.actor(), null)
$$;
create function pg_temp.held(p_variant text) returns int language sql as $$
  select coalesce(sum(held), 0)::int from public.retailer_batch_balances
   where retailer_id = pg_temp.shop() and variant_slug = p_variant
$$;
create function pg_temp.seq(p_number text) returns int language sql as $$
  select split_part(p_number, '/', 3)::int
$$;
create function pg_temp.lines(p_doc uuid) returns text language sql as $$
  select string_agg(quantity || '@' || mrp_paise, ',' order by mrp_paise, quantity)
    from public.consignment_lines where doc_id = p_doc
$$;

-- 9. Every function is service-role only.
do $$
declare f text; bad text[] := '{}';
begin
  foreach f in array array[
    'public.consignment_next_number(text,date)',
    'public.consignment_open_draft(uuid,uuid,text)',
    'public.consignment_fill_from_batches(uuid,uuid,jsonb,date)',
    'public.consignment_save_challan(uuid,date,jsonb,uuid,uuid)',
    'public.consignment_save_return(uuid,date,jsonb,uuid,uuid)',
    'public.consignment_save_sale(uuid,text,jsonb,uuid)',
    'public.consignment_issue(uuid)',
    'public.consignment_cancel(uuid)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then
      bad := bad || f;
    end if;
  end loop;
  insert into t_result values ('functions_are_service_role_only', cardinality(bad) = 0, array_to_string(bad, ', '));
end $$;

-- 10. A challan dated 15 Jan 2026 is numbered in the 25-26 series and takes stock.
do $$
declare v_doc public.consignment_docs;
begin
  v_doc := public.consignment_issue(pg_temp.challan('2026-01-15',
    '[{"variant_slug":"zz-retail-frock-a","quantity":2,"mrp_paise":100000}]'));
  insert into t_ctx values ('c0', v_doc.id::text);
  insert into t_result values ('challan_number_uses_its_date_fy',
    v_doc.number like 'CBC/25-26/%' and pg_temp.stock('zz-retail-frock-a') = 8,
    format('number=%s stock=%s', v_doc.number, pg_temp.stock('zz-retail-frock-a')));
end $$;

-- 11. Issuing today's challan takes stock for each line and numbers it in today's FY.
do $$
declare v_doc public.consignment_docs;
begin
  v_doc := public.consignment_issue(pg_temp.challan(pg_temp.today(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":3,"mrp_paise":110000},
      {"variant_slug":"zz-retail-frock-b","quantity":1,"mrp_paise":100000}]'));
  insert into t_ctx values ('c1', v_doc.id::text), ('c1_number', v_doc.number);
  insert into t_result values ('challan_issue_takes_stock_and_numbers',
    v_doc.status = 'issued' and v_doc.number like 'CBC/' || public.gst_financial_year(now()) || '/%'
      and pg_temp.stock('zz-retail-frock-a') = 5 and pg_temp.stock('zz-retail-frock-b') = 2
      and pg_temp.held('zz-retail-frock-a') = 5,
    format('status=%s number=%s a=%s b=%s held_a=%s', v_doc.status, v_doc.number,
           pg_temp.stock('zz-retail-frock-a'), pg_temp.stock('zz-retail-frock-b'), pg_temp.held('zz-retail-frock-a')));
end $$;

-- 12. A shortfall is refused, the stock is untouched and the draft stays a draft.
do $$
declare v_doc uuid; v_err text; v_status text;
begin
  v_doc := pg_temp.challan(pg_temp.today(), '[{"variant_slug":"zz-retail-frock-b","quantity":5,"mrp_paise":100000}]');
  v_err := pg_temp.err(format('select public.consignment_issue(%L)', v_doc));
  select status into v_status from public.consignment_docs where id = v_doc;
  insert into t_ctx values ('short', v_doc::text);
  insert into t_result values ('challan_issue_refuses_shortfall',
    v_err like 'OUT_OF_STOCK:%' and pg_temp.stock('zz-retail-frock-b') = 2 and v_status = 'draft',
    format('err=%s stock=%s status=%s', v_err, pg_temp.stock('zz-retail-frock-b'), v_status));
end $$;

-- 13. Cancelling a draft deletes it.
do $$
declare v_res text;
begin
  v_res := public.consignment_cancel((select v::uuid from t_ctx where k = 'short'));
  insert into t_result values ('cancel_draft_deletes',
    v_res = 'deleted' and not exists (select 1 from public.consignment_docs where id = (select v::uuid from t_ctx where k = 'short')),
    'result=' || v_res);
end $$;

-- 14. Issuing an issued document again is refused and takes no more stock.
insert into t_result
select 'issue_twice_refused', e = 'NOT_DRAFT' and pg_temp.stock('zz-retail-frock-a') = 5,
       format('err=%s stock=%s', coalesce(e, 'none'), pg_temp.stock('zz-retail-frock-a'))
  from pg_temp.err(format('select public.consignment_issue(%L)', (select v from t_ctx where k = 'c1'))) e;

-- 15. An inactive shop gets no new challans.
do $$
declare v_err text;
begin
  update public.retailers set active = false where id = pg_temp.shop();
  v_err := pg_temp.err(format('select public.consignment_save_challan(%L, %L, %L, %L, null)', pg_temp.shop(),
    pg_temp.today(), '[{"variant_slug":"zz-retail-frock-a","quantity":1,"mrp_paise":100000}]', pg_temp.actor()));
  update public.retailers set active = true where id = pg_temp.shop();
  insert into t_result values ('challan_refused_for_inactive_shop', v_err = 'RETAILER_INACTIVE', coalesce(v_err, 'accepted'));
end $$;

-- 16. A January sale can only draw on stock sent by 31 January (2 pieces).
insert into t_result
select 'sale_only_from_batches_sent_by_period_end', e like 'NOT_HELD:2:%', coalesce(e, 'accepted')
  from pg_temp.err(format('select public.consignment_save_sale(%L, ''2026-01'', %L, %L)', pg_temp.shop(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":3}]', pg_temp.actor())) e;

-- 17. The January invoice is dated 31 Jan and numbered in the 25-26 series.
do $$
declare v_doc public.consignment_docs;
begin
  v_doc := public.consignment_issue(public.consignment_save_sale(pg_temp.shop(), '2026-01',
    '[{"variant_slug":"zz-retail-frock-a","quantity":1}]', pg_temp.actor()));
  insert into t_ctx values ('s_jan', v_doc.id::text);
  insert into t_result values ('sale_number_uses_invoice_date_fy',
    v_doc.number like 'CBR/25-26/%' and v_doc.doc_date = '2026-01-31' and v_doc.share_pct = 75,
    format('number=%s date=%s share=%s', v_doc.number, v_doc.doc_date, v_doc.share_pct));
end $$;

-- 18. After the 10th of the following month the invoice cannot be cancelled.
insert into t_result
select 'cancel_sale_after_deadline_refused', e = 'TOO_LATE', coalesce(e, 'cancelled')
  from pg_temp.err(format('select public.consignment_cancel(%L)', (select v from t_ctx where k = 's_jan'))) e;

-- 19. Sales draw on the oldest batch first: 1 left at Rs 1,000, then 3 at Rs 1,100.
do $$
declare v_doc uuid;
begin
  v_doc := public.consignment_save_sale(pg_temp.shop(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":4}]', pg_temp.actor());
  insert into t_ctx values ('s_now', v_doc::text);
  insert into t_result values ('sale_fifo_oldest_first', pg_temp.lines(v_doc) = '1@100000,3@110000',
    'lines=' || coalesce(pg_temp.lines(v_doc), 'none'));
end $$;

-- 20. A draft cannot take more than the shop holds (b: 1 held); the old draft survives.
do $$
declare v_err text;
begin
  v_err := pg_temp.err(format('select public.consignment_save_sale(%L, %L, %L, %L)', pg_temp.shop(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-b","quantity":2}]', pg_temp.actor()));
  insert into t_result values ('sale_cannot_exceed_held',
    v_err like 'NOT_HELD:1:%' and pg_temp.lines((select v::uuid from t_ctx where k = 's_now')) = '1@100000,3@110000',
    format('err=%s lines=%s', v_err, pg_temp.lines((select v::uuid from t_ctx where k = 's_now'))));
end $$;

-- 21. Saving the same month again replaces the draft in place.
do $$
declare v_doc uuid; v_first text;
begin
  v_doc := public.consignment_save_sale(pg_temp.shop(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":1}]', pg_temp.actor());
  v_first := pg_temp.lines(v_doc);
  perform public.consignment_save_sale(pg_temp.shop(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":4}]', pg_temp.actor());
  insert into t_result values ('sale_upload_replaces_draft',
    v_doc = (select v::uuid from t_ctx where k = 's_now') and v_first = '1@100000',
    format('same=%s first=%s', v_doc = (select v::uuid from t_ctx where k = 's_now'), v_first));
end $$;

-- 22. Taking 2 back returns them to stock, oldest batch first.
do $$
declare v_doc public.consignment_docs;
begin
  v_doc := public.consignment_issue(public.consignment_save_return(pg_temp.shop(), pg_temp.today(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":2}]', pg_temp.actor(), null));
  insert into t_ctx values ('r1', v_doc.id::text);
  insert into t_result values ('return_adds_stock_back',
    v_doc.number like 'RET/%' and pg_temp.stock('zz-retail-frock-a') = 7 and pg_temp.held('zz-retail-frock-a') = 2
      and pg_temp.lines(v_doc.id) = '1@100000,1@110000',
    format('number=%s stock=%s held=%s lines=%s', v_doc.number, pg_temp.stock('zz-retail-frock-a'),
           pg_temp.held('zz-retail-frock-a'), pg_temp.lines(v_doc.id)));
end $$;

-- 23. The 4-piece draft is now stale: issuing re-checks and refuses.
do $$
declare v_err text; v_status text;
begin
  v_err := pg_temp.err(format('select public.consignment_issue(%L)', (select v from t_ctx where k = 's_now')));
  select status into v_status from public.consignment_docs where id = (select v::uuid from t_ctx where k = 's_now');
  insert into t_result values ('sale_issue_rechecks_balance', v_err like 'NOT_HELD:2:%' and v_status = 'draft',
    format('err=%s status=%s', v_err, v_status));
end $$;

-- 24. The invoice uses the shop's share at issue time (70% of Rs 1,100 = Rs 770).
do $$
declare v_doc public.consignment_docs; v_price int;
begin
  perform public.consignment_save_sale(pg_temp.shop(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":2}]', pg_temp.actor());
  update public.retailers set our_share_pct = 70 where id = pg_temp.shop();
  v_doc := public.consignment_issue((select v::uuid from t_ctx where k = 's_now'));
  update public.retailers set our_share_pct = 75 where id = pg_temp.shop();
  select max(unit_price_paise) into v_price from public.consignment_lines where doc_id = v_doc.id;
  insert into t_result values ('sale_unit_price_uses_share_at_issue',
    v_doc.share_pct = 70 and v_price = 77000 and v_doc.number like 'CBR/%'
      and v_doc.doc_date = pg_temp.today() and pg_temp.held('zz-retail-frock-a') = 0,
    format('share=%s price=%s number=%s date=%s held=%s', v_doc.share_pct, v_price, v_doc.number,
           v_doc.doc_date, pg_temp.held('zz-retail-frock-a')));
end $$;

-- 25. A challan that sales or returns draw on cannot be cancelled.
insert into t_result
select 'cancel_challan_in_use_refused', e = 'IN_USE', coalesce(e, 'cancelled')
  from pg_temp.err(format('select public.consignment_cancel(%L)', (select v from t_ctx where k = 'c1'))) e;

-- 26. This month's invoice can be cancelled; it keeps its number, and a new draft is allowed.
do $$
declare v_res text; v_doc public.consignment_docs; v_new uuid;
begin
  v_res := public.consignment_cancel((select v::uuid from t_ctx where k = 's_now'));
  select * into v_doc from public.consignment_docs where id = (select v::uuid from t_ctx where k = 's_now');
  v_new := public.consignment_save_sale(pg_temp.shop(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":1}]', pg_temp.actor());
  insert into t_ctx values ('s_new', v_new::text);
  insert into t_result values ('cancel_sale_in_window_keeps_number',
    v_res = 'cancelled' and v_doc.status = 'cancelled' and v_doc.number like 'CBR/%'
      and v_doc.cancelled_at is not null and pg_temp.held('zz-retail-frock-a') = 2 and v_new <> v_doc.id,
    format('res=%s status=%s number=%s held=%s', v_res, v_doc.status, v_doc.number, pg_temp.held('zz-retail-frock-a')));
end $$;

-- 27. Once the month is issued, another upload is refused.
do $$
declare v_err text;
begin
  perform public.consignment_issue((select v::uuid from t_ctx where k = 's_new'));
  v_err := pg_temp.err(format('select public.consignment_save_sale(%L, %L, %L, %L)', pg_temp.shop(), pg_temp.period(),
    '[{"variant_slug":"zz-retail-frock-a","quantity":1}]', pg_temp.actor()));
  insert into t_result values ('upload_refused_after_issue', v_err = 'ALREADY_ISSUED', coalesce(v_err, 'accepted'));
end $$;

-- 28. A "nothing sold" month is issued without a number.
do $$
declare v_doc public.consignment_docs;
begin
  v_doc := public.consignment_issue(public.consignment_save_sale(pg_temp.shop(), '2026-02', '[]', pg_temp.actor()));
  insert into t_result values ('nothing_sold_issues_without_number',
    v_doc.status = 'issued' and v_doc.number is null,
    format('status=%s number=%s', v_doc.status, coalesce(v_doc.number, 'null')));
end $$;

-- 29. A return cannot be cancelled once those units have left our stock again.
do $$
declare v_err text; v_res text;
begin
  update public.product_variants set stock_quantity = 0 where slug = 'zz-retail-frock-a';
  v_err := pg_temp.err(format('select public.consignment_cancel(%L)', (select v from t_ctx where k = 'r1')));
  update public.product_variants set stock_quantity = 7 where slug = 'zz-retail-frock-a';
  v_res := public.consignment_cancel((select v::uuid from t_ctx where k = 'r1'));
  insert into t_result values ('cancel_return_needs_stock',
    v_err like 'STOCK_GONE:%' and v_res = 'cancelled' and pg_temp.stock('zz-retail-frock-a') = 5,
    format('err=%s res=%s stock=%s', v_err, v_res, pg_temp.stock('zz-retail-frock-a')));
end $$;

-- 30. An unused challan can be cancelled and its stock comes back; numbers are consecutive.
do $$
declare v_doc public.consignment_docs; v_res text;
begin
  v_doc := public.consignment_issue(pg_temp.challan(pg_temp.today(),
    '[{"variant_slug":"zz-retail-frock-b","quantity":1,"mrp_paise":100000}]'));
  insert into t_result values ('numbering_is_consecutive',
    pg_temp.seq(v_doc.number) = pg_temp.seq((select v from t_ctx where k = 'c1_number')) + 1,
    format('c1=%s c2=%s', (select v from t_ctx where k = 'c1_number'), v_doc.number));
  v_res := public.consignment_cancel(v_doc.id);
  insert into t_result values ('cancel_unused_challan_restores_stock',
    v_res = 'cancelled' and pg_temp.stock('zz-retail-frock-b') = 2,
    format('res=%s stock=%s', v_res, pg_temp.stock('zz-retail-frock-b')));
end $$;

-- 31. The API's role (service_role) can save and issue. The temp helpers and
--     t_ctx belong to the session user, so read them before switching role.
do $$
declare
  v_err text;
  v_shop uuid := pg_temp.shop();
  v_actor uuid := pg_temp.actor();
  v_today date := pg_temp.today();
begin
  begin
    perform set_config('role', 'service_role', true);
    perform public.consignment_issue(public.consignment_save_challan(v_shop, v_today,
      '[{"variant_slug":"zz-retail-frock-b","quantity":1,"mrp_paise":100000}]', v_actor, null));
    perform set_config('role', session_user, true);
  exception when others then
    v_err := sqlerrm;
  end;
  perform set_config('role', session_user, true);
  insert into t_result values ('service_role_can_run_flow', v_err is null, coalesce(v_err, 'ok'));
end $$;
```

In `scripts/db-test-retail.mjs` change `expected: 8` to `expected: 32`.

- [ ] **Step 2: Run it to make sure it fails**

Hand to the owner: `! npm run db:test-retail`
Expected: psql fails: `could not open file "…/20261008120100_retail_consignment_functions.sql"`.

- [ ] **Step 3: Write the functions migration**

Create `supabase/migrations/20261008120100_retail_consignment_functions.sql`:

```sql
-- Retail consignment functions. Called only by /api/admin/retail/* with the
-- service role after requireAdmin(). Not SECURITY DEFINER: the caller is
-- service_role, which holds the table privileges (same shape as stall_refill_*).
-- Every write takes a per-shop advisory lock, so two phones cannot issue the
-- same draft or over-draw the same batch. Errors are P0001 with the messages
-- that lib/retail/rpc-errors.ts maps to HTTP responses.

-- consignment_next_number runs as service_role and needs this.
grant execute on function public.gst_financial_year(timestamptz) to service_role;

-- CBC/26-27/0001: gap-free per series and the financial year of p_date (IST).
create or replace function public.consignment_next_number(p_series text, p_date date)
returns text
language plpgsql
set search_path = ''
as $$
declare
  fy text;
  seq integer;
begin
  fy := public.gst_financial_year(p_date::timestamp at time zone 'Asia/Kolkata');
  insert into public.consignment_counters as c (series, financial_year, last_seq)
  values (p_series, fy, 1)
  on conflict (series, financial_year) do update set last_seq = c.last_seq + 1
  returning c.last_seq into seq;
  return p_series || '/' || fy || '/' || lpad(seq::text, greatest(4, length(seq::text)), '0');
end;
$$;

-- An existing draft of this shop and kind, emptied for re-filling; null when p_doc_id is null.
create or replace function public.consignment_open_draft(p_doc_id uuid, p_retailer_id uuid, p_kind text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_doc_id is null then
    return null;
  end if;
  select d.status into v_status
    from public.consignment_docs d
   where d.id = p_doc_id and d.retailer_id = p_retailer_id and d.kind = p_kind
     for update;
  if v_status is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;
  delete from public.consignment_lines where doc_id = p_doc_id;
  return p_doc_id;
end;
$$;

-- Turns "variant × quantity" into lines per batch, oldest batch first, using
-- only batches sent on or before p_until. NOT_HELD:<held>:<name size> when the
-- shop holds less.
create or replace function public.consignment_fill_from_batches(p_doc_id uuid, p_retailer_id uuid, p_lines jsonb, p_until date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  item record;
  b record;
  v_left integer;
  v_take integer;
  v_label text;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'BAD_LINE' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer)
     where x.variant_slug is null or x.quantity is null or x.quantity < 0
  ) then
    raise exception 'BAD_LINE' using errcode = 'P0001';
  end if;

  for item in
    select x.variant_slug, sum(x.quantity)::integer as quantity
      from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer)
     group by x.variant_slug
    having sum(x.quantity) > 0
     order by x.variant_slug
  loop
    v_left := item.quantity;
    v_label := null;
    for b in
      select bb.batch_line_id, bb.product_name, bb.size, bb.mrp_paise, bb.held
        from public.retailer_batch_balances bb
       where bb.retailer_id = p_retailer_id
         and bb.variant_slug = item.variant_slug
         and bb.held > 0
         and bb.sent_on <= p_until
       order by bb.sent_on, bb.batch_line_id
    loop
      v_label := trim(b.product_name || ' ' || b.size);
      exit when v_left = 0;
      v_take := least(v_left, b.held);
      insert into public.consignment_lines (doc_id, variant_slug, product_name, size, quantity, mrp_paise, batch_line_id)
      values (p_doc_id, item.variant_slug, b.product_name, b.size, v_take, b.mrp_paise, b.batch_line_id);
      v_left := v_left - v_take;
    end loop;
    if v_left > 0 then
      raise exception 'NOT_HELD:%:%', item.quantity - v_left, coalesce(v_label, item.variant_slug)
        using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

create or replace function public.consignment_save_challan(
  p_retailer_id uuid,
  p_doc_date date,
  p_lines jsonb,
  p_actor uuid,
  p_doc_id uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_doc uuid;
  v_active boolean;
  v_bad text;
begin
  perform pg_advisory_xact_lock(hashtext('consignment:' || p_retailer_id::text));
  select r.active into v_active from public.retailers r where r.id = p_retailer_id;
  if v_active is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not v_active then
    raise exception 'RETAILER_INACTIVE' using errcode = 'P0001';
  end if;
  if p_doc_date is null or p_doc_date > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'BAD_DATE' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'NO_LINES' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer, mrp_paise integer)
     where x.variant_slug is null or x.quantity is null or x.quantity <= 0
        or x.mrp_paise is null or x.mrp_paise <= 0
  ) then
    raise exception 'BAD_LINE' using errcode = 'P0001';
  end if;
  select x.variant_slug into v_bad
    from jsonb_to_recordset(p_lines) as x(variant_slug text)
   where not exists (select 1 from public.product_variants v where v.slug = x.variant_slug)
   limit 1;
  if v_bad is not null then
    raise exception 'UNKNOWN_VARIANT:%', v_bad using errcode = 'P0001';
  end if;

  v_doc := public.consignment_open_draft(p_doc_id, p_retailer_id, 'challan');
  if v_doc is null then
    insert into public.consignment_docs (retailer_id, kind, doc_date, created_by)
    values (p_retailer_id, 'challan', p_doc_date, p_actor)
    returning id into v_doc;
  else
    update public.consignment_docs set doc_date = p_doc_date where id = v_doc;
  end if;

  insert into public.consignment_lines (doc_id, variant_slug, product_name, size, quantity, mrp_paise)
  select v_doc, x.variant_slug, p.name, coalesce(s.name, v.size_slug, ''), x.quantity, x.mrp_paise
    from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer, mrp_paise integer)
    join public.product_variants v on v.slug = x.variant_slug
    join public.products p on p.slug = v.product_slug
    left join public.sizes s on s.slug = v.size_slug;
  return v_doc;
end;
$$;

create or replace function public.consignment_save_return(
  p_retailer_id uuid,
  p_doc_date date,
  p_lines jsonb,
  p_actor uuid,
  p_doc_id uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_doc uuid;
begin
  perform pg_advisory_xact_lock(hashtext('consignment:' || p_retailer_id::text));
  if not exists (select 1 from public.retailers r where r.id = p_retailer_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_doc_date is null or p_doc_date > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'BAD_DATE' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or not exists (
    select 1 from jsonb_to_recordset(p_lines) as x(variant_slug text, quantity integer) where x.quantity > 0
  ) then
    raise exception 'NO_LINES' using errcode = 'P0001';
  end if;

  v_doc := public.consignment_open_draft(p_doc_id, p_retailer_id, 'return');
  if v_doc is null then
    insert into public.consignment_docs (retailer_id, kind, doc_date, created_by)
    values (p_retailer_id, 'return', p_doc_date, p_actor)
    returning id into v_doc;
  else
    update public.consignment_docs set doc_date = p_doc_date where id = v_doc;
  end if;
  perform public.consignment_fill_from_batches(v_doc, p_retailer_id, p_lines, p_doc_date);
  return v_doc;
end;
$$;

-- Creates or replaces the period's draft sale. An empty list is a "nothing sold" month.
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
begin
  perform pg_advisory_xact_lock(hashtext('consignment:' || p_retailer_id::text));
  if not exists (select 1 from public.retailers r where r.id = p_retailer_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_period > to_char(v_today, 'YYYY-MM') then
    raise exception 'BAD_PERIOD' using errcode = 'P0001';
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
  perform public.consignment_fill_from_batches(v_doc, p_retailer_id, coalesce(p_lines, '[]'::jsonb), v_end);
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
begin
  select * into v_doc from public.consignment_docs where id = p_doc_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('consignment:' || v_doc.retailer_id::text));
  -- Re-read under the lock: another call may have issued it meanwhile.
  select * into v_doc from public.consignment_docs where id = p_doc_id for update;
  if v_doc.status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;
  select * into v_retailer from public.retailers where id = v_doc.retailer_id;

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
         set stock_quantity = v.stock_quantity - item.quantity
       where v.slug = item.variant_slug
         and v.stock_quantity >= item.quantity;
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
      update public.consignment_lines
         set unit_price_paise = round(mrp_paise * v_doc.share_pct / 100)::integer
       where doc_id = p_doc_id;
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
           set stock_quantity = v.stock_quantity + item.quantity
         where v.slug = item.variant_slug;
      end loop;
      v_doc.number := public.consignment_next_number('RET', v_doc.doc_date);
    end if;
  end if;

  update public.consignment_docs
     set status = 'issued', issued_at = now(), number = v_doc.number, share_pct = v_doc.share_pct
   where id = p_doc_id
  returning * into v_doc;
  return v_doc;
end;
$$;

-- Draft: deleted. Challan: only while nothing issued draws on it; stock comes
-- back. Return: only while our stock still covers it; stock goes out again.
-- Sale: only before 00:00 IST on the 11th of the following month (GSTR-1 due
-- date); number kept.
create or replace function public.consignment_cancel(p_doc_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_doc public.consignment_docs;
  item record;
begin
  select * into v_doc from public.consignment_docs where id = p_doc_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('consignment:' || v_doc.retailer_id::text));
  select * into v_doc from public.consignment_docs where id = p_doc_id for update;

  if v_doc.status = 'cancelled' then
    raise exception 'ALREADY_CANCELLED' using errcode = 'P0001';
  end if;
  if v_doc.status = 'draft' then
    delete from public.consignment_docs where id = p_doc_id;
    return 'deleted';
  end if;

  if v_doc.kind = 'challan' then
    if exists (
      select 1
        from public.consignment_lines u
        join public.consignment_docs ud on ud.id = u.doc_id
        join public.consignment_lines c on c.id = u.batch_line_id
       where c.doc_id = p_doc_id and ud.status = 'issued'
    ) then
      raise exception 'IN_USE' using errcode = 'P0001';
    end if;
    for item in
      select l.variant_slug, sum(l.quantity)::integer as quantity
        from public.consignment_lines l where l.doc_id = p_doc_id
       group by l.variant_slug order by l.variant_slug
    loop
      update public.product_variants v set stock_quantity = v.stock_quantity + item.quantity
       where v.slug = item.variant_slug;
    end loop;
  elsif v_doc.kind = 'return' then
    for item in
      select l.variant_slug, min(trim(l.product_name || ' ' || l.size)) as label, sum(l.quantity)::integer as quantity
        from public.consignment_lines l where l.doc_id = p_doc_id
       group by l.variant_slug order by l.variant_slug
    loop
      update public.product_variants v set stock_quantity = v.stock_quantity - item.quantity
       where v.slug = item.variant_slug and v.stock_quantity >= item.quantity;
      if not found then
        raise exception 'STOCK_GONE:%', item.label using errcode = 'P0001';
      end if;
    end loop;
  else
    if now() >= ((to_date(v_doc.period || '-01', 'YYYY-MM-DD') + interval '1 month' + interval '10 days')::timestamp
                 at time zone 'Asia/Kolkata') then
      raise exception 'TOO_LATE' using errcode = 'P0001';
    end if;
  end if;

  update public.consignment_docs set status = 'cancelled', cancelled_at = now() where id = p_doc_id;
  return 'cancelled';
end;
$$;

revoke all on function public.consignment_next_number(text, date) from public, anon, authenticated;
revoke all on function public.consignment_open_draft(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.consignment_fill_from_batches(uuid, uuid, jsonb, date) from public, anon, authenticated;
revoke all on function public.consignment_save_challan(uuid, date, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.consignment_save_return(uuid, date, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.consignment_save_sale(uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.consignment_issue(uuid) from public, anon, authenticated;
revoke all on function public.consignment_cancel(uuid) from public, anon, authenticated;
grant execute on function public.consignment_next_number(text, date) to service_role;
grant execute on function public.consignment_open_draft(uuid, uuid, text) to service_role;
grant execute on function public.consignment_fill_from_batches(uuid, uuid, jsonb, date) to service_role;
grant execute on function public.consignment_save_challan(uuid, date, jsonb, uuid, uuid) to service_role;
grant execute on function public.consignment_save_return(uuid, date, jsonb, uuid, uuid) to service_role;
grant execute on function public.consignment_save_sale(uuid, text, jsonb, uuid) to service_role;
grant execute on function public.consignment_issue(uuid) to service_role;
grant execute on function public.consignment_cancel(uuid) to service_role;
```

- [ ] **Step 4: Run it to verify it passes**

Hand to the owner: `! npm run db:test-retail`
Expected: 32 lines, all `PASS`, exit 0. If any line FAILs, read the reason, fix the function (not the assertion), and ask the owner to run it again.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261008120100_retail_consignment_functions.sql scripts/sql/test-retail.sql scripts/db-test-retail.mjs
git commit -m "feat(retail): save, FIFO fill, issue and cancel functions with numbering"
```

---

### Task 3: Core pure modules (types, dates, GSTIN, pricing, aging, holdings)

**Files:**
- Create: `lib/retail/types.ts`, `lib/retail/api-types.ts`, `lib/retail/dates.ts`, `lib/retail/gstin.ts`, `lib/retail/pricing.ts`, `lib/retail/aging.ts`, `lib/retail/holdings.ts`
- Create: `lib/retail/__fixtures__/retail.ts`
- Test: `lib/retail/dates.test.ts`, `lib/retail/gstin.test.ts`, `lib/retail/pricing.test.ts`, `lib/retail/aging.test.ts`, `lib/retail/holdings.test.ts`

**Interfaces:**
- Consumes: `computeGst`, `taxModeFor`, `GstComputation` (`lib/invoice/gst.ts`); `gstStateName` (`lib/invoice/state-codes.ts`); `istParts` (`lib/admin/sales-range.ts`); `HSN_BABY_GARMENTS`, `SELLER` (`lib/config/business.ts`).
- Produces:
  - `types.ts`: `DocKind`, `DocStatus`, `PaymentMethod`, `Retailer`, `ConsignmentLine`, `ConsignmentDoc`, `BatchBalance`, `RetailerPayment`, `RowError`.
  - `dates.ts`: `istToday(now: Date): string`, `currentPeriod(now: Date): string`, `isPeriod(v: unknown): v is string`, `isIsoDate(v: unknown): v is string`, `recentPeriods(now: Date, count: number): string[]`, `addMonths(date: string, months: number): string`, `formatDay(date: string): string`.
  - `gstin.ts`: `gstinCheckChar(first14: string): string`, `validateGstin(raw: unknown): GstinResult`.
  - `pricing.ts`: `unitPricePaise(mrpPaise: number, sharePct: number): number`, `PricedSaleLine`, `priceSaleLines(lines: ConsignmentLine[], sharePct: number): PricedSaleLine[]`, `retailGst(lines: PricedSaleLine[], shopStateCode: string, homeStateCode?: string): GstComputation`, `docTotalPaise(doc: Pick<ConsignmentDoc, "consignment_lines" | "share_pct">, fallbackSharePct: number): number`, `piecesOf(doc: Pick<ConsignmentDoc, "consignment_lines">): number`, `mrpValueOf(doc: Pick<ConsignmentDoc, "consignment_lines">): number`.
  - `aging.ts`: `AgeBand`, `invoiceDeadline(sentOn: string): string`, `ageBand(sentOn: string, today: string): AgeBand`.
  - `holdings.ts`: `Holding`, `HoldingBatch`, `holdingsFrom(balances: BatchBalance[], today: string): Holding[]`, `RetailerSummary`, `retailerSummary(input: { retailer: Retailer; balances: BatchBalance[]; docs: ConsignmentDoc[]; payments: RetailerPayment[]; today: string }): RetailerSummary`.
  - `api-types.ts`: `RetailerListItem`, `RetailerListResponse`, `RetailerDetail`, `VariantOption`.

- [ ] **Step 1: Write the fixtures and failing tests**

Create `lib/retail/__fixtures__/retail.ts`:

```ts
import type { BatchBalance, ConsignmentDoc, ConsignmentLine, Retailer, RetailerPayment } from "../types";

export const SHOP_GSTIN = "29AAGFC4321M1ZB"; // Karnataka, valid checksum
export const TN_GSTIN = "33AAACR5055K1ZE"; // Tamil Nadu, valid checksum

export function retailer(o: Partial<Retailer> = {}): Retailer {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    legal_name: "Kids Corner LLP",
    trade_name: "Kids Corner",
    gstin: SHOP_GSTIN,
    state_code: "29",
    address: "12 MG Road\nBengaluru 560001",
    contact_name: "Ravi",
    phone: "9876543210",
    email: "ravi@kidscorner.in",
    our_share_pct: 75,
    active: true,
    created_at: "2026-10-01T05:00:00.000Z",
    ...o,
  };
}

export function line(o: Partial<ConsignmentLine> = {}): ConsignmentLine {
  return {
    id: "line-1",
    doc_id: "doc-1",
    variant_slug: "petal-frock-1-2y",
    product_name: "Petal Pops Frock",
    size: "1-2Y",
    quantity: 1,
    mrp_paise: 100000,
    batch_line_id: null,
    unit_price_paise: null,
    ...o,
  };
}

export function doc(o: Partial<ConsignmentDoc> = {}): ConsignmentDoc {
  return {
    id: "doc-1",
    retailer_id: retailer().id,
    kind: "sale",
    status: "issued",
    number: "CBR/26-27/0001",
    doc_date: "2026-10-31",
    period: "2026-10",
    share_pct: 75,
    note: null,
    created_at: "2026-11-02T05:00:00.000Z",
    issued_at: "2026-11-02T05:05:00.000Z",
    cancelled_at: null,
    consignment_lines: [line({ batch_line_id: "batch-1", unit_price_paise: 75000 })],
    ...o,
  };
}

export function balance(o: Partial<BatchBalance> = {}): BatchBalance {
  return {
    batch_line_id: "batch-1",
    retailer_id: retailer().id,
    variant_slug: "petal-frock-1-2y",
    product_name: "Petal Pops Frock",
    size: "1-2Y",
    mrp_paise: 100000,
    sent_on: "2026-10-01",
    challan_number: "CBC/26-27/0001",
    sent: 5,
    held: 3,
    ...o,
  };
}

export function payment(o: Partial<RetailerPayment> = {}): RetailerPayment {
  return {
    id: "pay-1",
    retailer_id: retailer().id,
    doc_id: "doc-1",
    amount_paise: 50000,
    paid_on: "2026-11-05",
    method: "upi",
    reference: "UTR123",
    created_at: "2026-11-05T05:00:00.000Z",
    ...o,
  };
}
```

Create `lib/retail/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addMonths, currentPeriod, formatDay, isIsoDate, isPeriod, istToday, recentPeriods } from "./dates";

describe("retail dates", () => {
  it("uses the IST calendar day", () => {
    expect(istToday(new Date("2026-10-31T18:29:00Z"))).toBe("2026-10-31");
    expect(istToday(new Date("2026-10-31T18:30:00Z"))).toBe("2026-11-01");
    expect(currentPeriod(new Date("2026-10-31T18:30:00Z"))).toBe("2026-11");
  });
  it("validates periods and dates", () => {
    expect(isPeriod("2026-09")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-1-05")).toBe(false);
  });
  it("lists recent periods newest first across a year end", () => {
    expect(recentPeriods(new Date("2026-02-10T05:00:00Z"), 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });
  it("adds months, clamping to the month's last day", () => {
    expect(addMonths("2026-01-15", 6)).toBe("2026-07-15");
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });
  it("formats a day as dd-mm-yyyy", () => {
    expect(formatDay("2026-10-08")).toBe("08-10-2026");
  });
});
```

Create `lib/retail/gstin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gstinCheckChar, validateGstin } from "./gstin";

describe("validateGstin", () => {
  it("accepts a valid GSTIN, normalising spaces and case, and names the state", () => {
    expect(validateGstin(" 29aagfc4321m1zb ")).toEqual({ ok: true, gstin: "29AAGFC4321M1ZB", stateCode: "29", stateName: "Karnataka" });
    expect(validateGstin("33AAACR5055K1ZE")).toMatchObject({ ok: true, stateCode: "33", stateName: "Tamil Nadu" });
  });
  it("computes the published example's check character", () => {
    expect(gstinCheckChar("27AAPFU0939F1Z")).toBe("V");
  });
  it("refuses a wrong check character", () => {
    expect(validateGstin("29AAGFC4321M1ZC")).toEqual({ ok: false, error: "This GSTIN's last character doesn't match: check for a typo" });
  });
  it("refuses a bad shape, an unknown state and a blank", () => {
    expect(validateGstin("29AAGFC4321M1Z")).toMatchObject({ ok: false });
    expect(validateGstin("00AAGFC4321M1ZB")).toEqual({ ok: false, error: "00 is not a GST state code" });
    expect(validateGstin("")).toEqual({ ok: false, error: "Enter the shop's GSTIN" });
    expect(validateGstin(42)).toEqual({ ok: false, error: "Enter the shop's GSTIN" });
  });
});
```

Create `lib/retail/pricing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { line } from "./__fixtures__/retail";
import { docTotalPaise, mrpValueOf, piecesOf, priceSaleLines, retailGst, unitPricePaise } from "./pricing";

describe("retail pricing", () => {
  it("prices our share of MRP to the paisa, rounding half up once", () => {
    expect(unitPricePaise(100000, 75)).toBe(75000);
    expect(unitPricePaise(99950, 75)).toBe(74963);
    expect(unitPricePaise(110000, 70)).toBe(77000);
  });

  it("merges batches with the same MRP and keeps different MRPs apart", () => {
    const priced = priceSaleLines(
      [
        line({ id: "a", quantity: 1, mrp_paise: 100000 }),
        line({ id: "b", quantity: 2, mrp_paise: 100000 }),
        line({ id: "c", quantity: 1, mrp_paise: 110000 }),
      ],
      75,
    );
    expect(priced.map((p) => [p.description, p.quantity, p.mrpPaise, p.unitPricePaise])).toEqual([
      ["Petal Pops Frock (1-2Y)", 3, 100000, 75000],
      ["Petal Pops Frock (1-2Y)", 1, 110000, 82500],
    ]);
  });

  it("uses the stored unit price of an issued line over the share", () => {
    const [p] = priceSaleLines([line({ unit_price_paise: 77000, mrp_paise: 110000 })], 75);
    expect(p.unitPricePaise).toBe(77000);
  });

  it("splits GST out of Rs 750: Rs 714.29 + CGST 17.85 + SGST 17.86 in Karnataka", () => {
    const gst = retailGst(priceSaleLines([line()], 75), "29");
    expect(gst.mode).toBe("intra");
    expect(gst.totals).toEqual({ taxablePaise: 71429, cgstPaise: 1785, sgstPaise: 1786, igstPaise: 0, discountPaise: 0, totalPaise: 75000 });
  });

  it("charges IGST to a shop in another state", () => {
    const gst = retailGst(priceSaleLines([line()], 75), "33");
    expect(gst.mode).toBe("inter");
    expect(gst.totals.igstPaise).toBe(3571);
  });

  it("totals a document, counts pieces and MRP value", () => {
    const d = { share_pct: 75, consignment_lines: [line({ quantity: 2 }), line({ quantity: 1, mrp_paise: 110000 })] };
    expect(docTotalPaise(d, 70)).toBe(150000 + 82500);
    expect(docTotalPaise({ ...d, share_pct: null }, 70)).toBe(140000 + 77000);
    expect(piecesOf(d)).toBe(3);
    expect(mrpValueOf(d)).toBe(310000);
  });
});
```

Create `lib/retail/aging.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ageBand, invoiceDeadline } from "./aging";

describe("six-month rule", () => {
  it("sets the deadline six months after the batch was sent", () => {
    expect(invoiceDeadline("2026-04-15")).toBe("2026-10-15");
  });
  it("is ok until five months, amber from five, red from six", () => {
    expect(ageBand("2026-04-15", "2026-09-14")).toBe("ok");
    expect(ageBand("2026-04-15", "2026-09-15")).toBe("amber");
    expect(ageBand("2026-04-15", "2026-10-14")).toBe("amber");
    expect(ageBand("2026-04-15", "2026-10-15")).toBe("red");
  });
});
```

Create `lib/retail/holdings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { balance, doc, line, payment, retailer } from "./__fixtures__/retail";
import { holdingsFrom, retailerSummary } from "./holdings";

const TODAY = "2026-11-08";

describe("holdingsFrom", () => {
  it("groups batches per size, oldest first, dropping empty batches", () => {
    const h = holdingsFrom(
      [
        balance({ batch_line_id: "b2", sent_on: "2026-10-20", mrp_paise: 110000, held: 2 }),
        balance({ batch_line_id: "b1", sent_on: "2026-05-01", held: 1 }),
        balance({ batch_line_id: "b0", held: 0 }),
        balance({ batch_line_id: "c1", variant_slug: "bloom-romper-0-3m", product_name: "Bloom Romper", size: "0-3M", held: 4 }),
      ],
      TODAY,
    );
    expect(h.map((x) => [x.productName, x.size, x.held])).toEqual([
      ["Bloom Romper", "0-3M", 4],
      ["Petal Pops Frock", "1-2Y", 3],
    ]);
    const frock = h[1];
    expect(frock.batches.map((b) => b.batch_line_id)).toEqual(["b1", "b2"]);
    expect(frock.mrpValuePaise).toBe(100000 + 220000);
    expect(frock.oldestSentOn).toBe("2026-05-01");
    expect(frock.band).toBe("red");
    expect(frock.batches.map((b) => b.band)).toEqual(["red", "ok"]);
  });
});

describe("retailerSummary", () => {
  it("adds up pieces, MRP value, invoiced, paid and owed, and finds the last report", () => {
    const s = retailerSummary({
      retailer: retailer(),
      balances: [balance({ held: 3 }), balance({ batch_line_id: "b9", sent_on: "2026-05-20", held: 1 })],
      docs: [
        doc(),
        doc({ id: "d2", period: "2026-09", number: "CBR/26-27/0000", consignment_lines: [line({ quantity: 2, unit_price_paise: 75000 })] }),
        doc({ id: "d3", status: "cancelled", period: "2026-08" }),
        doc({ id: "d4", status: "draft", number: null, period: "2026-11" }),
        doc({ id: "d5", kind: "challan", period: null, number: "CBC/26-27/0001" }),
      ],
      payments: [payment({ amount_paise: 100000 })],
      today: TODAY,
    });
    expect(s).toEqual({
      unitsHeld: 4,
      mrpValueHeldPaise: 400000,
      invoicedPaise: 75000 + 150000,
      paidPaise: 100000,
      owedPaise: 125000,
      lastReportedPeriod: "2026-10",
      amberBatches: 1,
      redBatches: 0,
      oldestSentOn: "2026-05-20",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/retail`
Expected: FAIL, cannot resolve `./dates`, `./gstin`, `./pricing`, `./aging`, `./holdings`, `../types`.

- [ ] **Step 3: Implement the modules**

Create `lib/retail/types.ts`:

```ts
/** Retail consignment rows as PostgREST returns them. Money is integer paise. */
export type DocKind = "challan" | "sale" | "return";
export type DocStatus = "draft" | "issued" | "cancelled";
export type PaymentMethod = "upi" | "bank" | "cash";

export interface Retailer {
  id: string;
  legal_name: string;
  trade_name: string | null;
  gstin: string;
  state_code: string;
  address: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  our_share_pct: number;
  active: boolean;
  created_at: string;
}

export interface ConsignmentLine {
  id: string;
  doc_id: string;
  variant_slug: string;
  product_name: string;
  size: string;
  quantity: number;
  mrp_paise: number;
  /** The issued challan line (batch) a sale or return line draws on. */
  batch_line_id: string | null;
  /** Sale lines, set when the sale is issued. */
  unit_price_paise: number | null;
}

export interface ConsignmentDoc {
  id: string;
  retailer_id: string;
  kind: DocKind;
  status: DocStatus;
  number: string | null;
  /** YYYY-MM-DD. */
  doc_date: string;
  /** YYYY-MM, sales only. */
  period: string | null;
  share_pct: number | null;
  note: string | null;
  created_at: string;
  issued_at: string | null;
  cancelled_at: string | null;
  consignment_lines: ConsignmentLine[];
}

/** One row of public.retailer_batch_balances: an issued challan line and what the shop still holds of it. */
export interface BatchBalance {
  batch_line_id: string;
  retailer_id: string;
  variant_slug: string;
  product_name: string;
  size: string;
  mrp_paise: number;
  sent_on: string;
  challan_number: string;
  sent: number;
  held: number;
}

export interface RetailerPayment {
  id: string;
  retailer_id: string;
  doc_id: string | null;
  amount_paise: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  created_at: string;
}

/** One problem in an uploaded sales sheet. `row` is the spreadsheet row number. */
export interface RowError {
  row: number;
  code: string;
  message: string;
}
```

Create `lib/retail/dates.ts`:

```ts
import { istParts } from "@/lib/admin/sales-range";

const pad = (n: number) => String(n).padStart(2, "0");
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Today's IST calendar date, YYYY-MM-DD. */
export function istToday(now: Date): string {
  const { y, m, day } = istParts(now);
  return `${y}-${pad(m + 1)}-${pad(day)}`;
}

/** The current IST month, YYYY-MM. */
export function currentPeriod(now: Date): string {
  return istToday(now).slice(0, 7);
}

export function isPeriod(v: unknown): v is string {
  return typeof v === "string" && PERIOD_RE.test(v);
}

/** A real calendar date written YYYY-MM-DD. */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const match = DATE_RE.exec(v);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The last `count` months, newest first, starting with the current IST month. */
export function recentPeriods(now: Date, count: number): string[] {
  const { y, m } = istParts(now);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - i, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  });
}

/** `date` plus whole months, clamped to the target month's last day (31 Aug + 6 → 28 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  const t = new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay)));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** "08-10-2026" for "2026-10-08". */
export function formatDay(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}-${m}-${y}`;
}
```

Create `lib/retail/gstin.ts`:

```ts
import { gstStateName } from "@/lib/invoice/state-codes";

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** The GSTIN check character (15th) for its first 14 characters. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export type GstinResult =
  | { ok: true; gstin: string; stateCode: string; stateName: string }
  | { ok: false; error: string };

/** Format, state code and check character. Spaces are dropped and letters upper-cased. */
export function validateGstin(raw: unknown): GstinResult {
  const gstin = typeof raw === "string" ? raw.replace(/\s+/g, "").toUpperCase() : "";
  if (!gstin) return { ok: false, error: "Enter the shop's GSTIN" };
  if (!PATTERN.test(gstin)) return { ok: false, error: "A GSTIN has 15 characters, like 29ABCDE1234F1ZW" };
  const stateCode = gstin.slice(0, 2);
  const stateName = gstStateName(stateCode);
  if (!stateName) return { ok: false, error: `${stateCode} is not a GST state code` };
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) {
    return { ok: false, error: "This GSTIN's last character doesn't match: check for a typo" };
  }
  return { ok: true, gstin, stateCode, stateName };
}
```

Create `lib/retail/pricing.ts`:

```ts
import { HSN_BABY_GARMENTS, SELLER } from "@/lib/config/business";
import { computeGst, taxModeFor, type GstComputation } from "@/lib/invoice/gst";
import type { ConsignmentDoc, ConsignmentLine } from "./types";

/** The shop's price for one piece: our share of the tag MRP, GST included, rounded to the paisa once. */
export function unitPricePaise(mrpPaise: number, sharePct: number): number {
  return Math.round((mrpPaise * sharePct) / 100);
}

export interface PricedSaleLine {
  description: string;
  productName: string;
  size: string;
  quantity: number;
  mrpPaise: number;
  unitPricePaise: number;
}

/**
 * Invoice lines for a sale: batch lines with the same product, size, MRP and
 * price are merged, in first-seen order. An issued line's stored price wins
 * over `sharePct` (the draft preview uses the shop's current share).
 */
export function priceSaleLines(lines: ConsignmentLine[], sharePct: number): PricedSaleLine[] {
  const merged = new Map<string, PricedSaleLine>();
  for (const l of lines) {
    const price = l.unit_price_paise ?? unitPricePaise(l.mrp_paise, sharePct);
    const key = `${l.product_name}|${l.size}|${l.mrp_paise}|${price}`;
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
        unitPricePaise: price,
      });
    }
  }
  return [...merged.values()];
}

/** GST split of a shop invoice: intra-state when the shop is in the seller's state. */
export function retailGst(lines: PricedSaleLine[], shopStateCode: string, homeStateCode: string = SELLER.stateCode): GstComputation {
  return computeGst({
    lines: lines.map((l) => ({ description: l.description, hsn: HSN_BABY_GARMENTS, quantity: l.quantity, unitPrice: l.unitPricePaise / 100 })),
    discountRupees: 0,
    deliveryChargeRupees: 0,
    mode: taxModeFor(shopStateCode, homeStateCode),
  });
}

/** What a sale document charges the shop (GST included). */
export function docTotalPaise(doc: Pick<ConsignmentDoc, "consignment_lines" | "share_pct">, fallbackSharePct: number): number {
  const share = doc.share_pct ?? fallbackSharePct;
  return doc.consignment_lines.reduce((sum, l) => sum + (l.unit_price_paise ?? unitPricePaise(l.mrp_paise, share)) * l.quantity, 0);
}

export function piecesOf(doc: Pick<ConsignmentDoc, "consignment_lines">): number {
  return doc.consignment_lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function mrpValueOf(doc: Pick<ConsignmentDoc, "consignment_lines">): number {
  return doc.consignment_lines.reduce((sum, l) => sum + l.mrp_paise * l.quantity, 0);
}
```

Create `lib/retail/aging.ts`:

```ts
import { addMonths } from "./dates";

export type AgeBand = "ok" | "amber" | "red";

/** Section 31(7) CGST Act: goods sent on sale-or-return must be invoiced six months after removal at the latest. */
export const SALE_OR_RETURN_MONTHS = 6;
export const AGE_WARNING_MONTHS = 5;

export function invoiceDeadline(sentOn: string): string {
  return addMonths(sentOn, SALE_OR_RETURN_MONTHS);
}

/** Both dates YYYY-MM-DD (IST calendar days). */
export function ageBand(sentOn: string, today: string): AgeBand {
  if (today >= invoiceDeadline(sentOn)) return "red";
  if (today >= addMonths(sentOn, AGE_WARNING_MONTHS)) return "amber";
  return "ok";
}
```

Create `lib/retail/holdings.ts`:

```ts
import { ageBand, type AgeBand } from "./aging";
import { docTotalPaise } from "./pricing";
import type { BatchBalance, ConsignmentDoc, Retailer, RetailerPayment } from "./types";

export type HoldingBatch = BatchBalance & { band: AgeBand };

/** What a shop holds of one size, across batches (oldest first). */
export interface Holding {
  variantSlug: string;
  productName: string;
  size: string;
  held: number;
  mrpValuePaise: number;
  oldestSentOn: string;
  /** The oldest batch's band. */
  band: AgeBand;
  batches: HoldingBatch[];
}

const byAge = (a: BatchBalance, b: BatchBalance) => a.sent_on.localeCompare(b.sent_on) || a.batch_line_id.localeCompare(b.batch_line_id);

export function holdingsFrom(balances: BatchBalance[], today: string): Holding[] {
  const groups = new Map<string, BatchBalance[]>();
  for (const b of balances) {
    if (b.held <= 0) continue;
    groups.set(b.variant_slug, [...(groups.get(b.variant_slug) ?? []), b]);
  }
  return [...groups.values()]
    .map((list) => {
      const batches = [...list].sort(byAge).map((b) => ({ ...b, band: ageBand(b.sent_on, today) }));
      const first = batches[0];
      return {
        variantSlug: first.variant_slug,
        productName: first.product_name,
        size: first.size,
        held: batches.reduce((s, b) => s + b.held, 0),
        mrpValuePaise: batches.reduce((s, b) => s + b.held * b.mrp_paise, 0),
        oldestSentOn: first.sent_on,
        band: first.band,
        batches,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName) || a.size.localeCompare(b.size));
}

export interface RetailerSummary {
  unitsHeld: number;
  mrpValueHeldPaise: number;
  /** Issued (not cancelled) shop invoices. */
  invoicedPaise: number;
  paidPaise: number;
  owedPaise: number;
  /** Latest month with an issued sales report (including "nothing sold"). */
  lastReportedPeriod: string | null;
  amberBatches: number;
  redBatches: number;
  oldestSentOn: string | null;
}

export function retailerSummary(input: {
  retailer: Retailer;
  balances: BatchBalance[];
  docs: ConsignmentDoc[];
  payments: RetailerPayment[];
  today: string;
}): RetailerSummary {
  const held = input.balances.filter((b) => b.held > 0);
  const bands = held.map((b) => ageBand(b.sent_on, input.today));
  const sales = input.docs.filter((d) => d.kind === "sale" && d.status === "issued");
  const invoicedPaise = sales.reduce((s, d) => s + docTotalPaise(d, input.retailer.our_share_pct), 0);
  const paidPaise = input.payments.reduce((s, p) => s + p.amount_paise, 0);
  const periods = sales.map((d) => d.period).filter((p): p is string => Boolean(p)).sort();
  const sentDates = held.map((b) => b.sent_on).sort();
  return {
    unitsHeld: held.reduce((s, b) => s + b.held, 0),
    mrpValueHeldPaise: held.reduce((s, b) => s + b.held * b.mrp_paise, 0),
    invoicedPaise,
    paidPaise,
    owedPaise: invoicedPaise - paidPaise,
    lastReportedPeriod: periods.length ? periods[periods.length - 1] : null,
    amberBatches: bands.filter((b) => b === "amber").length,
    redBatches: bands.filter((b) => b === "red").length,
    oldestSentOn: sentDates[0] ?? null,
  };
}
```

Create `lib/retail/api-types.ts`:

```ts
import type { Holding, RetailerSummary } from "./holdings";
import type { ConsignmentDoc, Retailer, RetailerPayment } from "./types";

export interface RetailerListItem {
  retailer: Retailer;
  summary: RetailerSummary;
}

export interface RetailerListResponse {
  items: RetailerListItem[];
  /** Last completed IST month, YYYY-MM. */
  lastPeriod: string;
  /** Active shops that held stock by then and have no issued report for it. */
  missingLastPeriod: string[];
  today: string;
}

export interface RetailerDetail {
  retailer: Retailer;
  summary: RetailerSummary;
  holdings: Holding[];
  docs: ConsignmentDoc[];
  payments: RetailerPayment[];
  today: string;
}

export interface VariantOption {
  slug: string;
  productName: string;
  size: string;
  pricePaise: number;
  stock: number;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/retail`
Expected: PASS (5 files).

- [ ] **Step 5: Commit**

```bash
git add lib/retail
git commit -m "feat(retail): GSTIN check, pricing, aging and holdings modules"
```

---

### Task 4: Sales sheet (download and parse)

**Files:**
- Create: `lib/retail/sheet.ts`
- Test: `lib/retail/sheet.test.ts`
- Modify: `package.json` (move `read-excel-file` to `dependencies`)

**Interfaces:**
- Consumes: `Holding` (Task 3), `RowError` (Task 3), `monthLabel` (`lib/gst/register-month.ts`), `write-excel-file/node`.
- Produces: `SALES_SHEET`, `ABOUT_SHEET`, `TEMPLATE_ID`, `SALES_COLUMNS`, `SheetShop { id: string; name: string }`, `buildSalesSheet(input: { shop: SheetShop; month: string; holdings: Holding[] }): Promise<Buffer>`, `salesSheetFileName(shopName: string, month: string): string`, `ParsedSheet { sheet: string; data: Cell[][] }`, `SheetLine { variant_slug: string; quantity: number }`, `ParseResult`, `parseSalesSheet(sheets: ParsedSheet[], expected: { shop: SheetShop; month: string; holdings: Pick<Holding, "variantSlug" | "held" | "productName" | "size">[] }): ParseResult`.

Deviation from the spec, deliberate: `write-excel-file` cannot hide a sheet, so the shop/month marker lives on a visible second sheet named "About" with a "Do not edit" note. The MRP column is informational and is not checked on upload (FIFO pricing comes from our batches, never from the sheet).

- [ ] **Step 1: Move the reader into runtime dependencies**

Run: `npm install read-excel-file@^9.3.10 --save`
Expected: `package.json` lists `"read-excel-file"` under `dependencies` and no longer under `devDependencies`.

- [ ] **Step 2: Write the failing test**

Create `lib/retail/sheet.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import readExcelFile from "read-excel-file/node";
import { balance } from "./__fixtures__/retail";
import { holdingsFrom } from "./holdings";
import { ABOUT_SHEET, buildSalesSheet, parseSalesSheet, SALES_COLUMNS, SALES_SHEET, salesSheetFileName, TEMPLATE_ID, type ParsedSheet } from "./sheet";

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
const expected = { shop: SHOP, month: MONTH, holdings: HOLDINGS };

function sheets(rows: unknown[][], about?: unknown[][]): ParsedSheet[] {
  return [
    { sheet: SALES_SHEET, data: [[...SALES_COLUMNS], ...rows] as ParsedSheet["data"] },
    { sheet: ABOUT_SHEET, data: (about ?? [["Shop", SHOP.name], ["Shop id", SHOP.id], ["Month", MONTH], ["Template", TEMPLATE_ID]]) as ParsedSheet["data"] },
  ];
}

describe("buildSalesSheet", () => {
  it("writes one row per held size with a blank Sold column, and an About sheet", async () => {
    const book = await readExcelFile(await buildSalesSheet(expected));
    const sales = book.find((s) => s.sheet === SALES_SHEET)!.data;
    expect(sales[0]).toEqual([...SALES_COLUMNS]);
    expect(sales.slice(1)).toEqual([
      ["bloom-romper-0-3m", "Bloom Romper", "0-3M", 1000, 2, null],
      ["petal-frock-1-2y", "Petal Pops Frock", "1-2Y", "1,000.00 / 1,100.00", 4, null],
    ]);
    const about = book.find((s) => s.sheet === ABOUT_SHEET)!.data;
    expect(about).toContainEqual(["Shop id", SHOP.id]);
    expect(about).toContainEqual(["Month", MONTH]);
    expect(about).toContainEqual(["Template", TEMPLATE_ID]);
  });

  it("round-trips: an untouched download parses as nothing sold", async () => {
    const book = await readExcelFile(await buildSalesSheet(expected));
    expect(parseSalesSheet(book as ParsedSheet[], expected)).toEqual({ ok: true, lines: [] });
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
    expect(r).toEqual({ ok: true, lines: [{ variant_slug: "petal-frock-1-2y", quantity: 3 }, { variant_slug: "bloom-romper-0-3m", quantity: 1 }] });
  });

  it("reports each bad row with its spreadsheet row number", () => {
    const r = parseSalesSheet(
      sheets([
        ["petal-frock-1-2y", "", "", null, null, 2.5],
        ["bloom-romper-0-3m", "", "", null, null, -1],
        ["ghost-code", "", "", null, null, 1],
        [null, "", "", null, null, 3],
        ["ghost-zero", "", "", null, null, 0],
      ]),
      expected,
    );
    expect(r).toEqual({
      ok: false,
      rowErrors: [
        { row: 2, code: "petal-frock-1-2y", message: 'Sold must be a whole number of pieces (found "2.5")' },
        { row: 3, code: "bloom-romper-0-3m", message: 'Sold must be a whole number of pieces (found "-1")' },
        { row: 4, code: "ghost-code", message: "ghost-code is not stock this shop holds" },
        { row: 5, code: "", message: "This row has a quantity but no code" },
      ],
    });
  });

  it("refuses selling more than the shop holds, at the code's first row", () => {
    const r = parseSalesSheet(sheets([["bloom-romper-0-3m", "", "", null, null, 2], ["bloom-romper-0-3m", "", "", null, null, 1]]), expected);
    expect(r).toEqual({ ok: false, rowErrors: [{ row: 2, code: "bloom-romper-0-3m", message: "Sold 3 of Bloom Romper (0-3M) but the shop holds 2" }] });
  });

  it("refuses a sheet for another shop or month, or with changed columns", () => {
    const wrong = "Please use the sheet downloaded for Kids Corner, Oct 2026";
    expect(parseSalesSheet(sheets([], [["Shop id", "other"], ["Month", MONTH], ["Template", TEMPLATE_ID]]), expected)).toEqual({ ok: false, fileError: wrong });
    expect(parseSalesSheet(sheets([], [["Shop id", SHOP.id], ["Month", "2026-09"], ["Template", TEMPLATE_ID]]), expected)).toEqual({ ok: false, fileError: wrong });
    expect(parseSalesSheet([{ sheet: "Sheet1", data: [] }], expected)).toEqual({ ok: false, fileError: wrong });
    const renamed = sheets([]);
    renamed[0].data[0] = ["Code", "Product", "Size", "MRP", "You hold", "Sold"];
    expect(parseSalesSheet(renamed, expected)).toEqual({ ok: false, fileError: `${wrong}. Its column headings were changed.` });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run lib/retail/sheet.test.ts`
Expected: FAIL, cannot resolve `./sheet`.

- [ ] **Step 4: Implement**

Create `lib/retail/sheet.ts`:

```ts
import writeExcelFile, { type Row, type SheetData } from "write-excel-file/node";
import { monthLabel } from "@/lib/gst/register-month";
import type { Holding } from "./holdings";
import type { RowError } from "./types";

/** Server-only: the monthly sales sheet a shop fills in, and the parser for the filled copy. */
export const SALES_SHEET = "Sales";
export const ABOUT_SHEET = "About";
export const TEMPLATE_ID = "cozyberries-retail-sales-v1";
export const SALES_COLUMNS = ["Code (do not edit)", "Product", "Size", "MRP", "You hold", "Sold this month"] as const;

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
}
export type ParseResult =
  | { ok: true; lines: SheetLine[] }
  | { ok: false; fileError: string; rowErrors?: undefined }
  | { ok: false; rowErrors: RowError[]; fileError?: undefined };

// Every text cell is typed String, so a value starting with "=" is stored as text, never as a formula.
const text = (value: string) => ({ value, type: String });
const head = (labels: readonly string[]): Row => labels.map((value) => ({ value, fontWeight: "bold" as const }));
const RUPEES = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function mrpCell(h: Holding) {
  const mrps = [...new Set(h.batches.map((b) => b.mrp_paise))].sort((a, b) => a - b);
  if (mrps.length === 1) return { value: mrps[0] / 100, type: Number, format: "#,##0.00" };
  return text(mrps.map((p) => RUPEES.format(p / 100)).join(" / "));
}

export async function buildSalesSheet({ shop, month, holdings }: { shop: SheetShop; month: string; holdings: Holding[] }): Promise<Buffer> {
  const sales: SheetData = [
    head(SALES_COLUMNS),
    ...holdings.map((h) => [text(h.variantSlug), text(h.productName), text(h.size), mrpCell(h), { value: h.held, type: Number }, null]),
  ];
  const about: SheetData = [
    [text("Shop"), text(shop.name)],
    [text("Shop id"), text(shop.id)],
    [text("Month"), text(month)],
    [text("Template"), text(TEMPLATE_ID)],
    [],
    [text("How to fill"), text(`Type how many pieces of each size sold in ${monthLabel(month)} in the "Sold this month" column of the Sales sheet. Leave it blank if none sold.`)],
    [text("Do not edit"), text("This sheet, the codes, or any column heading. Send the file back as it is.")],
  ];
  return writeExcelFile([
    { sheet: SALES_SHEET, data: sales, columns: [{ width: 30 }, { width: 36 }, { width: 10 }, { width: 18 }, { width: 10 }, { width: 16 }], stickyRowsCount: 1 },
    { sheet: ABOUT_SHEET, data: about, columns: [{ width: 14 }, { width: 90 }] },
  ]).toBuffer();
}

export function salesSheetFileName(shopName: string, month: string): string {
  const slug = shopName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `cozyberries-sales-${slug || "shop"}-${month}.xlsx`;
}

type Sold = { kind: "blank" } | { kind: "ok"; value: number } | { kind: "bad" };

function parseSold(cell: Cell | undefined): Sold {
  if (cell === null || cell === undefined) return { kind: "blank" };
  if (typeof cell === "number") return Number.isInteger(cell) && cell >= 0 ? { kind: "ok", value: cell } : { kind: "bad" };
  if (typeof cell === "string") {
    const t = cell.trim();
    if (t === "") return { kind: "blank" };
    if (/^\d+(\.0+)?$/.test(t)) return { kind: "ok", value: Number(t) };
  }
  return { kind: "bad" };
}

const str = (cell: Cell | undefined) => (cell === null || cell === undefined ? "" : String(cell).trim());

export function parseSalesSheet(
  sheets: ParsedSheet[],
  expected: { shop: SheetShop; month: string; holdings: Pick<Holding, "variantSlug" | "held" | "productName" | "size">[] },
): ParseResult {
  const wrongFile = `Please use the sheet downloaded for ${expected.shop.name}, ${monthLabel(expected.month)}`;
  const about = sheets.find((s) => s.sheet === ABOUT_SHEET);
  const sales = sheets.find((s) => s.sheet === SALES_SHEET);
  if (!about || !sales) return { ok: false, fileError: wrongFile };

  const meta = new Map(about.data.map((r) => [str(r[0]), str(r[1])] as const));
  if (meta.get("Template") !== TEMPLATE_ID || meta.get("Shop id") !== expected.shop.id || meta.get("Month") !== expected.month) {
    return { ok: false, fileError: wrongFile };
  }
  const header = (sales.data[0] ?? []).map(str);
  if (SALES_COLUMNS.some((label, i) => header[i] !== label)) {
    return { ok: false, fileError: `${wrongFile}. Its column headings were changed.` };
  }

  const held = new Map(expected.holdings.map((h) => [h.variantSlug, h]));
  const totals = new Map<string, { quantity: number; firstRow: number }>();
  const errors: RowError[] = [];

  sales.data.slice(1).forEach((r, i) => {
    const row = i + 2;
    const code = str(r[0]);
    const sold = parseSold(r[5]);
    if (sold.kind === "bad") {
      errors.push({ row, code, message: `Sold must be a whole number of pieces (found "${str(r[5])}")` });
      return;
    }
    const quantity = sold.kind === "ok" ? sold.value : 0;
    if (!code) {
      if (quantity > 0) errors.push({ row, code: "", message: "This row has a quantity but no code" });
      return;
    }
    if (!held.has(code)) {
      if (quantity > 0) errors.push({ row, code, message: `${code} is not stock this shop holds` });
      return;
    }
    const t = totals.get(code);
    if (t) t.quantity += quantity;
    else totals.set(code, { quantity, firstRow: row });
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
    lines: [...totals].filter(([, t]) => t.quantity > 0).map(([variant_slug, t]) => ({ variant_slug, quantity: t.quantity })),
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run lib/retail/sheet.test.ts`
Expected: PASS. If `readExcelFile` returns the blank Sold cell as `undefined`-trimmed rows (shorter arrays) instead of `null`, adjust only the `toEqual` row expectations in the first test to the actual shape; the parser already treats both as blank.

- [ ] **Step 6: Commit**

```bash
git add lib/retail/sheet.ts lib/retail/sheet.test.ts package.json package-lock.json
git commit -m "feat(retail): monthly sales sheet download and upload parser"
```

---

### Task 5: Invoice and challan documents and PDFs

**Files:**
- Create: `lib/retail/documents.ts`, `lib/retail/pdf.tsx`
- Test: `lib/retail/documents.test.ts`, `lib/retail/pdf.test.ts`

**Interfaces:**
- Consumes: `priceSaleLines`, `retailGst`, `mrpValueOf`, `piecesOf` (Task 3); `amountInWords(paise)`; `gstStateName`; `SELLER`, `HSN_BABY_GARMENTS`; `InvoiceLine`, `InvoiceTotals`, `TaxMode` (`lib/invoice/gst.ts`).
- Produces:
  - `Party { legalName: string; tradeName: string | null; gstin: string; addressLines: string[]; stateName: string; stateCode: string }`
  - `RetailInvoiceDocument { status: DocStatus; number: string | null; date: string; period: string; seller: Party; buyer: Party; placeOfSupply: { code: string; name: string }; mode: TaxMode; sharePct: number; lines: (InvoiceLine & { mrpPaise: number })[]; totals: InvoiceTotals; totalMrpPaise: number; amountInWords: string; challanNumbers: string[] }`
  - `buildRetailInvoice(input: { doc: ConsignmentDoc; retailer: Retailer; gstin: string; challanNumbers: string[] }): RetailInvoiceDocument`
  - `ChallanDocument { status: DocStatus; number: string | null; date: string; seller: Party; consignee: Party; lines: { description: string; hsn: string; quantity: number; mrpPaise: number; valuePaise: number }[]; totalQuantity: number; totalMrpPaise: number }`
  - `buildChallan(input: { doc: ConsignmentDoc; retailer: Retailer; gstin: string }): ChallanDocument`
  - `retailPdfFilename(doc: Pick<ConsignmentDoc, "id" | "kind" | "number">): string`
  - `renderRetailInvoicePdf(doc: RetailInvoiceDocument): Promise<Buffer>`, `renderChallanPdf(doc: ChallanDocument): Promise<Buffer>`

- [ ] **Step 1: Write the failing tests**

Create `lib/retail/documents.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { doc, line, retailer, TN_GSTIN } from "./__fixtures__/retail";
import { buildChallan, buildRetailInvoice, retailPdfFilename } from "./documents";

const GSTIN = "29EPDPR9174E1ZB";

describe("buildRetailInvoice", () => {
  it("bills the shop 75% of MRP with GST worked out of it, intra-state", () => {
    const inv = buildRetailInvoice({
      doc: doc({ consignment_lines: [line({ quantity: 2, unit_price_paise: 75000 }), line({ id: "l2", mrp_paise: 110000, unit_price_paise: 82500 })] }),
      retailer: retailer(),
      gstin: GSTIN,
      challanNumbers: ["CBC/26-27/0001"],
    });
    expect(inv.number).toBe("CBR/26-27/0001");
    expect(inv.date).toBe("2026-10-31");
    expect(inv.buyer).toMatchObject({ legalName: "Kids Corner LLP", tradeName: "Kids Corner", gstin: "29AAGFC4321M1ZB", stateName: "Karnataka", addressLines: ["12 MG Road", "Bengaluru 560001"] });
    expect(inv.seller).toMatchObject({ gstin: GSTIN, stateCode: "29" });
    expect(inv.placeOfSupply).toEqual({ code: "29", name: "Karnataka" });
    expect(inv.mode).toBe("intra");
    expect(inv.lines.map((l) => [l.description, l.quantity, l.mrpPaise, l.unitPricePaise, l.amountPaise])).toEqual([
      ["Petal Pops Frock (1-2Y)", 2, 100000, 75000, 150000],
      ["Petal Pops Frock (1-2Y)", 1, 110000, 82500, 82500],
    ]);
    expect(inv.totals.totalPaise).toBe(232500);
    expect(inv.totals.taxablePaise + inv.totals.cgstPaise + inv.totals.sgstPaise).toBe(232500);
    expect(inv.totalMrpPaise).toBe(310000);
    expect(inv.amountInWords).toMatch(/^Rupees Two Thousand Three Hundred Twenty Five/);
    expect(inv.challanNumbers).toEqual(["CBC/26-27/0001"]);
  });

  it("charges IGST to a shop in Tamil Nadu", () => {
    const inv = buildRetailInvoice({ doc: doc(), retailer: retailer({ gstin: TN_GSTIN, state_code: "33" }), gstin: GSTIN, challanNumbers: [] });
    expect(inv.mode).toBe("inter");
    expect(inv.placeOfSupply).toEqual({ code: "33", name: "Tamil Nadu" });
    expect(inv.totals.igstPaise).toBe(3571);
  });

  it("previews a draft at the shop's current share", () => {
    const inv = buildRetailInvoice({ doc: doc({ status: "draft", number: null, share_pct: null, consignment_lines: [line()] }), retailer: retailer({ our_share_pct: 70 }), gstin: GSTIN, challanNumbers: [] });
    expect(inv.sharePct).toBe(70);
    expect(inv.totals.totalPaise).toBe(70000);
  });

  it("refuses a document that is not a sale", () => {
    expect(() => buildRetailInvoice({ doc: doc({ kind: "challan", period: null }), retailer: retailer(), gstin: GSTIN, challanNumbers: [] })).toThrow("Not a sale document");
  });
});

describe("buildChallan", () => {
  it("lists pieces at MRP with totals", () => {
    const ch = buildChallan({
      doc: doc({ kind: "challan", number: "CBC/26-27/0004", period: null, share_pct: null, doc_date: "2026-10-02", consignment_lines: [line({ quantity: 3 }), line({ id: "l2", product_name: "Bloom Romper", size: "0-3M", mrp_paise: 89900, quantity: 2 })] }),
      retailer: retailer(),
      gstin: GSTIN,
    });
    expect(ch.number).toBe("CBC/26-27/0004");
    expect(ch.lines).toEqual([
      { description: "Bloom Romper (0-3M)", hsn: "6111", quantity: 2, mrpPaise: 89900, valuePaise: 179800 },
      { description: "Petal Pops Frock (1-2Y)", hsn: "6111", quantity: 3, mrpPaise: 100000, valuePaise: 300000 },
    ]);
    expect(ch.totalQuantity).toBe(5);
    expect(ch.totalMrpPaise).toBe(479800);
  });
});

describe("retailPdfFilename", () => {
  it("uses the number, or a draft name", () => {
    expect(retailPdfFilename({ id: "abcdef12-0000", kind: "sale", number: "CBR/26-27/0001" })).toBe("CBR-26-27-0001.pdf");
    expect(retailPdfFilename({ id: "abcdef12-0000", kind: "challan", number: null })).toBe("draft-challan-abcdef12.pdf");
  });
});
```

Create `lib/retail/pdf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { doc, line, retailer } from "./__fixtures__/retail";
import { buildChallan, buildRetailInvoice } from "./documents";
import { renderChallanPdf, renderRetailInvoicePdf } from "./pdf";

const GSTIN = "29EPDPR9174E1ZB";

describe("retail PDFs", () => {
  it("renders the invoice as a PDF", async () => {
    const pdf = await renderRetailInvoicePdf(buildRetailInvoice({ doc: doc(), retailer: retailer(), gstin: GSTIN, challanNumbers: ["CBC/26-27/0001"] }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 20_000);

  it("renders the challan as a PDF", async () => {
    const pdf = await renderChallanPdf(buildChallan({ doc: doc({ kind: "challan", period: null, consignment_lines: [line({ quantity: 2 })] }), retailer: retailer(), gstin: GSTIN }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 20_000);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/retail/documents.test.ts lib/retail/pdf.test.ts`
Expected: FAIL, cannot resolve `./documents` / `./pdf`.

- [ ] **Step 3: Implement**

Create `lib/retail/documents.ts`:

```ts
import { HSN_BABY_GARMENTS, SELLER } from "@/lib/config/business";
import { amountInWords } from "@/lib/invoice/amount-in-words";
import type { InvoiceLine, InvoiceTotals, TaxMode } from "@/lib/invoice/gst";
import { gstStateName } from "@/lib/invoice/state-codes";
import { mrpValueOf, piecesOf, priceSaleLines, retailGst } from "./pricing";
import type { ConsignmentDoc, DocStatus, Retailer } from "./types";

export interface Party {
  legalName: string;
  tradeName: string | null;
  gstin: string;
  addressLines: string[];
  stateName: string;
  stateCode: string;
}

export interface RetailInvoiceDocument {
  status: DocStatus;
  number: string | null;
  /** YYYY-MM-DD. */
  date: string;
  period: string;
  seller: Party;
  buyer: Party;
  placeOfSupply: { code: string; name: string };
  mode: TaxMode;
  sharePct: number;
  lines: (InvoiceLine & { mrpPaise: number })[];
  totals: InvoiceTotals;
  totalMrpPaise: number;
  amountInWords: string;
  challanNumbers: string[];
}

export interface ChallanDocument {
  status: DocStatus;
  number: string | null;
  date: string;
  seller: Party;
  consignee: Party;
  lines: { description: string; hsn: string; quantity: number; mrpPaise: number; valuePaise: number }[];
  totalQuantity: number;
  totalMrpPaise: number;
}

function sellerParty(gstin: string): Party {
  const stateCode = gstin.slice(0, 2);
  return {
    legalName: SELLER.legalName,
    tradeName: null,
    gstin,
    addressLines: [...SELLER.addressLines],
    stateName: gstStateName(stateCode) ?? SELLER.stateName,
    stateCode,
  };
}

function shopParty(r: Retailer): Party {
  return {
    legalName: r.legal_name,
    tradeName: r.trade_name,
    gstin: r.gstin,
    addressLines: r.address.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    stateName: gstStateName(r.state_code) ?? r.state_code,
    stateCode: r.state_code,
  };
}

/** A B2B tax invoice for one sales report. Draft documents preview at the shop's current share. */
export function buildRetailInvoice({ doc, retailer, gstin, challanNumbers }: { doc: ConsignmentDoc; retailer: Retailer; gstin: string; challanNumbers: string[] }): RetailInvoiceDocument {
  if (doc.kind !== "sale" || !doc.period) throw new Error("Not a sale document");
  const sharePct = Number(doc.share_pct ?? retailer.our_share_pct);
  const priced = priceSaleLines(doc.consignment_lines, sharePct);
  const gst = retailGst(priced, retailer.state_code, gstin.slice(0, 2));
  const buyer = shopParty(retailer);
  return {
    status: doc.status,
    number: doc.number,
    date: doc.doc_date,
    period: doc.period,
    seller: sellerParty(gstin),
    buyer,
    placeOfSupply: { code: buyer.stateCode, name: buyer.stateName },
    mode: gst.mode,
    sharePct,
    lines: gst.lines.map((l, i) => ({ ...l, mrpPaise: priced[i].mrpPaise })),
    totals: gst.totals,
    totalMrpPaise: priced.reduce((s, l) => s + l.mrpPaise * l.quantity, 0),
    amountInWords: amountInWords(gst.totals.totalPaise),
    challanNumbers,
  };
}

/** A delivery challan for stock sent on sale-or-return. Lines merged per product, size and MRP. */
export function buildChallan({ doc, retailer, gstin }: { doc: ConsignmentDoc; retailer: Retailer; gstin: string }): ChallanDocument {
  const merged = new Map<string, ChallanDocument["lines"][number]>();
  for (const l of doc.consignment_lines) {
    const key = `${l.product_name}|${l.size}|${l.mrp_paise}`;
    const m = merged.get(key);
    if (m) {
      m.quantity += l.quantity;
      m.valuePaise += l.quantity * l.mrp_paise;
    } else {
      merged.set(key, { description: `${l.product_name} (${l.size})`, hsn: HSN_BABY_GARMENTS, quantity: l.quantity, mrpPaise: l.mrp_paise, valuePaise: l.quantity * l.mrp_paise });
    }
  }
  return {
    status: doc.status,
    number: doc.number,
    date: doc.doc_date,
    seller: sellerParty(gstin),
    consignee: shopParty(retailer),
    lines: [...merged.values()].sort((a, b) => a.description.localeCompare(b.description) || a.mrpPaise - b.mrpPaise),
    totalQuantity: piecesOf(doc),
    totalMrpPaise: mrpValueOf(doc),
  };
}

export function retailPdfFilename(doc: Pick<ConsignmentDoc, "id" | "kind" | "number">): string {
  return doc.number ? `${doc.number.replace(/\//g, "-")}.pdf` : `draft-${doc.kind}-${doc.id.slice(0, 8)}.pdf`;
}
```

Create `lib/retail/pdf.tsx`:

```tsx
import React from "react";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatDay } from "./dates";
import type { ChallanDocument, Party, RetailInvoiceDocument } from "./documents";

/**
 * Server-only. Shop invoice and delivery challan PDFs, emailed by the owner.
 * "Rs." because the built-in PDF fonts have no ₹ glyph (same as lib/invoice/pdf.tsx).
 */
Font.registerHyphenationCallback((word) => [word]);

const rs = (paise: number) => "Rs. " + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#1f2937" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  seller: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#9a3412" },
  heading: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right" },
  right: { textAlign: "right" },
  muted: { color: "#6b7280" },
  bold: { fontFamily: "Helvetica-Bold" },
  cancelled: { marginBottom: 12, padding: 8, borderRadius: 4, backgroundColor: "#fee2e2", color: "#7f1d1d" },
  rule: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginVertical: 10 },
  label: { fontSize: 7, color: "#9ca3af", textTransform: "uppercase", marginBottom: 2, fontFamily: "Helvetica-Bold" },
  half: { width: "48%" },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#d1d5db", paddingVertical: 4, color: "#6b7280", fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#f3f4f6", paddingVertical: 5 },
  cItem: { width: "30%", paddingRight: 8 },
  cHsn: { width: "8%" },
  cQty: { width: "6%", textAlign: "right" },
  cNum: { width: "11%", textAlign: "right" },
  cWide: { width: "22%", textAlign: "right" },
  totals: { marginLeft: "auto", width: "45%", marginTop: 10 },
  tline: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#d1d5db", paddingTop: 4, marginTop: 2, fontFamily: "Helvetica-Bold", fontSize: 11 },
  note: { marginTop: 14 },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, textAlign: "center", fontSize: 7, color: "#9ca3af" },
});

function SellerBlock({ seller }: { seller: Party }) {
  return (
    <View>
      <Text style={s.seller}>{seller.legalName}</Text>
      {seller.addressLines.map((l) => <Text key={l} style={s.muted}>{l}</Text>)}
      <Text style={s.muted}>State: {seller.stateName} ({seller.stateCode})</Text>
      <Text style={s.bold}>GSTIN: {seller.gstin}</Text>
    </View>
  );
}

function PartyBlock({ label, party }: { label: string; party: Party }) {
  return (
    <View style={s.half}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.bold}>{party.legalName}</Text>
      {party.tradeName && party.tradeName !== party.legalName && <Text style={s.muted}>({party.tradeName})</Text>}
      {party.addressLines.map((l) => <Text key={l} style={s.muted}>{l}</Text>)}
      <Text style={s.muted}>State: {party.stateName} ({party.stateCode})</Text>
      <Text style={s.bold}>GSTIN: {party.gstin}</Text>
    </View>
  );
}

function RetailInvoicePdf({ doc }: { doc: RetailInvoiceDocument }) {
  const intra = doc.mode === "intra";
  return (
    <Document title={`CozyBerries ${doc.number ?? "draft invoice"}`} author={doc.seller.legalName}>
      <Page size="A4" style={s.page}>
        {doc.status === "cancelled" && <Text style={s.cancelled}>This invoice has been cancelled.</Text>}
        <View style={s.row}>
          <SellerBlock seller={doc.seller} />
          <View>
            <Text style={s.heading}>{doc.status === "draft" ? "DRAFT — NOT A TAX INVOICE" : "TAX INVOICE"}</Text>
            {doc.number && <Text style={s.right}>Invoice No: <Text style={s.bold}>{doc.number}</Text></Text>}
            <Text style={s.right}>Invoice date: {formatDay(doc.date)}</Text>
            <Text style={[s.muted, s.right]}>Sales for {doc.period}</Text>
          </View>
        </View>
        <View style={s.rule} />
        <View style={s.row}>
          <PartyBlock label="Bill to" party={doc.buyer} />
          <View style={s.half}>
            <Text style={s.label}>Place of supply</Text>
            <Text style={s.muted}>{doc.placeOfSupply.name} ({doc.placeOfSupply.code})</Text>
            <Text style={[s.label, { marginTop: 6 }]}>Reverse charge</Text>
            <Text style={s.muted}>No</Text>
          </View>
        </View>
        <View style={{ marginTop: 14 }}>
          <View style={s.th}>
            <Text style={s.cItem}>Item</Text>
            <Text style={s.cHsn}>HSN</Text>
            <Text style={s.cQty}>Qty</Text>
            <Text style={s.cNum}>MRP</Text>
            <Text style={s.cNum}>Rate</Text>
            <Text style={s.cNum}>Taxable</Text>
            {intra ? (
              <>
                <Text style={s.cNum}>CGST 2.5%</Text>
                <Text style={s.cNum}>SGST 2.5%</Text>
              </>
            ) : (
              <Text style={s.cWide}>IGST 5%</Text>
            )}
          </View>
          {doc.lines.map((l, i) => (
            <View key={`${l.description}-${i}`} style={s.tr} wrap={false}>
              <Text style={s.cItem}>{l.description}</Text>
              <Text style={s.cHsn}>{l.hsn}</Text>
              <Text style={s.cQty}>{l.quantity}</Text>
              <Text style={s.cNum}>{rs(l.mrpPaise)}</Text>
              <Text style={s.cNum}>{rs(l.unitPricePaise)}</Text>
              <Text style={s.cNum}>{rs(l.taxablePaise)}</Text>
              {intra ? (
                <>
                  <Text style={s.cNum}>{rs(l.cgstPaise)}</Text>
                  <Text style={s.cNum}>{rs(l.sgstPaise)}</Text>
                </>
              ) : (
                <Text style={s.cWide}>{rs(l.igstPaise)}</Text>
              )}
            </View>
          ))}
        </View>
        <View style={s.totals} wrap={false}>
          <View style={s.tline}><Text style={s.muted}>Total MRP of pieces sold</Text><Text>{rs(doc.totalMrpPaise)}</Text></View>
          <View style={s.tline}><Text style={s.muted}>Taxable value</Text><Text>{rs(doc.totals.taxablePaise)}</Text></View>
          {intra ? (
            <>
              <View style={s.tline}><Text style={s.muted}>CGST</Text><Text>{rs(doc.totals.cgstPaise)}</Text></View>
              <View style={s.tline}><Text style={s.muted}>SGST</Text><Text>{rs(doc.totals.sgstPaise)}</Text></View>
            </>
          ) : (
            <View style={s.tline}><Text style={s.muted}>IGST</Text><Text>{rs(doc.totals.igstPaise)}</Text></View>
          )}
          <View style={s.grand}><Text>Total</Text><Text>{rs(doc.totals.totalPaise)}</Text></View>
        </View>
        <View style={s.note} wrap={false}>
          <Text><Text style={s.muted}>Amount in words: </Text>{doc.amountInWords}</Text>
          <Text style={{ marginTop: 3 }}>
            Supply on sale-or-return basis at {doc.sharePct}% of MRP
            {doc.challanNumbers.length ? `, against challans ${doc.challanNumbers.join(", ")}` : ""}.
          </Text>
        </View>
        <Text style={s.footer} fixed>Rates are inclusive of GST. This is a computer-generated invoice and needs no signature.</Text>
      </Page>
    </Document>
  );
}

function ChallanPdf({ doc }: { doc: ChallanDocument }) {
  return (
    <Document title={`CozyBerries ${doc.number ?? "draft challan"}`} author={doc.seller.legalName}>
      <Page size="A4" style={s.page}>
        {doc.status === "cancelled" && <Text style={s.cancelled}>This challan has been cancelled.</Text>}
        <View style={s.row}>
          <SellerBlock seller={doc.seller} />
          <View>
            <Text style={s.heading}>DELIVERY CHALLAN</Text>
            <Text style={[s.muted, s.right]}>Supply on sale-or-return basis</Text>
            {doc.number && <Text style={s.right}>Challan No: <Text style={s.bold}>{doc.number}</Text></Text>}
            <Text style={s.right}>Date: {formatDay(doc.date)}</Text>
          </View>
        </View>
        <View style={s.rule} />
        <View style={s.row}>
          <PartyBlock label="Consignee" party={doc.consignee} />
        </View>
        <View style={{ marginTop: 14 }}>
          <View style={s.th}>
            <Text style={[s.cItem, { width: "52%" }]}>Item</Text>
            <Text style={s.cHsn}>HSN</Text>
            <Text style={s.cQty}>Qty</Text>
            <Text style={s.cNum}>MRP</Text>
            <Text style={s.cWide}>Value at MRP</Text>
          </View>
          {doc.lines.map((l, i) => (
            <View key={`${l.description}-${i}`} style={s.tr} wrap={false}>
              <Text style={[s.cItem, { width: "52%" }]}>{l.description}</Text>
              <Text style={s.cHsn}>{l.hsn}</Text>
              <Text style={s.cQty}>{l.quantity}</Text>
              <Text style={s.cNum}>{rs(l.mrpPaise)}</Text>
              <Text style={s.cWide}>{rs(l.valuePaise)}</Text>
            </View>
          ))}
        </View>
        <View style={s.totals} wrap={false}>
          <View style={s.tline}><Text style={s.muted}>Pieces</Text><Text>{doc.totalQuantity}</Text></View>
          <View style={s.grand}><Text>Value at MRP</Text><Text>{rs(doc.totalMrpPaise)}</Text></View>
        </View>
        <Text style={s.note}>Goods remain the property of {doc.seller.legalName} until sold. Not a tax invoice.</Text>
        <Text style={s.footer} fixed>This is a computer-generated challan and needs no signature.</Text>
      </Page>
    </Document>
  );
}

export async function renderRetailInvoicePdf(doc: RetailInvoiceDocument): Promise<Buffer> {
  return renderToBuffer(<RetailInvoicePdf doc={doc} />);
}

export async function renderChallanPdf(doc: ChallanDocument): Promise<Buffer> {
  return renderToBuffer(<ChallanPdf doc={doc} />);
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run lib/retail/documents.test.ts lib/retail/pdf.test.ts`
Expected: PASS. If the `amountInWords` wording differs (e.g. "Indian Rupees"), change only that regex to the actual prefix printed by `amountInWords(232500)`.

- [ ] **Step 5: Commit**

```bash
git add lib/retail/documents.ts lib/retail/documents.test.ts lib/retail/pdf.tsx lib/retail/pdf.test.ts
git commit -m "feat(retail): B2B invoice and delivery challan documents and PDFs"
```

---

### Task 6: Server reads, request parsing and error mapping

**Files:**
- Create: `lib/retail/queries.ts`, `lib/retail/requests.ts`, `lib/retail/rpc-errors.ts`
- Test: `lib/retail/queries.test.ts`, `lib/retail/requests.test.ts`, `lib/retail/rpc-errors.test.ts`

**Interfaces:**
- Consumes: Task 3 modules; `fetchActiveVariants` (`lib/admin/stock-variants.ts`).
- Produces:
  - `queries.ts`: `RETAILER_COLUMNS`, `DOC_COLUMNS`, `BALANCE_COLUMNS`, `PAYMENT_COLUMNS`; `fetchRetailer(admin, id): Promise<Retailer | null>`; `fetchDoc(admin, docId): Promise<ConsignmentDoc | null>`; `fetchChallanNumbers(admin, batchLineIds: string[]): Promise<string[]>`; `loadRetailerList(admin, now: Date): Promise<RetailerListResponse>`; `loadRetailerDetail(admin, id: string, now: Date): Promise<RetailerDetail | null>`; `loadVariantOptions(admin): Promise<VariantOption[]>`; `shopName(r: Pick<Retailer, "trade_name" | "legal_name">): string`.
  - `requests.ts`: `Parsed<T> = { ok: true; value: T } | { ok: false; error: string }`; `RetailerInput`; `parseRetailer(body: unknown): Parsed<RetailerInput>`; `parseDocSave(body: unknown, now: Date): Parsed<DocSave>` where `DocSave = { kind: "challan"; doc_id: string | null; doc_date: string; lines: { variant_slug: string; quantity: number; mrp_paise: number }[] } | { kind: "return"; doc_id: string | null; doc_date: string; lines: { variant_slug: string; quantity: number }[] } | { kind: "sale"; period: string; lines: { variant_slug: string; quantity: number }[] }`; `parseDocAction(body: unknown): Parsed<{ action: "issue" | "cancel" }>`; `PaymentInput`; `parsePayment(body: unknown, now: Date): Parsed<PaymentInput>`; `isUuid(v: unknown): v is string`.
  - `rpc-errors.ts`: `retailRpcError(message: string): { status: number; error: string }`.

- [ ] **Step 1: Write the failing tests**

Create `lib/retail/rpc-errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { retailRpcError } from "./rpc-errors";

describe("retailRpcError", () => {
  it.each([
    ["NOT_FOUND", 404, "Not found"],
    ["RETAILER_INACTIVE", 409, "This shop is inactive, so no stock can be sent"],
    ["BAD_DATE", 400, "The date can't be in the future"],
    ["BAD_PERIOD", 400, "Pick a month up to this one"],
    ["NO_LINES", 400, "Add at least one item"],
    ["BAD_LINE", 400, "Each item needs a whole quantity"],
    ["UNKNOWN_VARIANT:frock-x", 400, "Unknown product size: frock-x"],
    ["OUT_OF_STOCK:Petal Pops Frock 1-2Y", 409, "Not enough stock of Petal Pops Frock 1-2Y"],
    ["NOT_HELD:2:Petal Pops Frock 1-2Y", 409, "The shop holds only 2 of Petal Pops Frock 1-2Y"],
    ["NOT_DRAFT", 409, "This is no longer a draft: refresh the page"],
    ["ALREADY_ISSUED", 409, "That month's invoice is already issued"],
    ["ALREADY_CANCELLED", 409, "Already cancelled"],
    ["IN_USE", 409, "Sales or returns already draw on this challan, so it can't be cancelled"],
    ["STOCK_GONE:Petal Pops Frock 1-2Y", 409, "Those pieces of Petal Pops Frock 1-2Y have left your stock again"],
    ["TOO_LATE", 409, "That month is closed for GST (GSTR-1 is due on the 11th). A credit note is needed: ask your CA."],
    ["something odd", 500, "Couldn't save"],
  ])("%s → %i", (message, status, error) => {
    expect(retailRpcError(message)).toEqual({ status, error });
  });
});
```

Create `lib/retail/requests.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDocAction, parseDocSave, parsePayment, parseRetailer } from "./requests";

const NOW = new Date("2026-10-08T06:00:00Z"); // 8 Oct 2026, 11:30 IST

describe("parseRetailer", () => {
  it("normalises the GSTIN, blanks and the share", () => {
    expect(parseRetailer({ legal_name: " Kids Corner LLP ", gstin: "29aagfc4321m1zb", address: "12 MG Road", email: "", phone: " ", our_share_pct: 75 })).toEqual({
      ok: true,
      value: { legal_name: "Kids Corner LLP", trade_name: null, gstin: "29AAGFC4321M1ZB", address: "12 MG Road", contact_name: null, phone: null, email: null, our_share_pct: 75, active: true },
    });
  });
  it("refuses a bad GSTIN, a share of 100 and a bad email", () => {
    expect(parseRetailer({ legal_name: "A", gstin: "29AAGFC4321M1ZC", address: "x" })).toEqual({ ok: false, error: "This GSTIN's last character doesn't match: check for a typo" });
    expect(parseRetailer({ legal_name: "A", gstin: "29AAGFC4321M1ZB", address: "x", our_share_pct: 100 })).toMatchObject({ ok: false });
    expect(parseRetailer({ legal_name: "A", gstin: "29AAGFC4321M1ZB", address: "x", email: "nope" })).toEqual({ ok: false, error: "Enter a valid email" });
    expect(parseRetailer({ gstin: "29AAGFC4321M1ZB", address: "x" })).toMatchObject({ ok: false });
  });
});

describe("parseDocSave", () => {
  it("accepts a challan dated today or earlier", () => {
    expect(parseDocSave({ kind: "challan", doc_date: "2026-10-08", lines: [{ variant_slug: "a", quantity: 2, mrp_paise: 100000 }] }, NOW)).toEqual({
      ok: true,
      value: { kind: "challan", doc_id: null, doc_date: "2026-10-08", lines: [{ variant_slug: "a", quantity: 2, mrp_paise: 100000 }] },
    });
  });
  it("refuses a future date, an empty challan, a fractional quantity", () => {
    expect(parseDocSave({ kind: "challan", doc_date: "2026-10-09", lines: [{ variant_slug: "a", quantity: 1, mrp_paise: 1 }] }, NOW)).toEqual({ ok: false, error: "The date can't be in the future" });
    expect(parseDocSave({ kind: "challan", doc_date: "2026-10-08", lines: [] }, NOW)).toEqual({ ok: false, error: "Add at least one item" });
    expect(parseDocSave({ kind: "return", doc_date: "2026-10-08", lines: [{ variant_slug: "a", quantity: 1.5 }] }, NOW)).toMatchObject({ ok: false });
  });
  it("accepts a sale for this month or earlier, dropping zero lines", () => {
    expect(parseDocSave({ kind: "sale", period: "2026-09", lines: [{ variant_slug: "a", quantity: 0 }, { variant_slug: "b", quantity: 3 }] }, NOW)).toEqual({
      ok: true,
      value: { kind: "sale", period: "2026-09", lines: [{ variant_slug: "b", quantity: 3 }] },
    });
    expect(parseDocSave({ kind: "sale", period: "2026-11", lines: [] }, NOW)).toEqual({ ok: false, error: "Pick a month up to this one" });
  });
  it("refuses an unknown kind", () => {
    expect(parseDocSave({ kind: "gift" }, NOW)).toMatchObject({ ok: false });
  });
});

describe("parseDocAction and parsePayment", () => {
  it("parses issue and cancel only", () => {
    expect(parseDocAction({ action: "issue" })).toEqual({ ok: true, value: { action: "issue" } });
    expect(parseDocAction({ action: "delete" })).toMatchObject({ ok: false });
  });
  it("parses a payment", () => {
    expect(parsePayment({ amount_paise: 150000, paid_on: "2026-10-05", method: "upi", reference: " UTR9 ", doc_id: null }, NOW)).toEqual({
      ok: true,
      value: { amount_paise: 150000, paid_on: "2026-10-05", method: "upi", reference: "UTR9", doc_id: null },
    });
    expect(parsePayment({ amount_paise: 0, paid_on: "2026-10-05", method: "upi" }, NOW)).toMatchObject({ ok: false });
    expect(parsePayment({ amount_paise: 1, paid_on: "2026-10-05", method: "card" }, NOW)).toMatchObject({ ok: false });
  });
});
```

Create `lib/retail/queries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { balance, doc, payment, retailer } from "./__fixtures__/retail";
import { loadRetailerDetail, loadRetailerList, shopName } from "./queries";

type Response = { data: unknown; error: { message: string } | null };

/** A Supabase stand-in: answers by table name, records every query's calls. */
function fakeAdmin(byTable: Record<string, Response>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const admin = {
    from(table: string) {
      const entry = { table, ops: [] as [string, unknown[]][] };
      calls.push(entry);
      const response = byTable[table] ?? { data: [], error: null };
      const builder: object = new Proxy({}, {
        get(_t, prop) {
          if (prop === "then") return (resolve: (v: Response) => unknown) => resolve(response);
          return (...args: unknown[]) => {
            entry.ops.push([String(prop), args]);
            return builder;
          };
        },
      });
      return builder;
    },
  };
  return { admin: admin as unknown as SupabaseClient, calls };
}

const NOW = new Date("2026-11-08T06:00:00Z");

describe("retail loaders", () => {
  it("names a shop by trade name, else legal name", () => {
    expect(shopName(retailer())).toBe("Kids Corner");
    expect(shopName(retailer({ trade_name: null }))).toBe("Kids Corner LLP");
  });

  it("lists shops with summaries and flags a missing report for last month", async () => {
    const other = retailer({ id: "22222222-2222-4222-8222-222222222222", legal_name: "Tiny Toes", trade_name: null, gstin: "33AAACR5055K1ZE", state_code: "33" });
    const { admin } = fakeAdmin({
      retailers: { data: [retailer(), other], error: null },
      retailer_batch_balances: { data: [balance(), balance({ retailer_id: other.id, batch_line_id: "x", sent_on: "2026-09-01" })], error: null },
      consignment_docs: { data: [doc()], error: null },
      retailer_payments: { data: [payment()], error: null },
    });
    const r = await loadRetailerList(admin, NOW);
    expect(r.lastPeriod).toBe("2026-10");
    expect(r.today).toBe("2026-11-08");
    expect(r.items.map((i) => [i.retailer.legal_name, i.summary.unitsHeld, i.summary.owedPaise])).toEqual([
      ["Kids Corner LLP", 3, 25000],
      ["Tiny Toes", 3, 0],
    ]);
    expect(r.missingLastPeriod).toEqual(["Tiny Toes"]);
  });

  it("loads one shop with holdings, or null when it does not exist", async () => {
    const { admin, calls } = fakeAdmin({
      retailers: { data: retailer(), error: null },
      retailer_batch_balances: { data: [balance()], error: null },
      consignment_docs: { data: [doc()], error: null },
      retailer_payments: { data: [], error: null },
    });
    const d = await loadRetailerDetail(admin, retailer().id, NOW);
    expect(d?.holdings.map((h) => h.held)).toEqual([3]);
    expect(d?.summary.invoicedPaise).toBe(75000);
    expect(calls.find((c) => c.table === "consignment_docs")?.ops).toContainEqual(["eq", ["retailer_id", retailer().id]]);

    const missing = fakeAdmin({ retailers: { data: null, error: null } });
    expect(await loadRetailerDetail(missing.admin, retailer().id, NOW)).toBeNull();
  });

  it("throws when a read fails", async () => {
    const { admin } = fakeAdmin({ retailers: { data: null, error: { message: "boom" } } });
    await expect(loadRetailerList(admin, NOW)).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/retail/rpc-errors.test.ts lib/retail/requests.test.ts lib/retail/queries.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

Create `lib/retail/rpc-errors.ts`:

```ts
/** Maps a consignment_* function error (P0001 message) to an HTTP status and a message for the admin. */
export function retailRpcError(message: string): { status: number; error: string } {
  const [code, ...rest] = message.split(":");
  const tail = rest.join(":");
  switch (code) {
    case "NOT_FOUND":
      return { status: 404, error: "Not found" };
    case "RETAILER_INACTIVE":
      return { status: 409, error: "This shop is inactive, so no stock can be sent" };
    case "BAD_DATE":
      return { status: 400, error: "The date can't be in the future" };
    case "BAD_PERIOD":
      return { status: 400, error: "Pick a month up to this one" };
    case "NO_LINES":
      return { status: 400, error: "Add at least one item" };
    case "BAD_LINE":
      return { status: 400, error: "Each item needs a whole quantity" };
    case "UNKNOWN_VARIANT":
      return { status: 400, error: `Unknown product size: ${tail}` };
    case "OUT_OF_STOCK":
      return { status: 409, error: `Not enough stock of ${tail}` };
    case "NOT_HELD": {
      const [held, ...label] = rest;
      return { status: 409, error: `The shop holds only ${held} of ${label.join(":")}` };
    }
    case "NOT_DRAFT":
      return { status: 409, error: "This is no longer a draft: refresh the page" };
    case "ALREADY_ISSUED":
      return { status: 409, error: "That month's invoice is already issued" };
    case "ALREADY_CANCELLED":
      return { status: 409, error: "Already cancelled" };
    case "IN_USE":
      return { status: 409, error: "Sales or returns already draw on this challan, so it can't be cancelled" };
    case "STOCK_GONE":
      return { status: 409, error: `Those pieces of ${tail} have left your stock again` };
    case "TOO_LATE":
      return { status: 409, error: "That month is closed for GST (GSTR-1 is due on the 11th). A credit note is needed: ask your CA." };
    default:
      return { status: 500, error: "Couldn't save" };
  }
}
```

Create `lib/retail/requests.ts`:

```ts
import { z } from "zod";
import { currentPeriod, isIsoDate, isPeriod, istToday } from "./dates";
import { validateGstin } from "./gstin";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const optionalText = (max: number) =>
  z.string().max(max).nullish().transform((v) => (v && v.trim() ? v.trim() : null));
const first = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid request";

const retailerSchema = z.object({
  legal_name: z.string({ required_error: "Enter the shop's legal name" }).trim().min(1, "Enter the shop's legal name").max(200),
  trade_name: optionalText(200),
  gstin: z.unknown(),
  address: z.string({ required_error: "Enter the shop's address" }).trim().min(1, "Enter the shop's address").max(500),
  contact_name: optionalText(100),
  phone: optionalText(20),
  email: optionalText(200).refine((v) => v === null || EMAIL.test(v), "Enter a valid email"),
  our_share_pct: z.number().gt(0, "Our share must be above 0%").lt(100, "Our share must be below 100%").multipleOf(0.01).default(75),
  active: z.boolean().default(true),
});

export type RetailerInput = Omit<z.infer<typeof retailerSchema>, "gstin"> & { gstin: string };

export function parseRetailer(body: unknown): Parsed<RetailerInput> {
  const parsed = retailerSchema.safeParse(body ?? {});
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  const gstin = validateGstin(parsed.data.gstin);
  if (!gstin.ok) return { ok: false, error: gstin.error };
  return { ok: true, value: { ...parsed.data, gstin: gstin.gstin } };
}

const quantity = z.number().int("Quantities must be whole pieces").min(0).max(10_000);
const slug = z.string().trim().min(1).max(200);

const docSaveSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("challan"),
    doc_id: z.string().nullish(),
    doc_date: z.string(),
    lines: z.array(z.object({ variant_slug: slug, quantity: quantity.min(1), mrp_paise: z.number().int().min(1).max(10_000_000) })).max(500),
  }),
  z.object({
    kind: z.literal("return"),
    doc_id: z.string().nullish(),
    doc_date: z.string(),
    lines: z.array(z.object({ variant_slug: slug, quantity })).max(500),
  }),
  z.object({
    kind: z.literal("sale"),
    period: z.string(),
    lines: z.array(z.object({ variant_slug: slug, quantity })).max(500),
  }),
]);

export type DocSave =
  | { kind: "challan"; doc_id: string | null; doc_date: string; lines: { variant_slug: string; quantity: number; mrp_paise: number }[] }
  | { kind: "return"; doc_id: string | null; doc_date: string; lines: { variant_slug: string; quantity: number }[] }
  | { kind: "sale"; period: string; lines: { variant_slug: string; quantity: number }[] };

export function parseDocSave(body: unknown, now: Date): Parsed<DocSave> {
  const parsed = docSaveSchema.safeParse(body ?? {});
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  const v = parsed.data;
  if (v.kind === "sale") {
    if (!isPeriod(v.period) || v.period > currentPeriod(now)) return { ok: false, error: "Pick a month up to this one" };
    return { ok: true, value: { kind: "sale", period: v.period, lines: v.lines.filter((l) => l.quantity > 0) } };
  }
  if (!isIsoDate(v.doc_date) || v.doc_date > istToday(now)) return { ok: false, error: "The date can't be in the future" };
  if (v.doc_id != null && !isUuid(v.doc_id)) return { ok: false, error: "Invalid request" };
  const lines = v.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "Add at least one item" };
  return v.kind === "challan"
    ? { ok: true, value: { kind: "challan", doc_id: v.doc_id ?? null, doc_date: v.doc_date, lines: lines as { variant_slug: string; quantity: number; mrp_paise: number }[] } }
    : { ok: true, value: { kind: "return", doc_id: v.doc_id ?? null, doc_date: v.doc_date, lines } };
}

export function parseDocAction(body: unknown): Parsed<{ action: "issue" | "cancel" }> {
  const parsed = z.object({ action: z.enum(["issue", "cancel"]) }).safeParse(body ?? {});
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "Unknown action" };
}

const paymentSchema = z.object({
  amount_paise: z.number().int().min(1, "Enter the amount received").max(1_000_000_000),
  paid_on: z.string(),
  method: z.enum(["upi", "bank", "cash"], { errorMap: () => ({ message: "Pick UPI, bank or cash" }) }),
  reference: optionalText(100),
  doc_id: z.string().nullish(),
});

export interface PaymentInput {
  amount_paise: number;
  paid_on: string;
  method: "upi" | "bank" | "cash";
  reference: string | null;
  doc_id: string | null;
}

export function parsePayment(body: unknown, now: Date): Parsed<PaymentInput> {
  const parsed = paymentSchema.safeParse(body ?? {});
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  const v = parsed.data;
  if (!isIsoDate(v.paid_on) || v.paid_on > istToday(now)) return { ok: false, error: "The date can't be in the future" };
  if (v.doc_id != null && !isUuid(v.doc_id)) return { ok: false, error: "Invalid request" };
  return { ok: true, value: { amount_paise: v.amount_paise, paid_on: v.paid_on, method: v.method, reference: v.reference, doc_id: v.doc_id ?? null } };
}
```

Create `lib/retail/queries.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchActiveVariants } from "@/lib/admin/stock-variants";
import type { RetailerDetail, RetailerListResponse, VariantOption } from "./api-types";
import { istToday, recentPeriods } from "./dates";
import { holdingsFrom, retailerSummary } from "./holdings";
import type { BatchBalance, ConsignmentDoc, Retailer, RetailerPayment } from "./types";

/** Server-only reads with the service-role client. Callers gate on requireAdmin() first. */
export const RETAILER_COLUMNS = "id, legal_name, trade_name, gstin, state_code, address, contact_name, phone, email, our_share_pct, active, created_at";
export const LINE_COLUMNS = "id, doc_id, variant_slug, product_name, size, quantity, mrp_paise, batch_line_id, unit_price_paise";
export const DOC_COLUMNS = `id, retailer_id, kind, status, number, doc_date, period, share_pct, note, created_at, issued_at, cancelled_at, consignment_lines(${LINE_COLUMNS})`;
export const BALANCE_COLUMNS = "batch_line_id, retailer_id, variant_slug, product_name, size, mrp_paise, sent_on, challan_number, sent, held";
export const PAYMENT_COLUMNS = "id, retailer_id, doc_id, amount_paise, paid_on, method, reference, created_at";

type Result = { data: unknown; error: { message: string } | null };

async function rows<T>(query: PromiseLike<Result>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

async function one<T>(query: PromiseLike<Result>): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? null) as T | null;
}

// numeric columns can arrive as strings; normalise once here.
const toRetailer = (r: Retailer): Retailer => ({ ...r, our_share_pct: Number(r.our_share_pct) });
const toDoc = (d: ConsignmentDoc): ConsignmentDoc => ({
  ...d,
  share_pct: d.share_pct === null ? null : Number(d.share_pct),
  consignment_lines: [...(d.consignment_lines ?? [])].sort((a, b) => a.product_name.localeCompare(b.product_name) || a.size.localeCompare(b.size) || a.mrp_paise - b.mrp_paise),
});

export function shopName(r: Pick<Retailer, "trade_name" | "legal_name">): string {
  return r.trade_name?.trim() || r.legal_name;
}

export async function fetchRetailer(admin: SupabaseClient, id: string): Promise<Retailer | null> {
  const r = await one<Retailer>(admin.from("retailers").select(RETAILER_COLUMNS).eq("id", id).maybeSingle());
  return r ? toRetailer(r) : null;
}

export async function fetchDoc(admin: SupabaseClient, docId: string): Promise<ConsignmentDoc | null> {
  const d = await one<ConsignmentDoc>(admin.from("consignment_docs").select(DOC_COLUMNS).eq("id", docId).maybeSingle());
  return d ? toDoc(d) : null;
}

/** Challan numbers behind a sale's batch lines, for the invoice note. */
export async function fetchChallanNumbers(admin: SupabaseClient, batchLineIds: string[]): Promise<string[]> {
  if (batchLineIds.length === 0) return [];
  const list = await rows<{ challan_number: string }>(
    admin.from("retailer_batch_balances").select("challan_number").in("batch_line_id", [...new Set(batchLineIds)]),
  );
  return [...new Set(list.map((r) => r.challan_number))].sort();
}

export async function loadRetailerList(admin: SupabaseClient, now: Date): Promise<RetailerListResponse> {
  const [retailers, balances, sales, payments] = await Promise.all([
    rows<Retailer>(admin.from("retailers").select(RETAILER_COLUMNS).order("legal_name", { ascending: true })),
    rows<BatchBalance>(admin.from("retailer_batch_balances").select(BALANCE_COLUMNS)),
    rows<ConsignmentDoc>(admin.from("consignment_docs").select(DOC_COLUMNS).eq("kind", "sale").eq("status", "issued")),
    rows<RetailerPayment>(admin.from("retailer_payments").select(PAYMENT_COLUMNS)),
  ]);
  const today = istToday(now);
  const lastPeriod = recentPeriods(now, 2)[1];
  const lastPeriodEnd = `${lastPeriod}-31`;
  const items = retailers.map(toRetailer).map((retailer) => {
    const own = <T extends { retailer_id: string }>(list: T[]) => list.filter((x) => x.retailer_id === retailer.id);
    return {
      retailer,
      summary: retailerSummary({ retailer, balances: own(balances), docs: own(sales).map(toDoc), payments: own(payments), today }),
    };
  });
  const missingLastPeriod = items
    .filter(({ retailer }) =>
      retailer.active &&
      balances.some((b) => b.retailer_id === retailer.id && b.sent_on <= lastPeriodEnd) &&
      !sales.some((d) => d.retailer_id === retailer.id && d.period === lastPeriod),
    )
    .map(({ retailer }) => shopName(retailer));
  return { items, lastPeriod, missingLastPeriod, today };
}

export async function loadRetailerDetail(admin: SupabaseClient, id: string, now: Date): Promise<RetailerDetail | null> {
  const retailer = await fetchRetailer(admin, id);
  if (!retailer) return null;
  const [balances, docs, payments] = await Promise.all([
    rows<BatchBalance>(admin.from("retailer_batch_balances").select(BALANCE_COLUMNS).eq("retailer_id", id)),
    rows<ConsignmentDoc>(
      admin.from("consignment_docs").select(DOC_COLUMNS).eq("retailer_id", id)
        .order("doc_date", { ascending: false }).order("created_at", { ascending: false }),
    ),
    rows<RetailerPayment>(admin.from("retailer_payments").select(PAYMENT_COLUMNS).eq("retailer_id", id).order("paid_on", { ascending: false })),
  ]);
  const today = istToday(now);
  const allDocs = docs.map(toDoc);
  return {
    retailer,
    summary: retailerSummary({ retailer, balances, docs: allDocs, payments, today }),
    holdings: holdingsFrom(balances, today),
    docs: allDocs,
    payments,
    today,
  };
}

/** Sizes of active products with stock on hand, for "Send stock". */
export async function loadVariantOptions(admin: SupabaseClient): Promise<VariantOption[]> {
  const variants = await fetchActiveVariants(admin);
  return variants
    .filter((v) => (v.stock_quantity ?? 0) > 0 && v.products)
    .map((v) => ({
      slug: v.slug,
      productName: v.products!.name,
      size: v.sizes?.name ?? v.size_slug ?? "",
      pricePaise: Math.round(Number(v.price ?? 0) * 100),
      stock: v.stock_quantity ?? 0,
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName) || a.size.localeCompare(b.size));
}
```

`lastPeriodEnd` uses `-31` deliberately: `sent_on` is compared as text, and every real date of that month sorts at or before `YYYY-MM-31`.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run lib/retail`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/retail/queries.ts lib/retail/queries.test.ts lib/retail/requests.ts lib/retail/requests.test.ts lib/retail/rpc-errors.ts lib/retail/rpc-errors.test.ts
git commit -m "feat(retail): loaders, request parsing and function error mapping"
```

---

### Task 7: Shop routes (list, create, detail, update, variants)

**Files:**
- Create: `app/api/admin/retail/route.ts`, `app/api/admin/retail/[id]/route.ts`, `app/api/admin/retail/variants/route.ts`
- Create: `app/api/admin/retail/__fixtures__/route-mocks.ts`
- Test: `app/api/admin/retail/route.test.ts`, `app/api/admin/retail/[id]/route.test.ts`, `app/api/admin/retail/variants/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `createAdminSupabaseClient`, Task 6 (`loadRetailerList`, `loadRetailerDetail`, `loadVariantOptions`, `parseRetailer`, `RETAILER_COLUMNS`, `isUuid`).
- Produces:
  - `GET /api/admin/retail` → `200 RetailerListResponse`
  - `POST /api/admin/retail` body `RetailerInput` → `201 { retailer }`, `409` duplicate GSTIN, `400 { error }`
  - `GET /api/admin/retail/[id]` → `200 { detail: RetailerDetail }`, `404`
  - `PATCH /api/admin/retail/[id]` → `200 { retailer }`, `404`, `409`, `400`
  - `GET /api/admin/retail/variants` → `200 { variants: VariantOption[] }`
  - Fixture helper `chain(result)` and `ADMIN_USER` for later route tests.

- [ ] **Step 1: Write the shared mocks and failing tests**

Create `app/api/admin/retail/__fixtures__/route-mocks.ts`:

```ts
import { vi } from "vitest";

export const ADMIN_USER = { id: "admin-1", email: "asha@cozyberries.in", app_metadata: { role: "admin" }, user_metadata: { full_name: "Asha" } };
export const CUSTOMER_USER = { id: "c-1", app_metadata: { role: "customer" } };

/** A PostgREST builder stand-in: every method chains, awaiting it resolves to `result`. */
export function chain(result: { data: unknown; error: unknown }) {
  const ops: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "insert", "update", "delete", "eq", "in", "order", "single", "maybeSingle", "gte", "lt", "not"]) {
    builder[name] = vi.fn((...args: unknown[]) => {
      ops.push([name, args]);
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return Object.assign(builder, { ops });
}
```

Create `app/api/admin/retail/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER, CUSTOMER_USER, chain } from "./__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, from: vi.fn(), loadRetailerList: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({ from: h.from })),
}));
vi.mock("@/lib/retail/queries", async (orig) => ({ ...(await orig<object>()), loadRetailerList: h.loadRetailerList }));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET, POST } from "./route";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/admin/retail", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
const SHOP = { legal_name: "Kids Corner LLP", gstin: "29AAGFC4321M1ZB", address: "12 MG Road" };

beforeEach(() => {
  h.user = ADMIN_USER;
  h.from.mockReset();
  h.loadRetailerList.mockReset();
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("/api/admin/retail", () => {
  it("401s a guest and 403s a customer before any service-role client", async () => {
    h.user = null;
    expect((await GET()).status).toBe(401);
    h.user = CUSTOMER_USER;
    expect((await post(SHOP)).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("lists shops with no-store", async () => {
    h.loadRetailerList.mockResolvedValue({ items: [], lastPeriod: "2026-09", missingLastPeriod: [], today: "2026-10-08" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toMatchObject({ lastPeriod: "2026-09" });
  });

  it("creates a shop with a normalised GSTIN", async () => {
    const q = chain({ data: { id: "r1", ...SHOP }, error: null });
    h.from.mockReturnValue(q);
    const res = await post({ ...SHOP, gstin: "29aagfc4321m1zb" });
    expect(res.status).toBe(201);
    expect(h.from).toHaveBeenCalledWith("retailers");
    expect(q.ops[0]).toEqual(["insert", [expect.objectContaining({ gstin: "29AAGFC4321M1ZB", our_share_pct: 75 })]]);
  });

  it("refuses a bad GSTIN with 400 and a duplicate with 409", async () => {
    expect((await post({ ...SHOP, gstin: "29AAGFC4321M1ZC" })).status).toBe(400);
    h.from.mockReturnValue(chain({ data: null, error: { code: "23505", message: "duplicate key" } }));
    const res = await post(SHOP);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "A shop with this GSTIN already exists" });
  });
});
```

Create `app/api/admin/retail/[id]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER, CUSTOMER_USER, chain } from "../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, from: vi.fn(), loadRetailerDetail: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({ from: h.from })),
}));
vi.mock("@/lib/retail/queries", async (orig) => ({ ...(await orig<object>()), loadRetailerDetail: h.loadRetailerDetail }));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET, PATCH } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const req = (body?: unknown) =>
  new NextRequest(`http://localhost/api/admin/retail/${ID}`, { method: body ? "PATCH" : "GET", body: body ? JSON.stringify(body) : undefined, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  h.user = ADMIN_USER;
  h.from.mockReset();
  h.loadRetailerDetail.mockReset();
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("/api/admin/retail/[id]", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await GET(req(), ctx())).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("404s a malformed id and an unknown shop", async () => {
    expect((await GET(req(), ctx("nope"))).status).toBe(404);
    h.loadRetailerDetail.mockResolvedValue(null);
    expect((await GET(req(), ctx())).status).toBe(404);
  });

  it("returns the detail", async () => {
    h.loadRetailerDetail.mockResolvedValue({ retailer: { id: ID }, holdings: [] });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ detail: { retailer: { id: ID }, holdings: [] } });
  });

  it("updates a shop scoped by its id and stamps updated_at", async () => {
    const q = chain({ data: { id: ID }, error: null });
    h.from.mockReturnValue(q);
    const res = await PATCH(req({ legal_name: "Kids Corner LLP", gstin: "29AAGFC4321M1ZB", address: "x", our_share_pct: 70, active: false }), ctx());
    expect(res.status).toBe(200);
    expect(q.ops).toContainEqual(["update", [expect.objectContaining({ our_share_pct: 70, active: false, updated_at: expect.any(String) })]]);
    expect(q.ops).toContainEqual(["eq", ["id", ID]]);
  });

  it("404s an update to a shop that does not exist", async () => {
    h.from.mockReturnValue(chain({ data: null, error: null }));
    expect((await PATCH(req({ legal_name: "A", gstin: "29AAGFC4321M1ZB", address: "x" }), ctx())).status).toBe(404);
  });
});
```

Create `app/api/admin/retail/variants/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER, CUSTOMER_USER } from "../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, loadVariantOptions: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({})),
}));
vi.mock("@/lib/retail/queries", async (orig) => ({ ...(await orig<object>()), loadVariantOptions: h.loadVariantOptions }));

import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET } from "./route";

beforeEach(() => {
  h.user = ADMIN_USER;
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("GET /api/admin/retail/variants", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await GET()).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
  it("returns the options", async () => {
    h.loadVariantOptions.mockResolvedValue([{ slug: "a", productName: "Frock", size: "1-2Y", pricePaise: 100000, stock: 4 }]);
    expect(await (await GET()).json()).toEqual({ variants: [{ slug: "a", productName: "Frock", size: "1-2Y", pricePaise: 100000, stock: 4 }] });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run app/api/admin/retail`
Expected: FAIL, cannot resolve `./route`.

- [ ] **Step 3: Implement the routes**

Create `app/api/admin/retail/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { loadRetailerList, RETAILER_COLUMNS } from "@/lib/retail/queries";
import { parseRetailer } from "@/lib/retail/requests";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

/** Every shop with its stock, money and six-month summary. Live read, no cache. */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  try {
    return NextResponse.json(await loadRetailerList(createAdminSupabaseClient(), new Date()), { headers: NO_STORE });
  } catch (e) {
    console.error("[retail] list failed:", e);
    return NextResponse.json({ error: "Couldn't load the shops" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const parsed = parseRetailer(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await createAdminSupabaseClient().from("retailers").insert(parsed.value).select(RETAILER_COLUMNS).single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "A shop with this GSTIN already exists" }, { status: 409 });
    }
    console.error("[retail] create failed:", error);
    return NextResponse.json({ error: "Couldn't save the shop" }, { status: 500 });
  }
  return NextResponse.json({ retailer: data }, { status: 201 });
}
```

Create `app/api/admin/retail/[id]/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { loadRetailerDetail, RETAILER_COLUMNS } from "@/lib/retail/queries";
import { isUuid, parseRetailer } from "@/lib/retail/requests";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
type Ctx = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });

export async function GET(_request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  try {
    const detail = await loadRetailerDetail(createAdminSupabaseClient(), id, new Date());
    return detail ? NextResponse.json({ detail }, { headers: NO_STORE }) : notFound();
  } catch (e) {
    console.error("[retail] detail failed:", e);
    return NextResponse.json({ error: "Couldn't load the shop" }, { status: 500, headers: NO_STORE });
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const parsed = parseRetailer(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await createAdminSupabaseClient()
    .from("retailers")
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(RETAILER_COLUMNS)
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "A shop with this GSTIN already exists" }, { status: 409 });
    }
    console.error("[retail] update failed:", error);
    return NextResponse.json({ error: "Couldn't save the shop" }, { status: 500 });
  }
  return data ? NextResponse.json({ retailer: data }) : notFound();
}
```

Create `app/api/admin/retail/variants/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { loadVariantOptions } from "@/lib/retail/queries";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

/** Sizes with stock on hand, for "Send stock". */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  try {
    return NextResponse.json({ variants: await loadVariantOptions(createAdminSupabaseClient()) }, { headers: NO_STORE });
  } catch (e) {
    console.error("[retail] variants failed:", e);
    return NextResponse.json({ error: "Couldn't load products" }, { status: 500, headers: NO_STORE });
  }
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run app/api/admin/retail`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/retail
git commit -m "feat(retail): admin routes for shops and the variant picker"
```

---

### Task 8: Document, sheet, PDF and payment routes

**Files:**
- Create: `app/api/admin/retail/[id]/docs/route.ts`, `app/api/admin/retail/docs/[docId]/route.ts`, `app/api/admin/retail/docs/[docId]/pdf/route.ts`, `app/api/admin/retail/[id]/sheet/route.ts`, `app/api/admin/retail/[id]/payments/route.ts`, `app/api/admin/retail/payments/[paymentId]/route.ts`
- Test: one `route.test.ts` beside each

**Interfaces:**
- Consumes: Task 4 (`buildSalesSheet`, `parseSalesSheet`, `salesSheetFileName`, `ParsedSheet`), Task 5 (`buildRetailInvoice`, `buildChallan`, `renderRetailInvoicePdf`, `renderChallanPdf`, `retailPdfFilename`), Task 6 (`parseDocSave`, `parseDocAction`, `parsePayment`, `isUuid`, `retailRpcError`, `fetchDoc`, `fetchRetailer`, `fetchChallanNumbers`, `loadRetailerDetail`, `shopName`, `PAYMENT_COLUMNS`), `getBusinessGstin`.
- Produces:
  - `POST /api/admin/retail/[id]/docs` body `DocSave` → `201 { doc_id }`
  - `POST /api/admin/retail/docs/[docId]` body `{ action }` → `200 { doc }` (issue) or `200 { result: "deleted" | "cancelled" }`
  - `GET /api/admin/retail/docs/[docId]/pdf` → `application/pdf`
  - `GET /api/admin/retail/[id]/sheet?month=YYYY-MM` → `.xlsx`; `POST` multipart `{ month, file }` → `201 { doc_id }`, `400 { error }`, `413`, `422 { error, rowErrors }`
  - `POST /api/admin/retail/[id]/payments` → `201 { payment }`; `DELETE /api/admin/retail/payments/[paymentId]` → `200 { ok: true }`

- [ ] **Step 1: Write the failing tests**

Create `app/api/admin/retail/[id]/docs/route.test.ts`:

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
import { POST } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: ID }) };
const post = (body: unknown) =>
  POST(new NextRequest(`http://localhost/api/admin/retail/${ID}/docs`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), ctx);

beforeEach(() => {
  h.user = ADMIN_USER;
  h.rpc.mockReset();
  vi.mocked(createAdminSupabaseClient).mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T06:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("POST /api/admin/retail/[id]/docs", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await post({ kind: "sale", period: "2026-09", lines: [] })).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("saves a challan as the signed-in admin, never a body actor", async () => {
    h.rpc.mockResolvedValue({ data: "doc-1", error: null });
    const res = await post({ kind: "challan", doc_date: "2026-10-08", lines: [{ variant_slug: "a", quantity: 2, mrp_paise: 100000 }], actor: "evil" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ doc_id: "doc-1" });
    expect(h.rpc).toHaveBeenCalledWith("consignment_save_challan", {
      p_retailer_id: ID, p_doc_date: "2026-10-08", p_lines: [{ variant_slug: "a", quantity: 2, mrp_paise: 100000 }], p_actor: "admin-1", p_doc_id: null,
    });
  });

  it("saves a return and a sale with their own functions", async () => {
    h.rpc.mockResolvedValue({ data: "doc-2", error: null });
    await post({ kind: "return", doc_date: "2026-10-08", lines: [{ variant_slug: "a", quantity: 1 }] });
    expect(h.rpc).toHaveBeenLastCalledWith("consignment_save_return", expect.objectContaining({ p_lines: [{ variant_slug: "a", quantity: 1 }] }));
    await post({ kind: "sale", period: "2026-09", lines: [] });
    expect(h.rpc).toHaveBeenLastCalledWith("consignment_save_sale", { p_retailer_id: ID, p_period: "2026-09", p_lines: [], p_actor: "admin-1" });
  });

  it("maps a function error to its status and message", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "NOT_HELD:1:Petal Pops Frock 1-2Y" } });
    const res = await post({ kind: "sale", period: "2026-09", lines: [{ variant_slug: "a", quantity: 2 }] });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "The shop holds only 1 of Petal Pops Frock 1-2Y" });
  });

  it("400s a future date before calling the database", async () => {
    expect((await post({ kind: "challan", doc_date: "2026-10-09", lines: [{ variant_slug: "a", quantity: 1, mrp_paise: 1 }] })).status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
```

Create `app/api/admin/retail/docs/[docId]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER, CUSTOMER_USER } from "../../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, rpc: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({ rpc: h.rpc })),
}));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { POST } from "./route";

const DOC = "33333333-3333-4333-8333-333333333333";
const call = (body: unknown, id = DOC) =>
  POST(new NextRequest(`http://localhost/api/admin/retail/docs/${id}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ docId: id }) });

beforeEach(() => {
  h.user = ADMIN_USER;
  h.rpc.mockReset();
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("POST /api/admin/retail/docs/[docId]", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await call({ action: "issue" })).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
  it("issues", async () => {
    h.rpc.mockResolvedValue({ data: { id: DOC, number: "CBR/26-27/0001" }, error: null });
    const res = await call({ action: "issue" });
    expect(h.rpc).toHaveBeenCalledWith("consignment_issue", { p_doc_id: DOC });
    expect(await res.json()).toEqual({ doc: { id: DOC, number: "CBR/26-27/0001" } });
  });
  it("cancels and maps TOO_LATE", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "TOO_LATE" } });
    const res = await call({ action: "cancel" });
    expect(h.rpc).toHaveBeenCalledWith("consignment_cancel", { p_doc_id: DOC });
    expect(res.status).toBe(409);
  });
  it("400s an unknown action and 404s a malformed id", async () => {
    expect((await call({ action: "explode" })).status).toBe(400);
    expect((await call({ action: "issue" }, "x")).status).toBe(404);
  });
});
```

Create `app/api/admin/retail/docs/[docId]/pdf/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { doc, line, retailer } from "@/lib/retail/__fixtures__/retail";
import { ADMIN_USER, CUSTOMER_USER } from "../../../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, fetchDoc: vi.fn(), fetchRetailer: vi.fn(), fetchChallanNumbers: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({})),
}));
vi.mock("@/lib/retail/queries", async (orig) => ({ ...(await orig<object>()), fetchDoc: h.fetchDoc, fetchRetailer: h.fetchRetailer, fetchChallanNumbers: h.fetchChallanNumbers }));
vi.mock("@/lib/retail/pdf", () => ({
  renderRetailInvoicePdf: vi.fn(async () => Buffer.from("%PDF-invoice")),
  renderChallanPdf: vi.fn(async () => Buffer.from("%PDF-challan")),
}));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { renderRetailInvoicePdf } from "@/lib/retail/pdf";
import { GET } from "./route";

const DOC = "33333333-3333-4333-8333-333333333333";
const get = () => GET(new NextRequest(`http://localhost/api/admin/retail/docs/${DOC}/pdf`), { params: Promise.resolve({ docId: DOC }) });

beforeEach(() => {
  h.user = ADMIN_USER;
  process.env.BUSINESS_GSTIN = "29EPDPR9174E1ZB";
  h.fetchRetailer.mockResolvedValue(retailer());
  h.fetchChallanNumbers.mockResolvedValue(["CBC/26-27/0001"]);
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("GET /api/admin/retail/docs/[docId]/pdf", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await get()).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("serves the invoice PDF privately, citing the challans", async () => {
    h.fetchDoc.mockResolvedValue(doc({ id: DOC }));
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="CBR-26-27-0001.pdf"');
    expect(h.fetchChallanNumbers).toHaveBeenCalledWith(expect.anything(), ["batch-1"]);
    expect(vi.mocked(renderRetailInvoicePdf).mock.calls[0][0]).toMatchObject({ challanNumbers: ["CBC/26-27/0001"], totals: { totalPaise: 75000 } });
  });

  it("serves a challan PDF", async () => {
    h.fetchDoc.mockResolvedValue(doc({ id: DOC, kind: "challan", period: null, number: "CBC/26-27/0002", consignment_lines: [line()] }));
    expect(await (await get()).text()).toBe("%PDF-challan");
  });

  it("404s a missing document and a return", async () => {
    h.fetchDoc.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    h.fetchDoc.mockResolvedValue(doc({ id: DOC, kind: "return", period: null }));
    expect((await get()).status).toBe(404);
  });
});
```

Create `app/api/admin/retail/[id]/sheet/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import readExcelFile from "read-excel-file/node";
import { balance, retailer } from "@/lib/retail/__fixtures__/retail";
import { holdingsFrom } from "@/lib/retail/holdings";
import { buildSalesSheet } from "@/lib/retail/sheet";
import { ADMIN_USER, CUSTOMER_USER } from "../../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, rpc: vi.fn(), loadRetailerDetail: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({ rpc: h.rpc })),
}));
vi.mock("@/lib/retail/queries", async (orig) => ({ ...(await orig<object>()), loadRetailerDetail: h.loadRetailerDetail }));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { GET, POST } from "./route";

const ID = retailer().id;
const ctx = { params: Promise.resolve({ id: ID }) };
const HOLDINGS = holdingsFrom([balance({ held: 3 })], "2026-10-08");
const SHOP = { id: ID, name: "Kids Corner" };

async function upload(file: Blob | null, month = "2026-09") {
  const form = new FormData();
  form.set("month", month);
  if (file) form.set("file", file, "sales.xlsx");
  return POST(new NextRequest(`http://localhost/api/admin/retail/${ID}/sheet`, { method: "POST", body: form }), ctx);
}

async function filled(sold: number | null, month = "2026-09"): Promise<Blob> {
  const book = await readExcelFile(await buildSalesSheet({ shop: SHOP, month, holdings: HOLDINGS }));
  // Rebuild with the Sold cell filled: write the parsed rows back through the builder's shape.
  const { default: writeExcelFile } = await import("write-excel-file/node");
  const data = book.map((s) => ({
    sheet: s.sheet,
    data: s.data.map((r, i) => r.map((v, j) => (s.sheet === "Sales" && i === 1 && j === 5 ? (sold === null ? null : { value: sold, type: Number }) : v === null ? null : { value: v, type: typeof v === "number" ? Number : String }))),
  }));
  const buffer = await writeExcelFile(data as never).toBuffer();
  return new Blob([new Uint8Array(buffer)]);
}

beforeEach(() => {
  h.user = ADMIN_USER;
  h.rpc.mockReset();
  h.loadRetailerDetail.mockResolvedValue({ retailer: retailer(), holdings: HOLDINGS });
  vi.mocked(createAdminSupabaseClient).mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T06:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("/api/admin/retail/[id]/sheet", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await GET(new NextRequest(`http://localhost/x?month=2026-09`), ctx)).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("downloads the month's sheet as an attachment", async () => {
    const res = await GET(new NextRequest(`http://localhost/x?month=2026-09`), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="cozyberries-sales-kids-corner-2026-09.xlsx"');
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("400s a future month", async () => {
    expect((await GET(new NextRequest(`http://localhost/x?month=2026-11`), ctx)).status).toBe(400);
  });

  it("turns a filled sheet into the month's draft", async () => {
    h.rpc.mockResolvedValue({ data: "doc-9", error: null });
    const res = await upload(await filled(2));
    expect(res.status).toBe(201);
    expect(h.rpc).toHaveBeenCalledWith("consignment_save_sale", {
      p_retailer_id: ID, p_period: "2026-09", p_lines: [{ variant_slug: "petal-frock-1-2y", quantity: 2 }], p_actor: "admin-1",
    });
  });

  it("422s with row errors and saves nothing", async () => {
    const res = await upload(await filled(9));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Fix these rows in the sheet and upload it again",
      rowErrors: [{ row: 2, code: "petal-frock-1-2y", message: "Sold 9 of Petal Pops Frock (1-2Y) but the shop holds 3" }],
    });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("400s a sheet for another month, a missing file and an unreadable file", async () => {
    expect((await upload(await filled(1, "2026-08"))).status).toBe(400);
    expect((await upload(null)).status).toBe(400);
    const res = await upload(new Blob(["not a spreadsheet"]));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That file isn't a readable .xlsx" });
  });

  it("413s a file over 1 MB", async () => {
    expect((await upload(new Blob([new Uint8Array(1_048_577)]))).status).toBe(413);
  });
});
```

Create `app/api/admin/retail/[id]/payments/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER, CUSTOMER_USER, chain } from "../../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, from: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({ from: h.from })),
}));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { POST } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const DOC = "33333333-3333-4333-8333-333333333333";
const post = (body: unknown) =>
  POST(new NextRequest(`http://localhost/api/admin/retail/${ID}/payments`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: ID }) });
const PAY = { amount_paise: 150000, paid_on: "2026-10-05", method: "upi", reference: "UTR9" };

beforeEach(() => {
  h.user = ADMIN_USER;
  h.from.mockReset();
  vi.mocked(createAdminSupabaseClient).mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T06:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("POST /api/admin/retail/[id]/payments", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await post(PAY)).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it("records a payment against this shop as the signed-in admin", async () => {
    const q = chain({ data: { id: "p1" }, error: null });
    h.from.mockReturnValue(q);
    expect((await post(PAY)).status).toBe(201);
    expect(q.ops[0]).toEqual(["insert", [{ ...PAY, doc_id: null, retailer_id: ID, created_by: "admin-1" }]]);
  });

  it("refuses an invoice that is not this shop's issued invoice", async () => {
    h.from.mockReturnValueOnce(chain({ data: null, error: null }));
    const res = await post({ ...PAY, doc_id: DOC });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Pick one of this shop's issued invoices" });
  });
});
```

Create `app/api/admin/retail/payments/[paymentId]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER, CUSTOMER_USER, chain } from "../../__fixtures__/route-mocks";

const h = vi.hoisted(() => ({ user: null as unknown, from: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: h.user }, error: null }) } })),
  createAdminSupabaseClient: vi.fn(() => ({ from: h.from })),
}));

import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { DELETE } from "./route";

const PID = "44444444-4444-4444-8444-444444444444";
const del = (id = PID) => DELETE(new NextRequest(`http://localhost/api/admin/retail/payments/${id}`, { method: "DELETE" }), { params: Promise.resolve({ paymentId: id }) });

beforeEach(() => {
  h.user = ADMIN_USER;
  h.from.mockReset();
  vi.mocked(createAdminSupabaseClient).mockClear();
});

describe("DELETE /api/admin/retail/payments/[paymentId]", () => {
  it("403s a customer before any service-role client", async () => {
    h.user = CUSTOMER_USER;
    expect((await del()).status).toBe(403);
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
  });
  it("deletes by id, 404 when nothing matched", async () => {
    const q = chain({ data: [{ id: PID }], error: null });
    h.from.mockReturnValue(q);
    expect((await del()).status).toBe(200);
    expect(q.ops).toContainEqual(["eq", ["id", PID]]);
    h.from.mockReturnValue(chain({ data: [], error: null }));
    expect((await del()).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run app/api/admin/retail`
Expected: the new files FAIL with `Cannot find module './route'`; Task 7's tests still pass.

- [ ] **Step 3: Implement the routes**

Create `app/api/admin/retail/[id]/docs/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { isUuid, parseDocSave } from "@/lib/retail/requests";
import { retailRpcError } from "@/lib/retail/rpc-errors";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Saves a draft challan, return or monthly sale. The actor is the verified session. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = parseDocSave(await request.json().catch(() => null), new Date());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const v = parsed.value;
  const admin = createAdminSupabaseClient();
  const { data, error } =
    v.kind === "sale"
      ? await admin.rpc("consignment_save_sale", { p_retailer_id: id, p_period: v.period, p_lines: v.lines, p_actor: gate.user.id })
      : await admin.rpc(v.kind === "challan" ? "consignment_save_challan" : "consignment_save_return", {
          p_retailer_id: id, p_doc_date: v.doc_date, p_lines: v.lines, p_actor: gate.user.id, p_doc_id: v.doc_id,
        });
  if (error) {
    const mapped = retailRpcError(error.message);
    if (mapped.status === 500) console.error("[retail] save failed:", error);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
  return NextResponse.json({ doc_id: data }, { status: 201 });
}
```

Create `app/api/admin/retail/docs/[docId]/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { isUuid, parseDocAction } from "@/lib/retail/requests";
import { retailRpcError } from "@/lib/retail/rpc-errors";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ docId: string }> };

/** Issue or cancel one document. Stock moves happen inside the function, under a per-shop lock. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { docId } = await params;
  if (!isUuid(docId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = parseDocAction(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const issuing = parsed.value.action === "issue";
  const { data, error } = await createAdminSupabaseClient().rpc(issuing ? "consignment_issue" : "consignment_cancel", { p_doc_id: docId });
  if (error) {
    const mapped = retailRpcError(error.message);
    if (mapped.status === 500) console.error("[retail] action failed:", error);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
  return NextResponse.json(issuing ? { doc: data } : { result: data });
}
```

Create `app/api/admin/retail/docs/[docId]/pdf/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getBusinessGstin } from "@/lib/config/gstin";
import { buildChallan, buildRetailInvoice, retailPdfFilename } from "@/lib/retail/documents";
import { renderChallanPdf, renderRetailInvoicePdf } from "@/lib/retail/pdf";
import { fetchChallanNumbers, fetchDoc, fetchRetailer } from "@/lib/retail/queries";
import { isUuid } from "@/lib/retail/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ docId: string }> };
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/** The challan or shop invoice as a PDF, built fresh per request. Never cached: it carries the shop's GSTIN and address. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { docId } = await params;
  if (!isUuid(docId)) return notFound();

  let gstin: string;
  try {
    gstin = getBusinessGstin();
  } catch (e) {
    console.error("[retail] BUSINESS_GSTIN misconfigured:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The GSTIN is not configured" }, { status: 500 });
  }

  try {
    const admin = createAdminSupabaseClient();
    const doc = await fetchDoc(admin, docId);
    if (!doc || doc.kind === "return") return notFound();
    const retailer = await fetchRetailer(admin, doc.retailer_id);
    if (!retailer) return notFound();

    const pdf =
      doc.kind === "sale"
        ? await renderRetailInvoicePdf(
            buildRetailInvoice({
              doc,
              retailer,
              gstin,
              challanNumbers: await fetchChallanNumbers(admin, doc.consignment_lines.map((l) => l.batch_line_id).filter((x): x is string => Boolean(x))),
            }),
          )
        : await renderChallanPdf(buildChallan({ doc, retailer, gstin }));

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${retailPdfFilename(doc)}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    console.error("[retail] pdf failed:", e);
    return NextResponse.json({ error: "Couldn't make the PDF" }, { status: 500 });
  }
}
```

Create `app/api/admin/retail/[id]/sheet/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import readExcelFile from "read-excel-file/node";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { XLSX_CONTENT_TYPE } from "@/lib/gst/register-xlsx";
import { currentPeriod, isPeriod } from "@/lib/retail/dates";
import { loadRetailerDetail, shopName } from "@/lib/retail/queries";
import { isUuid } from "@/lib/retail/requests";
import { retailRpcError } from "@/lib/retail/rpc-errors";
import { buildSalesSheet, parseSalesSheet, salesSheetFileName, type ParsedSheet } from "@/lib/retail/sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_BYTES = 1024 * 1024;

function validMonth(value: unknown, now: Date): value is string {
  return isPeriod(value) && value <= currentPeriod(now);
}

/** The month's sales sheet, pre-filled with what the shop holds. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  const now = new Date();
  const month = request.nextUrl.searchParams.get("month");
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!validMonth(month, now)) return NextResponse.json({ error: "Pick a month up to this one" }, { status: 400 });

  try {
    const detail = await loadRetailerDetail(createAdminSupabaseClient(), id, now);
    if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const name = shopName(detail.retailer);
    const file = await buildSalesSheet({ shop: { id, name }, month, holdings: detail.holdings });
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${salesSheetFileName(name, month)}"`,
        ...NO_STORE,
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    console.error("[retail] sheet download failed:", e);
    return NextResponse.json({ error: "Couldn't make the sheet" }, { status: 500 });
  }
}

/** A filled sheet becomes the month's draft sale. Nothing is saved while any row is wrong. The file is not stored. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  const now = new Date();
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const month = form?.get("month");
  const file = form?.get("file");
  if (!validMonth(month, now)) return NextResponse.json({ error: "Pick a month up to this one" }, { status: 400 });
  if (!(file instanceof Blob)) return NextResponse.json({ error: "Choose the filled .xlsx file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 1 MB" }, { status: 413 });

  let sheets: ParsedSheet[];
  try {
    sheets = (await readExcelFile(Buffer.from(await file.arrayBuffer()))) as ParsedSheet[];
  } catch {
    return NextResponse.json({ error: "That file isn't a readable .xlsx" }, { status: 400 });
  }

  try {
    const admin = createAdminSupabaseClient();
    const detail = await loadRetailerDetail(admin, id, now);
    if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = parseSalesSheet(sheets, { shop: { id, name: shopName(detail.retailer) }, month, holdings: detail.holdings });
    if (!parsed.ok) {
      return parsed.rowErrors
        ? NextResponse.json({ error: "Fix these rows in the sheet and upload it again", rowErrors: parsed.rowErrors }, { status: 422 })
        : NextResponse.json({ error: parsed.fileError }, { status: 400 });
    }
    const { data, error } = await admin.rpc("consignment_save_sale", { p_retailer_id: id, p_period: month, p_lines: parsed.lines, p_actor: gate.user.id });
    if (error) {
      const mapped = retailRpcError(error.message);
      if (mapped.status === 500) console.error("[retail] sheet save failed:", error);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }
    return NextResponse.json({ doc_id: data }, { status: 201 });
  } catch (e) {
    console.error("[retail] sheet upload failed:", e);
    return NextResponse.json({ error: "Couldn't read the sheet" }, { status: 500 });
  }
}
```

Create `app/api/admin/retail/[id]/payments/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { PAYMENT_COLUMNS } from "@/lib/retail/queries";
import { isUuid, parsePayment } from "@/lib/retail/requests";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Records money received from a shop, optionally against one of its issued invoices. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = parsePayment(await request.json().catch(() => null), new Date());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const admin = createAdminSupabaseClient();
  if (parsed.value.doc_id) {
    const { data: invoice } = await admin
      .from("consignment_docs")
      .select("id")
      .eq("id", parsed.value.doc_id)
      .eq("retailer_id", id)
      .eq("kind", "sale")
      .eq("status", "issued")
      .maybeSingle();
    if (!invoice) return NextResponse.json({ error: "Pick one of this shop's issued invoices" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("retailer_payments")
    .insert({ ...parsed.value, retailer_id: id, created_by: gate.user.id })
    .select(PAYMENT_COLUMNS)
    .single();
  if (error) {
    console.error("[retail] payment failed:", error);
    return NextResponse.json({ error: "Couldn't save the payment" }, { status: 500 });
  }
  return NextResponse.json({ payment: data }, { status: 201 });
}
```

Create `app/api/admin/retail/payments/[paymentId]/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/retail/requests";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ paymentId: string }> };

/** Removes a mistyped payment. */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { paymentId } = await params;
  if (!isUuid(paymentId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await createAdminSupabaseClient().from("retailer_payments").delete().eq("id", paymentId).select("id");
  if (error) {
    console.error("[retail] payment delete failed:", error);
    return NextResponse.json({ error: "Couldn't delete the payment" }, { status: 500 });
  }
  return (data ?? []).length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run app/api/admin/retail`
Expected: PASS. If `filled()` in the sheet test fails because `write-excel-file` rejects a `null` row cell, replace `null` with `undefined` there; the parser treats both as blank.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/retail
git commit -m "feat(retail): routes for drafts, issue/cancel, PDFs, sales sheet and payments"
```

---

### Task 9: Nav tab and the shops list page

**Files:**
- Modify: `components/admin/nav.ts`, `components/admin/nav.test.ts`
- Create: `lib/retail/client.ts`, `components/admin/retail/RetailerForm.tsx`, `components/admin/retail/index.ts`
- Create: `app/admin/retail/page.tsx`, `app/admin/retail/retail-client.tsx`
- Test: `app/admin/retail/retail-client.test.tsx`, `components/admin/retail/RetailerForm.test.tsx`

**Interfaces:**
- Consumes: kit (`PageHeader`, `ListCard`, `EmptyState`, `ErrorBanner`, `LoadingList`, `ActionSheet`), `Button`, `Input`, `Label`, `Textarea`, `Switch`, `formatPaise`, `monthLabel`, Task 3 types.
- Produces: `retailFetch<T>(url: string, init?: RequestInit): Promise<T>`, `sendJson<T>(url: string, body: unknown, method?: "POST" | "PATCH"): Promise<T>`; `RetailerForm({ initial?: Retailer; submitLabel: string; onSubmit: (body: Record<string, unknown>) => Promise<void> })`; nav tab `{ href: "/admin/retail", label: "Retail" }` after "Sales register".

- [ ] **Step 1: Write the failing tests**

In `components/admin/nav.test.ts` change the first expectation's list to:

```ts
      "Dashboard", "Orders", "Pickups", "Refills", "Stock", "Sales register", "Retail", "On-behalf", "Impersonate", "Admins",
```

and add inside the `describe`:

```ts
  it("shows Retail to admins in the sidebar only", () => {
    const tab = ADMIN_TABS.find((t) => t.href === "/admin/retail");
    expect(tab).toMatchObject({ label: "Retail" });
    expect(tab?.bottom).toBeFalsy();
    expect(tabsForRole("admin").some((t) => t.href === "/admin/retail")).toBe(true);
  });
```

Create `components/admin/retail/RetailerForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RetailerForm } from "./RetailerForm";

describe("RetailerForm", () => {
  it("names the state from a valid GSTIN and flags a bad one", () => {
    render(<RetailerForm submitLabel="Add shop" onSubmit={vi.fn()} />);
    const gstin = screen.getByLabelText("GSTIN");
    fireEvent.change(gstin, { target: { value: "29AAGFC4321M1ZB" } });
    expect(screen.getByText("Karnataka (29)")).toBeInTheDocument();
    fireEvent.change(gstin, { target: { value: "29AAGFC4321M1ZC" } });
    expect(screen.getByText("This GSTIN's last character doesn't match: check for a typo")).toBeInTheDocument();
  });

  it("submits the fields with the share as a number and shows a server error", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("A shop with this GSTIN already exists"));
    render(<RetailerForm submitLabel="Add shop" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Legal name"), { target: { value: "Kids Corner LLP" } });
    fireEvent.change(screen.getByLabelText("GSTIN"), { target: { value: "29AAGFC4321M1ZB" } });
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "12 MG Road" } });
    fireEvent.change(screen.getByLabelText("Our share (%)"), { target: { value: "72.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add shop" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ legal_name: "Kids Corner LLP", gstin: "29AAGFC4321M1ZB", address: "12 MG Road", our_share_pct: 72.5, active: true });
    expect(await screen.findByRole("alert")).toHaveTextContent("A shop with this GSTIN already exists");
  });
});
```

Create `app/admin/retail/retail-client.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { retailer } from "@/lib/retail/__fixtures__/retail";
import RetailClient from "./retail-client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const summary = (o = {}) => ({ unitsHeld: 12, mrpValueHeldPaise: 1200000, invoicedPaise: 75000, paidPaise: 0, owedPaise: 75000, lastReportedPeriod: "2026-09", amberBatches: 0, redBatches: 0, oldestSentOn: "2026-05-01", ...o });

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><RetailClient /></QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("RetailClient", () => {
  it("lists shops with stock, money and a red six-month warning", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({
      items: [{ retailer: retailer(), summary: summary({ redBatches: 2 }) }],
      lastPeriod: "2026-09", missingLastPeriod: [], today: "2026-10-08",
    })));
    renderPage();
    const card = await screen.findByTestId("retail-shop");
    expect(card).toHaveTextContent("Kids Corner");
    expect(card).toHaveTextContent("12 pcs · ₹12,000.00 at MRP");
    expect(card).toHaveTextContent("Owes ₹750.00");
    expect(within(card).getByText("2 batches past 6 months: invoice or take back")).toBeInTheDocument();
    expect(card).toHaveTextContent("Last report: Sep 2026");
  });

  it("warns about shops with no report for last month", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ items: [], lastPeriod: "2026-09", missingLastPeriod: ["Tiny Toes"], today: "2026-10-08" })));
    renderPage();
    expect(await screen.findByRole("status")).toHaveTextContent("No sales report for Sep 2026: Tiny Toes");
  });

  it("shows an empty state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ items: [], lastPeriod: "2026-09", missingLastPeriod: [], today: "2026-10-08" })));
    renderPage();
    expect(await screen.findByText("No shops yet")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run components/admin/nav.test.ts components/admin/retail app/admin/retail`
Expected: FAIL (nav list mismatch; modules not found).

- [ ] **Step 3: Implement**

In `components/admin/nav.ts`, add after the Sales register entry:

```ts
  { href: "/admin/retail", label: "Retail" },
```

Create `lib/retail/client.ts`:

```ts
/** Browser helpers for /api/admin/retail/*. Errors carry the API's message and status. */
export async function retailFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || "Something went wrong"), { status: res.status, body });
  return body as T;
}

export function sendJson<T>(url: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<T> {
  return retailFetch<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
```

Create `components/admin/retail/RetailerForm.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { validateGstin } from "@/lib/retail/gstin";
import type { Retailer } from "@/lib/retail/types";

export function RetailerForm({ initial, submitLabel, onSubmit }: { initial?: Retailer; submitLabel: string; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [values, setValues] = useState({
    legal_name: initial?.legal_name ?? "",
    trade_name: initial?.trade_name ?? "",
    gstin: initial?.gstin ?? "",
    address: initial?.address ?? "",
    contact_name: initial?.contact_name ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    our_share_pct: String(initial?.our_share_pct ?? 75),
  });
  const [active, setActive] = useState(initial?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const gstin = values.gstin.trim() ? validateGstin(values.gstin) : null;
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...values, our_share_pct: Number(values.our_share_pct), active });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof values, label: string, props: Record<string, unknown> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`retailer-${key}`}>{label}</Label>
      <Input id={`retailer-${key}`} value={values[key]} onChange={set(key)} {...props} />
    </div>
  );

  return (
    <form onSubmit={submit} className="grid gap-3 pt-2">
      {field("legal_name", "Legal name", { required: true, maxLength: 200 })}
      {field("trade_name", "Shop name (if different)", { maxLength: 200 })}
      <div className="grid gap-1.5">
        <Label htmlFor="retailer-gstin">GSTIN</Label>
        <Input id="retailer-gstin" value={values.gstin} onChange={set("gstin")} required autoCapitalize="characters" maxLength={20} />
        {gstin && (
          <p className={`text-xs ${gstin.ok ? "text-cb-muted-fg" : "text-red-700"}`}>
            {gstin.ok ? `${gstin.stateName} (${gstin.stateCode})` : gstin.error}
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="retailer-address">Address</Label>
        <Textarea id="retailer-address" value={values.address} onChange={set("address")} required maxLength={500} rows={3} />
      </div>
      {field("contact_name", "Contact person", { maxLength: 100 })}
      {field("phone", "Phone", { inputMode: "tel", maxLength: 20 })}
      {field("email", "Email (invoices go here)", { type: "email", maxLength: 200 })}
      {field("our_share_pct", "Our share (%)", { type: "number", inputMode: "decimal", min: 1, max: 99, step: 0.01, required: true })}
      <div className="flex items-center justify-between">
        <Label htmlFor="retailer-active">Active (can receive stock)</Label>
        <Switch id="retailer-active" checked={active} onCheckedChange={setActive} />
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button type="submit" disabled={saving || (gstin !== null && !gstin.ok)}>{saving ? "Saving…" : submitLabel}</Button>
    </form>
  );
}
```

Create `components/admin/retail/index.ts`:

```ts
export { RetailerForm } from "./RetailerForm";
```

Create `app/admin/retail/page.tsx`:

```tsx
import type { Metadata } from "next";
import RetailClient from "./retail-client";

export const metadata: Metadata = { title: "Retail — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminRetailPage() {
  return <RetailClient />;
}
```

Create `app/admin/retail/retail-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionSheet, EmptyState, ErrorBanner, ListCard, LoadingList, PageHeader } from "@/components/admin/kit";
import { RetailerForm } from "@/components/admin/retail";
import { formatPaise } from "@/lib/gst/register-format";
import { monthLabel } from "@/lib/gst/register-month";
import type { RetailerListItem, RetailerListResponse } from "@/lib/retail/api-types";
import { retailFetch, sendJson } from "@/lib/retail/client";

export const RETAIL_KEY = ["admin", "retail"] as const;

export default function RetailClient() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const query = useQuery({ queryKey: RETAIL_KEY, queryFn: () => retailFetch<RetailerListResponse>("/api/admin/retail"), staleTime: 30_000 });
  const data = query.data;
  const status = (query.error as { status?: number } | null)?.status;

  return (
    <div>
      <PageHeader title="Retail shops" subtitle="Stock on sale-or-return" action={<Button size="sm" onClick={() => setAdding(true)}>Add shop</Button>} />
      {query.isError && (
        <ErrorBanner message={(query.error as Error).message} onRetry={() => void query.refetch()} retrying={query.isFetching}
          loginRedirect={status === 401 || status === 403 ? "/admin/retail" : undefined} />
      )}
      {data ? (
        <div className="grid gap-3">
          {data.missingLastPeriod.length > 0 && (
            <p role="status" className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              No sales report for {monthLabel(data.lastPeriod)}: {data.missingLastPeriod.join(", ")}
            </p>
          )}
          {data.items.length === 0 ? (
            <EmptyState title="No shops yet" hint="Add a shop to send it stock on sale-or-return." />
          ) : (
            <ul className="space-y-2">{data.items.map((item) => <ShopCard key={item.retailer.id} item={item} />)}</ul>
          )}
        </div>
      ) : (
        !query.isError && <LoadingList rows={3} label="Loading shops" />
      )}
      <ActionSheet open={adding} onOpenChange={setAdding} title="Add shop">
        <RetailerForm
          submitLabel="Add shop"
          onSubmit={async (body) => {
            await sendJson("/api/admin/retail", body);
            setAdding(false);
            await qc.invalidateQueries({ queryKey: RETAIL_KEY });
          }}
        />
      </ActionSheet>
    </div>
  );
}

function ShopCard({ item: { retailer: r, summary: s } }: { item: RetailerListItem }) {
  const router = useRouter();
  const plural = (n: number) => (n === 1 ? "batch" : "batches");
  return (
    <ListCard
      testId="retail-shop"
      title={r.trade_name || r.legal_name}
      meta={`${r.gstin}${r.active ? "" : " · inactive"}`}
      dimmed={!r.active}
      onClick={() => router.push(`/admin/retail/${r.id}`)}
    >
      <p className="text-sm text-cb-fg">{s.unitsHeld} pcs · {formatPaise(s.mrpValueHeldPaise)} at MRP</p>
      <p className="text-sm text-cb-fg">Owes {formatPaise(s.owedPaise)}</p>
      {s.redBatches > 0 ? (
        <p className="text-sm font-semibold text-red-700">{s.redBatches} {plural(s.redBatches)} past 6 months: invoice or take back</p>
      ) : s.amberBatches > 0 ? (
        <p className="text-sm text-amber-800">{s.amberBatches} {plural(s.amberBatches)} over 5 months old</p>
      ) : null}
      <p className="text-xs text-cb-muted-fg">{s.lastReportedPeriod ? `Last report: ${monthLabel(s.lastReportedPeriod)}` : "No report yet"}</p>
    </ListCard>
  );
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run components/admin/nav.test.ts components/admin/retail app/admin/retail`
Expected: PASS. If `ListCard` with `onClick` renders children outside the button, the `within(card)` queries still work because `testId` sits on the `<li>`.

- [ ] **Step 5: Commit**

```bash
git add components/admin/nav.ts components/admin/nav.test.ts lib/retail/client.ts components/admin/retail app/admin/retail
git commit -m "feat(retail): Retail tab and the shops list page"
```

---

### Task 10: The shop page (stock, monthly sales, documents, payments)

**Files:**
- Create: `components/admin/retail/PdfButtons.tsx`, `HoldingsList.tsx`, `SalesPanel.tsx`, `DocList.tsx`, `SendStockSheet.tsx`, `TakeBackSheet.tsx`, `PaymentsPanel.tsx`
- Modify: `components/admin/retail/index.ts`
- Create: `app/admin/retail/[id]/page.tsx`, `app/admin/retail/[id]/retailer-client.tsx`
- Test: `app/admin/retail/[id]/retailer-client.test.tsx`, `components/admin/retail/SalesPanel.test.tsx`

**Interfaces:**
- Consumes: `RetailerDetail`, `VariantOption`, `Holding`, `retailFetch`, `sendJson`, `priceSaleLines`, `retailGst`, `docTotalPaise`, `piecesOf`, `mrpValueOf`, `formatDay`, `invoiceDeadline`, `recentPeriods`, `monthLabel`, `formatPaise`, kit components, `RETAIL_KEY` from `app/admin/retail/retail-client.tsx`.
- Produces: `RetailerClient({ id }: { id: string })`; components `PdfButtons({ docId, fileName })`, `HoldingsList({ holdings })`, `SalesPanel({ detail, onChanged })`, `DocList({ detail, onChanged })`, `SendStockSheet({ retailerId, open, onOpenChange, onDone })`, `TakeBackSheet({ detail, open, onOpenChange, onDone })`, `PaymentsPanel({ detail, onChanged })`.

- [ ] **Step 1: Write the failing tests**

Create `components/admin/retail/SalesPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { balance, doc, line, retailer } from "@/lib/retail/__fixtures__/retail";
import { holdingsFrom } from "@/lib/retail/holdings";
import type { RetailerDetail } from "@/lib/retail/api-types";
import { SalesPanel } from "./SalesPanel";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const summary = { unitsHeld: 3, mrpValueHeldPaise: 300000, invoicedPaise: 0, paidPaise: 0, owedPaise: 0, lastReportedPeriod: null, amberBatches: 0, redBatches: 0, oldestSentOn: "2026-10-01" };

function detail(docs = [] as RetailerDetail["docs"]): RetailerDetail {
  return { retailer: retailer(), summary, holdings: holdingsFrom([balance()], "2026-11-08"), docs, payments: [], today: "2026-11-08" };
}

afterEach(() => vi.unstubAllGlobals());

describe("SalesPanel", () => {
  it("defaults to last month and links the sheet download", () => {
    render(<SalesPanel detail={detail()} onChanged={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Download sheet" })).toHaveAttribute("href", `/api/admin/retail/${retailer().id}/sheet?month=2026-10`);
  });

  it("lists row errors from an upload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Fix these rows in the sheet and upload it again", rowErrors: [{ row: 2, code: "petal-frock-1-2y", message: "Sold 9 of Petal Pops Frock (1-2Y) but the shop holds 3" }] }, 422)));
    render(<SalesPanel detail={detail()} onChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Upload filled sheet"), { target: { files: [new File(["x"], "s.xlsx")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Row 2: Sold 9 of Petal Pops Frock (1-2Y) but the shop holds 3");
  });

  it("previews a draft at 75% of MRP with GST and issues it", async () => {
    const draft = doc({ id: "d1", status: "draft", number: null, share_pct: null, period: "2026-10", consignment_lines: [line({ quantity: 2, batch_line_id: "batch-1" })] });
    const fetchMock = vi.fn(async () => json({ doc: { id: "d1" } }));
    vi.stubGlobal("fetch", fetchMock);
    const onChanged = vi.fn();
    render(<SalesPanel detail={detail([draft])} onChanged={onChanged} />);
    expect(screen.getByTestId("sale-preview")).toHaveTextContent("Total ₹1,500.00");
    expect(screen.getByTestId("sale-preview")).toHaveTextContent("CGST ₹35.71");
    fireEvent.click(screen.getByRole("button", { name: "Issue invoice" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/retail/docs/d1", expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "issue" }) }));
  });

  it("shows an issued month with its PDF and no upload", () => {
    render(<SalesPanel detail={detail([doc({ period: "2026-10" })])} onChanged={vi.fn()} />);
    expect(screen.getByText("Invoice CBR/26-27/0001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download PDF" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Upload filled sheet")).not.toBeInTheDocument();
  });
});
```

Create `app/admin/retail/[id]/retailer-client.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { balance, doc, payment, retailer } from "@/lib/retail/__fixtures__/retail";
import { holdingsFrom } from "@/lib/retail/holdings";
import RetailerClient from "./retailer-client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const summary = { unitsHeld: 3, mrpValueHeldPaise: 300000, invoicedPaise: 75000, paidPaise: 50000, owedPaise: 25000, lastReportedPeriod: "2026-10", amberBatches: 0, redBatches: 1, oldestSentOn: "2026-04-01" };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><RetailerClient id={retailer().id} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("fetch", vi.fn(async () => json({
    detail: {
      retailer: retailer(), summary,
      holdings: holdingsFrom([balance({ sent_on: "2026-04-01" })], "2026-11-08"),
      docs: [doc(), doc({ id: "c1", kind: "challan", period: null, number: "CBC/26-27/0001", doc_date: "2026-04-01" })],
      payments: [payment()], today: "2026-11-08",
    },
  })));
});
afterEach(() => vi.unstubAllGlobals());

describe("RetailerClient", () => {
  it("shows the shop, its tiles and the stock tab with the six-month deadline", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Kids Corner" })).toBeInTheDocument();
    expect(screen.getByText("29AAGFC4321M1ZB · Karnataka · 75% ours")).toBeInTheDocument();
    expect(screen.getByText("₹250.00")).toBeInTheDocument();
    expect(screen.getByText("Invoice or take back by 01-10-2026")).toBeInTheDocument();
  });

  it("switches to documents and payments", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Kids Corner" });
    fireEvent.click(screen.getByRole("tab", { name: /^Documents/ }));
    expect(screen.getByText("CBC/26-27/0001")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /^Payments/ }));
    expect(screen.getByText("₹500.00 · UPI · UTR123")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run components/admin/retail/SalesPanel.test.tsx "app/admin/retail/[id]"`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the components**

Create `components/admin/retail/PdfButtons.tsx`:

```tsx
"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const pdfUrl = (docId: string) => `/api/admin/retail/docs/${docId}/pdf`;

/** Download, or Share with the PDF attached (phone share sheet → Gmail). Falls back to a download. */
export function PdfButtons({ docId, fileName }: { docId: string; fileName: string }) {
  const share = async () => {
    try {
      const res = await fetch(pdfUrl(docId), { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error("pdf");
      const file = new File([await res.blob()], fileName, { type: "application/pdf" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        return;
      }
      const url = URL.createObjectURL(file);
      const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error("Couldn't share the PDF");
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline">
        <a href={pdfUrl(docId)} download={fileName}>Download PDF</a>
      </Button>
      <Button size="sm" variant="outline" onClick={() => void share()}>Share</Button>
    </div>
  );
}
```

Create `components/admin/retail/HoldingsList.tsx`:

```tsx
"use client";

import { EmptyState, ListCard } from "@/components/admin/kit";
import { formatPaise } from "@/lib/gst/register-format";
import { invoiceDeadline } from "@/lib/retail/aging";
import { formatDay } from "@/lib/retail/dates";
import type { Holding } from "@/lib/retail/holdings";

const BAND_CLASS = { ok: "text-cb-muted-fg", amber: "text-amber-800", red: "font-semibold text-red-700" } as const;

export function HoldingsList({ holdings }: { holdings: Holding[] }) {
  if (holdings.length === 0) return <EmptyState title="The shop holds no stock" hint="Use Send stock to give it pieces on sale-or-return." />;
  return (
    <ul className="space-y-2">
      {holdings.map((h) => (
        <ListCard key={h.variantSlug} testId="retail-holding" title={`${h.productName} (${h.size})`} meta={`${h.held} held · ${formatPaise(h.mrpValuePaise)} at MRP`}>
          <ul className="mt-1 space-y-1 text-sm">
            {h.batches.map((b) => (
              <li key={b.batch_line_id}>
                <span className="text-cb-fg">{b.held} of {b.sent} · MRP {formatPaise(b.mrp_paise)} · sent {formatDay(b.sent_on)} ({b.challan_number})</span>
                {b.band !== "ok" && <span className={`block ${BAND_CLASS[b.band]}`}>Invoice or take back by {formatDay(invoiceDeadline(b.sent_on))}</span>}
              </li>
            ))}
          </ul>
        </ListCard>
      ))}
    </ul>
  );
}
```

Create `components/admin/retail/SalesPanel.tsx`:

```tsx
"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterChips } from "@/components/admin/kit";
import { formatPaise } from "@/lib/gst/register-format";
import { monthLabel } from "@/lib/gst/register-month";
import type { RetailerDetail } from "@/lib/retail/api-types";
import { retailFetch, sendJson } from "@/lib/retail/client";
import { formatDay, recentPeriods } from "@/lib/retail/dates";
import { priceSaleLines, retailGst } from "@/lib/retail/pricing";
import { retailPdfFilename } from "@/lib/retail/documents";
import { PdfButtons } from "./PdfButtons";
import type { RowError } from "@/lib/retail/types";

export function SalesPanel({ detail, onChanged }: { detail: RetailerDetail; onChanged: () => void }) {
  const { retailer } = detail;
  const periods = useMemo(() => recentPeriods(new Date(`${detail.today}T12:00:00+05:30`), 4), [detail.today]);
  const [month, setMonth] = useState(periods[1]);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sale = detail.docs.find((d) => d.kind === "sale" && d.period === month && d.status !== "cancelled");
  const [manual, setManual] = useState<Record<string, string>>({});

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    setRowErrors([]);
    try {
      await work();
      onChanged();
    } catch (e) {
      const err = e as Error & { body?: { rowErrors?: RowError[] } };
      setRowErrors(err.body?.rowErrors ?? []);
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const upload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.set("month", month);
    form.set("file", file);
    void run(() => retailFetch(`/api/admin/retail/${retailer.id}/sheet`, { method: "POST", body: form }));
  };

  const saveManual = () =>
    void run(() =>
      sendJson(`/api/admin/retail/${retailer.id}/docs`, {
        kind: "sale",
        period: month,
        lines: detail.holdings.map((h) => ({ variant_slug: h.variantSlug, quantity: Number(manual[h.variantSlug] || 0) })),
      }),
    );

  const priced = sale ? priceSaleLines(sale.consignment_lines, sale.share_pct ?? retailer.our_share_pct) : [];
  const gst = sale ? retailGst(priced, retailer.state_code) : null;

  return (
    <div className="grid gap-3">
      <FilterChips label="Month" chips={periods.map((p) => ({ value: p, label: monthLabel(p) }))} value={month} onChange={(m) => { setMonth(m); setManual({}); setRowErrors([]); setMessage(null); }} />

      {sale?.status === "issued" ? (
        <section className="rounded-2xl border border-cb-border bg-cb-white p-4">
          <p className="font-semibold">{sale.number ? `Invoice ${sale.number}` : "Nothing sold"}</p>
          <p className="text-sm text-cb-muted-fg">Dated {formatDay(sale.doc_date)}{gst && sale.number ? ` · ${formatPaise(gst.totals.totalPaise)}` : ""}</p>
          {sale.number && <div className="mt-2"><PdfButtons docId={sale.id} fileName={retailPdfFilename(sale)} /></div>}
        </section>
      ) : (
        <>
          <section className="grid gap-2 rounded-2xl border border-cb-border bg-cb-white p-4">
            <p className="text-sm">Send the shop this month's sheet, then upload it once filled.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="outline"><a href={`/api/admin/retail/${retailer.id}/sheet?month=${month}`}>Download sheet</a></Button>
              <Label htmlFor="sheet-upload" className="sr-only">Upload filled sheet</Label>
              <Input id="sheet-upload" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={upload} disabled={busy} className="max-w-xs" />
            </div>
          </section>

          {(message || rowErrors.length > 0) && (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              {message && <p className="font-semibold">{message}</p>}
              <ul className="mt-1 list-disc pl-5">
                {rowErrors.map((r) => <li key={`${r.row}-${r.code}`}>Row {r.row}: {r.message}</li>)}
              </ul>
            </div>
          )}

          {sale && gst ? (
            <section data-testid="sale-preview" className="rounded-2xl border border-cb-border bg-cb-white p-4 text-sm">
              <p className="font-semibold">Draft for {monthLabel(month)}</p>
              {priced.length === 0 ? <p>Nothing sold.</p> : (
                <ul className="mt-1 space-y-1">
                  {priced.map((l, i) => <li key={i}>{l.description} × {l.quantity} · MRP {formatPaise(l.mrpPaise)} · {formatPaise(l.unitPricePaise)} each</li>)}
                </ul>
              )}
              <p className="mt-2">Taxable {formatPaise(gst.totals.taxablePaise)}</p>
              {gst.mode === "intra"
                ? <p>CGST {formatPaise(gst.totals.cgstPaise)} · SGST {formatPaise(gst.totals.sgstPaise)}</p>
                : <p>IGST {formatPaise(gst.totals.igstPaise)}</p>}
              <p className="font-semibold">Total {formatPaise(gst.totals.totalPaise)}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => void run(() => sendJson(`/api/admin/retail/docs/${sale.id}`, { action: "issue" }))}>Issue invoice</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => sendJson(`/api/admin/retail/docs/${sale.id}`, { action: "cancel" }))}>Discard draft</Button>
              </div>
            </section>
          ) : null}

          <details className="rounded-2xl border border-cb-border bg-cb-white p-4 text-sm">
            <summary className="cursor-pointer font-semibold">Or type the quantities</summary>
            <div className="mt-2 grid gap-2">
              {detail.holdings.map((h) => (
                <label key={h.variantSlug} className="flex items-center justify-between gap-2">
                  <span>{h.productName} ({h.size}) · holds {h.held}</span>
                  <Input type="number" inputMode="numeric" min={0} max={h.held} className="w-20" value={manual[h.variantSlug] ?? ""}
                    onChange={(e) => setManual((m) => ({ ...m, [h.variantSlug]: e.target.value }))} aria-label={`Sold ${h.productName} ${h.size}`} />
                </label>
              ))}
              <Button size="sm" variant="outline" disabled={busy} onClick={saveManual}>Save as draft</Button>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
```

`lib/retail/documents.ts` has no server-only imports, so client components import `retailPdfFilename` from it directly (one definition of the naming rule).

Create `components/admin/retail/DocList.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, ListCard } from "@/components/admin/kit";
import { formatPaise } from "@/lib/gst/register-format";
import { monthLabel } from "@/lib/gst/register-month";
import type { RetailerDetail } from "@/lib/retail/api-types";
import { sendJson } from "@/lib/retail/client";
import { formatDay } from "@/lib/retail/dates";
import { docTotalPaise, mrpValueOf, piecesOf } from "@/lib/retail/pricing";
import type { ConsignmentDoc } from "@/lib/retail/types";
import { retailPdfFilename } from "@/lib/retail/documents";
import { PdfButtons } from "./PdfButtons";

const KIND = { challan: "Challan", sale: "Invoice", return: "Return" } as const;

function describe(d: ConsignmentDoc, share: number): string {
  if (d.kind === "sale") return `${monthLabel(d.period!)} · ${piecesOf(d)} pcs · ${formatPaise(docTotalPaise(d, share))}`;
  return `${piecesOf(d)} pcs · ${formatPaise(mrpValueOf(d))} at MRP`;
}

export function DocList({ detail, onChanged }: { detail: RetailerDetail; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const act = async (d: ConsignmentDoc, action: "issue" | "cancel") => {
    if (action === "cancel" && d.status === "issued" && !window.confirm(`Cancel ${d.number ?? "this document"}? This can't be undone.`)) return;
    setError(null);
    try {
      await sendJson(`/api/admin/retail/docs/${d.id}`, { action });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (detail.docs.length === 0) return <EmptyState title="No documents yet" />;
  return (
    <div className="grid gap-2">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <ul className="space-y-2">
        {detail.docs.map((d) => (
          <ListCard
            key={d.id}
            testId="retail-doc"
            title={d.number ?? (d.status === "draft" ? `Draft ${KIND[d.kind].toLowerCase()}` : "Nothing sold")}
            meta={`${KIND[d.kind]} · ${formatDay(d.doc_date)}`}
            status={d.status}
            dimmed={d.status === "cancelled"}
            actions={
              <div className="flex flex-wrap gap-2">
                {d.status !== "draft" && d.number && d.kind !== "return" && <PdfButtons docId={d.id} fileName={retailPdfFilename(d)} />}
                {d.status === "draft" && <Button size="sm" onClick={() => void act(d, "issue")}>Issue</Button>}
                {d.status !== "cancelled" && (
                  <Button size="sm" variant="ghost" onClick={() => void act(d, "cancel")}>{d.status === "draft" ? "Discard" : "Cancel"}</Button>
                )}
              </div>
            }
          >
            {describe(d, detail.retailer.our_share_pct)}
          </ListCard>
        ))}
      </ul>
    </div>
  );
}
```

Create `components/admin/retail/SendStockSheet.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionSheet } from "@/components/admin/kit";
import { formatPaise } from "@/lib/gst/register-format";
import type { VariantOption } from "@/lib/retail/api-types";
import { retailFetch, sendJson } from "@/lib/retail/client";

type Pick = { option: VariantOption; quantity: string; mrp: string };

export function SendStockSheet({ retailerId, today, open, onOpenChange, onDone }: { retailerId: string; today: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const variants = useQuery({ queryKey: ["admin", "retail", "variants"], queryFn: () => retailFetch<{ variants: VariantOption[] }>("/api/admin/retail/variants"), enabled: open, staleTime: 30_000 });
  const [search, setSearch] = useState("");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = variants.data?.variants ?? [];
    return (q ? list.filter((v) => `${v.productName} ${v.size}`.toLowerCase().includes(q)) : list).slice(0, 30);
  }, [search, variants.data]);

  const add = (option: VariantOption) => {
    if (picks.some((p) => p.option.slug === option.slug)) return;
    setPicks((p) => [...p, { option, quantity: "1", mrp: String(option.pricePaise / 100) }]);
  };
  const update = (slug: string, patch: Partial<Pick>) => setPicks((p) => p.map((x) => (x.option.slug === slug ? { ...x, ...patch } : x)));

  const submit = async (issue: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const { doc_id } = await sendJson<{ doc_id: string }>(`/api/admin/retail/${retailerId}/docs`, {
        kind: "challan",
        doc_date: date,
        lines: picks.map((p) => ({ variant_slug: p.option.slug, quantity: Number(p.quantity), mrp_paise: Math.round(Number(p.mrp) * 100) })),
      });
      if (issue) await sendJson(`/api/admin/retail/docs/${doc_id}`, { action: "issue" });
      setPicks([]);
      onOpenChange(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionSheet open={open} onOpenChange={onOpenChange} title="Send stock" description="Pieces leave your online stock when the challan is issued.">
      <div className="grid gap-3 pt-2">
        <div className="grid gap-1.5">
          <Label htmlFor="send-date">Date sent</Label>
          <Input id="send-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Input placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search products" />
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
          {matches.map((v) => (
            <li key={v.slug}>
              <button type="button" className="w-full rounded-lg px-2 py-1 text-left hover:bg-cb-muted" onClick={() => add(v)}>
                {v.productName} ({v.size}) · {v.stock} in stock · {formatPaise(v.pricePaise)}
              </button>
            </li>
          ))}
        </ul>
        {picks.length > 0 && (
          <ul className="grid gap-2 text-sm">
            {picks.map((p) => (
              <li key={p.option.slug} className="grid grid-cols-[1fr_4rem_6rem_auto] items-center gap-2">
                <span>{p.option.productName} ({p.option.size})</span>
                <Input type="number" min={1} max={p.option.stock} value={p.quantity} onChange={(e) => update(p.option.slug, { quantity: e.target.value })} aria-label={`Quantity ${p.option.productName} ${p.option.size}`} />
                <Input type="number" min={1} step={0.01} value={p.mrp} onChange={(e) => update(p.option.slug, { mrp: e.target.value })} aria-label={`MRP ${p.option.productName} ${p.option.size}`} />
                <Button size="sm" variant="ghost" onClick={() => setPicks((x) => x.filter((y) => y.option.slug !== p.option.slug))}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <Button disabled={busy || picks.length === 0} onClick={() => void submit(true)}>Issue challan</Button>
          <Button variant="outline" disabled={busy || picks.length === 0} onClick={() => void submit(false)}>Save draft</Button>
        </div>
      </div>
    </ActionSheet>
  );
}
```

Create `components/admin/retail/TakeBackSheet.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionSheet } from "@/components/admin/kit";
import type { RetailerDetail } from "@/lib/retail/api-types";
import { sendJson } from "@/lib/retail/client";

export function TakeBackSheet({ detail, open, onOpenChange, onDone }: { detail: RetailerDetail; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [date, setDate] = useState(detail.today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { doc_id } = await sendJson<{ doc_id: string }>(`/api/admin/retail/${detail.retailer.id}/docs`, {
        kind: "return",
        doc_date: date,
        lines: detail.holdings.map((h) => ({ variant_slug: h.variantSlug, quantity: Number(qty[h.variantSlug] || 0) })),
      });
      await sendJson(`/api/admin/retail/docs/${doc_id}`, { action: "issue" });
      setQty({});
      onOpenChange(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionSheet open={open} onOpenChange={onOpenChange} title="Take back" description="Returned pieces go back into your online stock.">
      <div className="grid gap-3 pt-2">
        <div className="grid gap-1.5">
          <Label htmlFor="return-date">Date received</Label>
          <Input id="return-date" type="date" max={detail.today} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <ul className="grid gap-2 text-sm">
          {detail.holdings.map((h) => (
            <li key={h.variantSlug} className="flex items-center justify-between gap-2">
              <span>{h.productName} ({h.size}) · holds {h.held}</span>
              <Input type="number" min={0} max={h.held} className="w-20" value={qty[h.variantSlug] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [h.variantSlug]: e.target.value }))} aria-label={`Returning ${h.productName} ${h.size}`} />
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Button disabled={busy || !Object.values(qty).some((v) => Number(v) > 0)} onClick={() => void submit()}>Take back</Button>
      </div>
    </ActionSheet>
  );
}
```

Create `components/admin/retail/PaymentsPanel.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, ListCard } from "@/components/admin/kit";
import { formatPaise } from "@/lib/gst/register-format";
import type { RetailerDetail } from "@/lib/retail/api-types";
import { retailFetch, sendJson } from "@/lib/retail/client";
import { formatDay } from "@/lib/retail/dates";

const METHOD = { upi: "UPI", bank: "Bank", cash: "Cash" } as const;

export function PaymentsPanel({ detail, onChanged }: { detail: RetailerDetail; onChanged: () => void }) {
  const invoices = detail.docs.filter((d) => d.kind === "sale" && d.status === "issued" && d.number);
  const [form, setForm] = useState({ amount: "", paid_on: detail.today, method: "upi", reference: "", doc_id: "" });
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await sendJson(`/api/admin/retail/${detail.retailer.id}/payments`, {
        amount_paise: Math.round(Number(form.amount) * 100),
        paid_on: form.paid_on,
        method: form.method,
        reference: form.reference,
        doc_id: form.doc_id || null,
      });
      setForm((f) => ({ ...f, amount: "", reference: "" }));
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this payment?")) return;
    try {
      await retailFetch(`/api/admin/retail/payments/${id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="grid gap-3">
      <form onSubmit={submit} className="grid gap-2 rounded-2xl border border-cb-border bg-cb-white p-4 text-sm">
        <p className="font-semibold">Record payment</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1"><Label htmlFor="pay-amount">Amount (₹)</Label><Input id="pay-amount" type="number" min={0.01} step={0.01} required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="grid gap-1"><Label htmlFor="pay-date">Date</Label><Input id="pay-date" type="date" max={detail.today} required value={form.paid_on} onChange={(e) => setForm({ ...form, paid_on: e.target.value })} /></div>
          <div className="grid gap-1"><Label htmlFor="pay-method">Method</Label>
            <select id="pay-method" className="h-10 rounded-md border border-cb-border px-2" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="upi">UPI</option><option value="bank">Bank</option><option value="cash">Cash</option>
            </select>
          </div>
          <div className="grid gap-1"><Label htmlFor="pay-ref">Reference</Label><Input id="pay-ref" maxLength={100} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
        </div>
        <div className="grid gap-1"><Label htmlFor="pay-invoice">Against invoice (optional)</Label>
          <select id="pay-invoice" className="h-10 rounded-md border border-cb-border px-2" value={form.doc_id} onChange={(e) => setForm({ ...form, doc_id: e.target.value })}>
            <option value="">—</option>
            {invoices.map((d) => <option key={d.id} value={d.id}>{d.number}</option>)}
          </select>
        </div>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <Button type="submit" size="sm">Save payment</Button>
      </form>
      {detail.payments.length === 0 ? <EmptyState title="No payments yet" /> : (
        <ul className="space-y-2">
          {detail.payments.map((p) => (
            <ListCard key={p.id} testId="retail-payment" title={formatDay(p.paid_on)} meta={`${formatPaise(p.amount_paise)} · ${METHOD[p.method]}${p.reference ? ` · ${p.reference}` : ""}`}
              actions={<Button size="sm" variant="ghost" onClick={() => void remove(p.id)}>Delete</Button>} />
          ))}
        </ul>
      )}
    </div>
  );
}
```

Replace `components/admin/retail/index.ts` with:

```ts
export { RetailerForm } from "./RetailerForm";
export { PdfButtons } from "./PdfButtons";
export { HoldingsList } from "./HoldingsList";
export { SalesPanel } from "./SalesPanel";
export { DocList } from "./DocList";
export { SendStockSheet } from "./SendStockSheet";
export { TakeBackSheet } from "./TakeBackSheet";
export { PaymentsPanel } from "./PaymentsPanel";
```

Create `app/admin/retail/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import RetailerClient from "./retailer-client";

export const metadata: Metadata = { title: "Shop — Retail — Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminRetailerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RetailerClient id={id} />;
}
```

Create `app/admin/retail/[id]/retailer-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ActionSheet, ErrorBanner, LoadingList, PageHeader, SegmentedTabs, StatGrid, StatTile } from "@/components/admin/kit";
import { DocList, HoldingsList, PaymentsPanel, RetailerForm, SalesPanel, SendStockSheet, TakeBackSheet } from "@/components/admin/retail";
import { gstStateName } from "@/lib/invoice/state-codes";
import { formatPaise } from "@/lib/gst/register-format";
import type { RetailerDetail } from "@/lib/retail/api-types";
import { retailFetch, sendJson } from "@/lib/retail/client";
import { formatDay } from "@/lib/retail/dates";
import { RETAIL_KEY } from "../retail-client";

type Tab = "stock" | "sales" | "documents" | "payments";
type Sheet = "send" | "back" | "edit" | null;

export default function RetailerClient({ id }: { id: string }) {
  const qc = useQueryClient();
  const key = [...RETAIL_KEY, id];
  const query = useQuery({ queryKey: key, queryFn: () => retailFetch<{ detail: RetailerDetail }>(`/api/admin/retail/${id}`).then((b) => b.detail), staleTime: 15_000 });
  const [tab, setTab] = useState<Tab>("stock");
  const [sheet, setSheet] = useState<Sheet>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: RETAIL_KEY });
  const d = query.data;
  const status = (query.error as { status?: number } | null)?.status;

  if (!d) {
    return query.isError ? (
      <ErrorBanner message={(query.error as Error).message} onRetry={() => void query.refetch()} retrying={query.isFetching}
        loginRedirect={status === 401 || status === 403 ? `/admin/retail/${id}` : undefined} />
    ) : <LoadingList rows={3} label="Loading the shop" />;
  }

  const r = d.retailer;
  const s = d.summary;
  return (
    <div className="grid gap-3">
      <PageHeader
        title={r.trade_name || r.legal_name}
        subtitle={`${r.gstin} · ${gstStateName(r.state_code) ?? r.state_code} · ${r.our_share_pct}% ours`}
        action={<Button size="sm" variant="outline" onClick={() => setSheet("edit")}>Edit</Button>}
      />
      {r.email && <p className="-mt-2 text-sm text-cb-muted-fg">Invoices to {r.email}</p>}
      <StatGrid>
        <StatTile label="Pieces held" value={String(s.unitsHeld)} />
        <StatTile label="Value at MRP" value={formatPaise(s.mrpValueHeldPaise)} />
        <StatTile label="Owed" value={formatPaise(s.owedPaise)} tone={s.owedPaise > 0 ? "attention" : "default"} />
        <StatTile label="Oldest batch" value={s.oldestSentOn ? formatDay(s.oldestSentOn) : "—"}
          hint={s.redBatches ? `${s.redBatches} past 6 months` : s.amberBatches ? `${s.amberBatches} over 5 months` : undefined}
          tone={s.redBatches ? "attention" : "default"} />
      </StatGrid>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!r.active} onClick={() => setSheet("send")}>Send stock</Button>
        <Button size="sm" variant="outline" disabled={d.holdings.length === 0} onClick={() => setSheet("back")}>Take back</Button>
      </div>
      <SegmentedTabs<Tab>
        label="Shop sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "stock", label: "Stock", count: s.unitsHeld },
          { key: "sales", label: "Monthly sales" },
          { key: "documents", label: "Documents", count: d.docs.length },
          { key: "payments", label: "Payments" },
        ]}
      />
      {tab === "stock" && <HoldingsList holdings={d.holdings} />}
      {tab === "sales" && <SalesPanel detail={d} onChanged={refresh} />}
      {tab === "documents" && <DocList detail={d} onChanged={refresh} />}
      {tab === "payments" && <PaymentsPanel detail={d} onChanged={refresh} />}

      <SendStockSheet retailerId={r.id} today={d.today} open={sheet === "send"} onOpenChange={(o) => setSheet(o ? "send" : null)} onDone={refresh} />
      <TakeBackSheet detail={d} open={sheet === "back"} onOpenChange={(o) => setSheet(o ? "back" : null)} onDone={refresh} />
      <ActionSheet open={sheet === "edit"} onOpenChange={(o) => setSheet(o ? "edit" : null)} title="Edit shop">
        <RetailerForm initial={r} submitLabel="Save" onSubmit={async (body) => { await sendJson(`/api/admin/retail/${r.id}`, body, "PATCH"); setSheet(null); refresh(); }} />
      </ActionSheet>
    </div>
  );
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run components/admin/retail "app/admin/retail"`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in the new files.

```bash
git add components/admin/retail "app/admin/retail/[id]"
git commit -m "feat(retail): shop page with stock, monthly sales upload, documents and payments"
```

---

### Task 11: Shop invoices and challans in the GST sales register

**Files:**
- Create: `lib/gst/retail-register.ts`
- Test: `lib/gst/retail-register.test.ts`
- Modify: `lib/gst/register-types.ts`, `lib/gst/register-summaries.ts`, `lib/gst/sales-register.ts`, `lib/gst/register-orders.ts`, `lib/gst/register-xlsx.ts`, `lib/gst/register-xlsx.test.ts`, `app/admin/sales-register/sales-register-client.tsx`, `app/admin/sales-register/sales-register-client.test.tsx`

**Interfaces:**
- Consumes: `buildRetailInvoice` (Task 5), `DOC_COLUMNS`, `RETAILER_COLUMNS` (Task 6), existing register modules.
- Produces:
  - `B2bInvoice` (in `register-types.ts`); `SalesRegister.b2b: B2bInvoice[]`, `SalesRegister.hsnB2b: HsnRow[]`, `SalesRegister.challans: DocumentRun[]`; `RegisterTotals.b2b: TaxAmounts`, `.b2bIssued: number`, `.b2bCancelled: number`, `.combinedNet: TaxAmounts`.
  - `retail-register.ts`: `RetailRegisterRow = ConsignmentDoc & { retailers: Retailer }`, `ChallanRow { number: string; status: "issued" | "cancelled" }`, `toB2bInvoice(row: RetailRegisterRow, gstin: string): B2bInvoice`.
  - `buildSalesRegister` input gains optional `retail?: { invoices: RetailRegisterRow[]; challans: ChallanRow[] }`.
  - `register-orders.ts`: `fetchMonthRetailInvoices(admin, month): Promise<RetailRegisterRow[]>`, `fetchMonthChallans(admin, month): Promise<ChallanRow[]>`.
  - `hsnRows` and `documentRuns` accept structural subsets (`Pick<RegisterInvoice, "status" | "lines" | "ratePercent">[]`, `Pick<RegisterInvoice, "invoiceNumber" | "status">[]`).

B2B cancellation is "as at now", not "as at month end": a shop invoice can only be cancelled before the GSTR-1 due date, so a cancelled one is simply listed as cancelled (zero amounts) in its own month and never appears under "Cancelled earlier".

- [ ] **Step 1: Write the failing tests**

Create `lib/gst/retail-register.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { doc, line, retailer, TN_GSTIN } from "@/lib/retail/__fixtures__/retail";
import { GSTIN, NOW, orderRow } from "./__fixtures__/register";
import { toB2bInvoice, type RetailRegisterRow } from "./retail-register";
import { buildSalesRegister } from "./sales-register";

const row = (o: Partial<RetailRegisterRow> = {}): RetailRegisterRow => ({ ...doc({ period: "2026-09", doc_date: "2026-09-30", number: "CBR/26-27/0001" }), retailers: retailer(), ...o });

describe("toB2bInvoice", () => {
  it("carries the shop's GSTIN and the invoice's tax split", () => {
    expect(toB2bInvoice(row(), GSTIN)).toEqual({
      docId: "doc-1",
      invoiceNumber: "CBR/26-27/0001",
      invoiceDate: "2026-09-30",
      retailerName: "Kids Corner LLP",
      retailerGstin: "29AAGFC4321M1ZB",
      placeOfSupply: { code: "29", name: "Karnataka" },
      mode: "intra",
      ratePercent: 5,
      status: "valid",
      amounts: { taxablePaise: 71429, cgstPaise: 1785, sgstPaise: 1786, igstPaise: 0, valuePaise: 75000 },
      lines: [{ hsn: "6111", quantity: 1, taxablePaise: 71429, cgstPaise: 1785, sgstPaise: 1786, igstPaise: 0, valuePaise: 75000 }],
    });
  });
});

describe("buildSalesRegister with shops", () => {
  const register = () =>
    buildSalesRegister({
      month: "2026-09",
      orders: [orderRow()],
      cancelledEarlier: [],
      missingNumbers: [],
      gstin: GSTIN,
      now: NOW,
      retail: {
        invoices: [
          row(),
          row({ id: "doc-2", number: "CBR/26-27/0002", status: "cancelled", cancelled_at: "2026-10-02T05:00:00Z" }),
          row({ id: "doc-3", number: "CBR/26-27/0003", retailers: retailer({ gstin: TN_GSTIN, state_code: "33", legal_name: "Tiny Toes" }), consignment_lines: [line({ quantity: 2, unit_price_paise: 75000 })] }),
        ],
        challans: [
          { number: "CBC/26-27/0001", status: "issued" },
          { number: "CBC/26-27/0002", status: "cancelled" },
          { number: "CBC/26-27/0003", status: "issued" },
        ],
      },
    });

  it("lists shop invoices, zeroing a cancelled one, and totals B2B apart from B2C", () => {
    const r = register();
    expect(r.b2b.map((i) => [i.invoiceNumber, i.status, i.mode])).toEqual([
      ["CBR/26-27/0001", "valid", "intra"],
      ["CBR/26-27/0002", "cancelled", "intra"],
      ["CBR/26-27/0003", "valid", "inter"],
    ]);
    expect(r.totals.b2b.valuePaise).toBe(75000 + 150000);
    expect(r.totals.b2bIssued).toBe(3);
    expect(r.totals.b2bCancelled).toBe(1);
    expect(r.totals.combinedNet.valuePaise).toBe(r.totals.net.valuePaise + 225000);
    expect(r.b2cs.reduce((s, x) => s + x.net.valuePaise, 0)).toBe(105000);
  });

  it("splits HSN into B2C and B2B and adds invoice and challan runs", () => {
    const r = register();
    expect(r.hsnB2b).toEqual([expect.objectContaining({ hsn: "6111", quantity: 3, net: expect.objectContaining({ valuePaise: 225000 }) })]);
    expect(r.hsn).toEqual([expect.objectContaining({ quantity: 1 })]);
    expect(r.documents).toEqual([
      { from: "CB/26-27/0001", to: "CB/26-27/0001", total: 1, cancelled: 0 },
      { from: "CBR/26-27/0001", to: "CBR/26-27/0003", total: 3, cancelled: 1 },
    ]);
    expect(r.challans).toEqual([{ from: "CBC/26-27/0001", to: "CBC/26-27/0003", total: 3, cancelled: 1 }]);
  });

  it("keeps old callers working with no shop data", () => {
    const r = buildSalesRegister({ month: "2026-09", orders: [orderRow()], cancelledEarlier: [], missingNumbers: [], gstin: GSTIN, now: NOW });
    expect(r.b2b).toEqual([]);
    expect(r.challans).toEqual([]);
    expect(r.totals.combinedNet).toEqual(r.totals.net);
  });
});
```

In `lib/gst/register-xlsx.test.ts`:
- Change the "writes seven sheets in order" test name to "writes nine sheets in order" and its second expectation to `["Summary", "Invoices", "B2B", "B2CS", "B2CL", "HSN summary", "HSN B2B", "Documents issued", "Cancelled earlier"]`.
- Change `expect(valueOf(book.Summary, "Invoice value")).toEqual([2190, 0, 2190]);` to `expect(valueOf(book.Summary, "Invoice value")).toEqual([2190, 0, 0, 2190]);` (B2C month, B2B, cancelled earlier, net).
- Add:

```ts
  it("writes shop invoices to the B2B sheet and challans to Documents issued", async () => {
    const { retailer, doc } = await import("@/lib/retail/__fixtures__/retail");
    const r = buildSalesRegister({
      month: "2026-09", orders: [orderRow()], cancelledEarlier: [], missingNumbers: [], gstin: GSTIN, now: NOW,
      retail: { invoices: [{ ...doc({ period: "2026-09", doc_date: "2026-09-30" }), retailers: retailer() }], challans: [{ number: "CBC/26-27/0001", status: "issued" }] },
    });
    const book = await workbook(r);
    expect(book.B2B[0].slice(0, 4)).toEqual(["GSTIN of recipient", "Receiver name", "Invoice no.", "Invoice date"]);
    expect(book.B2B[1].slice(0, 3)).toEqual(["29AAGFC4321M1ZB", "Kids Corner LLP", "CBR/26-27/0001"]);
    expect(book.B2B[1][4]).toBe(750);
    expect(book["Documents issued"].map((row) => row[0])).toContain("Delivery challan in cases other than by way of supply");
    expect(valueOf(book.Summary, "Invoice value")).toEqual([1050, 750, 0, 1800]);
  });
```

In `app/admin/sales-register/sales-register-client.test.tsx` add a case that stubs a register with one B2B invoice (build it with `buildSalesRegister` and the `retail` input as above) and expects `screen.getByRole("region", { name: "Shops (B2B)" })` to contain `CBR/26-27/0001` and the "Invoice value" tile to show the combined net. Copy the file's existing fetch-stub helper for the response.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run lib/gst app/admin/sales-register`
Expected: FAIL (`./retail-register` missing; sheet list mismatch).

- [ ] **Step 3: Implement**

In `lib/gst/register-types.ts` add:

```ts
/** A shop (B2B) invoice: GSTR-1 table 4A. Cancellation is as at now (allowed only before GSTR-1 is due). */
export interface B2bInvoice {
  docId: string;
  invoiceNumber: string;
  /** YYYY-MM-DD, an IST calendar day. */
  invoiceDate: string;
  retailerName: string;
  retailerGstin: string;
  placeOfSupply: { code: string; name: string };
  mode: TaxMode;
  ratePercent: number;
  status: "valid" | "cancelled";
  /** The invoice's own amounts, never zeroed. */
  amounts: TaxAmounts;
  lines: RegisterLine[];
}
```

and extend the existing interfaces:

```ts
// in RegisterTotals:
  /** Valid shop invoices dated in the month. */
  b2b: TaxAmounts;
  b2bIssued: number;
  b2bCancelled: number;
  /** net + b2b: the GSTR-3B 3.1(a) figures. */
  combinedNet: TaxAmounts;

// in SalesRegister:
  b2b: B2bInvoice[];
  /** GSTR-1 table 12 (B2B). */
  hsnB2b: HsnRow[];
  /** GSTR-1 table 13: delivery challan runs. */
  challans: DocumentRun[];
```

Update the `RegisterTotals.net` doc comment to `/** month − cancelledEarlier, store (B2C) sales only. */`.

In `lib/gst/register-summaries.ts` change two signatures (bodies unchanged):

```ts
export function hsnRows(
  invoices: Pick<RegisterInvoice, "status" | "lines" | "ratePercent">[],
  cancelledEarlier: Pick<RegisterInvoice, "status" | "lines" | "ratePercent">[],
): HsnRow[] {
```

```ts
export function documentRuns(invoices: Pick<RegisterInvoice, "invoiceNumber" | "status">[]): DocumentRun[] {
```

Create `lib/gst/retail-register.ts`:

```ts
import { GST_RATE_PERCENT } from "@/lib/config/business";
import { buildRetailInvoice } from "@/lib/retail/documents";
import type { ConsignmentDoc, Retailer } from "@/lib/retail/types";
import type { B2bInvoice } from "./register-types";

/** A shop invoice row as the register reads it (issued or cancelled, with a number). */
export type RetailRegisterRow = ConsignmentDoc & { retailers: Retailer };

export interface ChallanRow {
  number: string;
  status: "issued" | "cancelled";
}

export function toB2bInvoice(row: RetailRegisterRow, gstin: string): B2bInvoice {
  const inv = buildRetailInvoice({ doc: row, retailer: row.retailers, gstin, challanNumbers: [] });
  const t = inv.totals;
  return {
    docId: row.id,
    invoiceNumber: row.number as string,
    invoiceDate: row.doc_date,
    retailerName: row.retailers.legal_name,
    retailerGstin: row.retailers.gstin,
    placeOfSupply: inv.placeOfSupply,
    mode: inv.mode,
    ratePercent: GST_RATE_PERCENT,
    status: row.status === "cancelled" ? "cancelled" : "valid",
    amounts: { taxablePaise: t.taxablePaise, cgstPaise: t.cgstPaise, sgstPaise: t.sgstPaise, igstPaise: t.igstPaise, valuePaise: t.totalPaise },
    lines: inv.lines.map((l) => ({
      hsn: l.hsn,
      quantity: l.quantity,
      taxablePaise: l.taxablePaise,
      cgstPaise: l.cgstPaise,
      sgstPaise: l.sgstPaise,
      igstPaise: l.igstPaise,
      valuePaise: l.amountPaise,
    })),
  };
}
```

In `lib/gst/sales-register.ts`:
- Import: `import { toB2bInvoice, type ChallanRow, type RetailRegisterRow } from "./retail-register";` and add `addAmounts` to the `./register-summaries` import.
- Add `retail?: { invoices: RetailRegisterRow[]; challans: ChallanRow[] };` to the `buildSalesRegister` input type.
- Before the `return`, add:

```ts
  const b2b = [...(input.retail?.invoices ?? [])]
    .sort((a, b) => compareInvoiceNumbers(a.number ?? "", b.number ?? ""))
    .map((row) => toB2bInvoice(row, gstin));
  const b2bValid = b2b.filter((inv) => inv.status === "valid");
  const b2bTotals = sumAmounts(b2bValid.map((inv) => inv.amounts));
  const net = subtractAmounts(monthTotals, earlierTotals);
  const challans = documentRuns(
    (input.retail?.challans ?? []).map((c) => ({ invoiceNumber: c.number, status: c.status === "issued" ? ("valid" as const) : ("cancelled" as const) })),
  );
```

- In the returned object: `documents: [...documentRuns(invoices), ...documentRuns(b2b)]`, add `b2b`, `hsnB2b: hsnRows(b2b, [])`, `challans`, and in `totals` replace `net: subtractAmounts(monthTotals, earlierTotals)` with `net` and add `b2b: b2bTotals, b2bIssued: b2b.length, b2bCancelled: b2b.length - b2bValid.length, combinedNet: addAmounts(net, b2bTotals)`.

In `lib/gst/register-orders.ts`:

```ts
import { DOC_COLUMNS } from "@/lib/retail/queries";
import { monthKey } from "./register-month";
import type { ChallanRow, RetailRegisterRow } from "./retail-register";

/** [first day of month, first day of next month) as YYYY-MM-DD, for date columns. */
function monthDays(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${monthKey(y, m)}-01` };
}

/** The shop fields an invoice needs. Phone and email are deliberately absent (same rule as REGISTER_COLUMNS). */
export const REGISTER_RETAILER_COLUMNS = "id, legal_name, trade_name, gstin, state_code, address, contact_name, our_share_pct, active, created_at";

/** Shop invoices (issued or cancelled) dated in the month. */
export function fetchMonthRetailInvoices(admin: SupabaseClient, month: string): Promise<RetailRegisterRow[]> {
  const { from, to } = monthDays(month);
  return readAll<RetailRegisterRow>((start, end) =>
    admin
      .from("consignment_docs")
      .select(`${DOC_COLUMNS}, retailers(${REGISTER_RETAILER_COLUMNS})`)
      .eq("kind", "sale")
      .not("number", "is", null)
      .in("status", ["issued", "cancelled"])
      .gte("doc_date", from)
      .lt("doc_date", to)
      .order("number", { ascending: true })
      .range(start, end),
  ).then((rows) => rows.map((r) => ({ ...r, share_pct: r.share_pct === null ? null : Number(r.share_pct), retailers: { ...r.retailers, phone: null, email: null, our_share_pct: Number(r.retailers.our_share_pct) } })));
}

/** Challan numbers issued in the month, for GSTR-1 table 13. */
export function fetchMonthChallans(admin: SupabaseClient, month: string): Promise<ChallanRow[]> {
  const { from, to } = monthDays(month);
  return readAll<ChallanRow>((start, end) =>
    admin
      .from("consignment_docs")
      .select("number, status")
      .eq("kind", "challan")
      .not("number", "is", null)
      .gte("doc_date", from)
      .lt("doc_date", to)
      .order("number", { ascending: true })
      .range(start, end),
  );
}
```

and in `loadSalesRegister` add both to the `Promise.all` (after the existing three) and pass `retail: { invoices, challans }` to `buildSalesRegister`.

Add a test in `lib/gst/register-orders.test.ts`: `expect(REGISTER_RETAILER_COLUMNS).not.toMatch(/phone|email/)`.

In `lib/gst/register-xlsx.ts`:
- `SHEET_NAMES = ["Summary", "Invoices", "B2B", "B2CS", "B2CL", "HSN summary", "HSN B2B", "Documents issued", "Cancelled earlier"] as const;`
- In `summarySheet`, after the "Online invoice value" row insert:

```ts
    [],
    head(["Shop invoices (B2B)", ""]),
    [text("Shop invoices issued"), count(t.b2bIssued)],
    [text("Shop invoices cancelled"), count(t.b2bCancelled)],
    ...amountRows(t.b2b),
```

  and change the last block to `head(["Net for the month (GSTR-3B 3.1(a))", ""]), ...amountRows(t.combinedNet),`.
- Add:

```ts
function b2bSheet(r: SalesRegister): SheetData {
  return orNone(
    head(["GSTIN of recipient", "Receiver name", "Invoice no.", "Invoice date", "Invoice value", "Place of supply", "Reverse charge", "Invoice type", "Rate %", "Taxable value", "IGST", "CGST", "SGST", "Cess", "Status"]),
    r.b2b.map((inv) => {
      const a = inv.status === "valid" ? inv.amounts : { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, valuePaise: 0 };
      return [
        text(inv.retailerGstin), text(inv.retailerName), text(inv.invoiceNumber), date(inv.invoiceDate), money(a.valuePaise),
        text(placeOfSupplyLabel(inv.placeOfSupply)), text("N"), text("Regular"), count(inv.ratePercent), money(a.taxablePaise),
        money(a.igstPaise), money(a.cgstPaise), money(a.sgstPaise), money(0),
        text(inv.status === "valid" ? "Valid" : `Cancelled (was ${formatPaise(inv.amounts.valuePaise)})`),
      ];
    }),
  );
}

function hsnB2bSheet(r: SalesRegister): SheetData {
  return orNone(
    head(["HSN", "Description", "UQC", "Total quantity", "Rate %", "Taxable value", "IGST", "CGST", "SGST", "Cess", "Total value"]),
    r.hsnB2b.map((row) => [
      text(row.hsn), text(row.description), text(row.uqc), count(row.quantity), count(row.ratePercent), money(row.net.taxablePaise),
      money(row.net.igstPaise), money(row.net.cgstPaise), money(row.net.sgstPaise), money(0), money(row.net.valuePaise),
    ]),
  );
}
```

  (import `formatPaise` from `./register-format`).
- `documentsSheet`: rows become `[...r.documents.map((run) => [text("Invoices for outward supply"), …]), ...r.challans.map((run) => [text("Delivery challan in cases other than by way of supply"), text(run.from), text(run.to), count(run.total), count(run.cancelled), count(run.total - run.cancelled)])]`.
- `WIDTHS`: add `B2B: [18, 28, 16, 12, 14, 18, 8, 10, 7, 14, 12, 12, 12, 8, 28]` and `"HSN B2B": [8, 52, 12, 14, 7, 14, 12, 12, 12, 8, 14]`; add `B2B: b2bSheet(register)` and `"HSN B2B": hsnB2bSheet(register)` to `data`.

In `app/admin/sales-register/sales-register-client.tsx`:
- `const empty = r.invoices.length === 0 && r.cancelledEarlier.length === 0 && r.b2b.length === 0;`
- The four tiles use `t.combinedNet` in place of `t.net` (hint for earlier cancellations unchanged), and the "Net invoices" tile becomes `String(t.issued - t.cancelled + t.b2bIssued - t.b2bCancelled)` with hint `${t.issued + t.b2bIssued} issued · ${t.cancelled + t.b2bCancelled} cancelled`.
- After the B2CL table, add:

```tsx
          {r.b2b.length > 0 && (
            <section aria-label="Shops (B2B)" className="min-w-0">
              <RegisterTable
                title="Shops (B2B)"
                columns={[
                  { key: "number", label: "Invoice" },
                  { key: "shop", label: "Shop GSTIN" },
                  { key: "taxable", label: "Taxable", numeric: true },
                  { key: "tax", label: "Tax", numeric: true },
                  { key: "value", label: "Value", numeric: true },
                ]}
                rows={r.b2b.map((inv) => {
                  const a = inv.status === "valid" ? inv.amounts : { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, valuePaise: 0 };
                  return {
                    number: inv.status === "valid" ? inv.invoiceNumber : `${inv.invoiceNumber} (cancelled)`,
                    shop: inv.retailerGstin,
                    taxable: formatPaise(a.taxablePaise),
                    tax: formatPaise(taxOf(a)),
                    value: formatPaise(a.valuePaise),
                  };
                })}
              />
            </section>
          )}
```

- After "Invoice numbers used", add a "Challan numbers used" `RegisterTable` over `r.challans` when non-empty (same columns as invoice numbers).

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run lib/gst app/admin/sales-register app/api/admin/sales-register`
Expected: PASS. If an existing test deep-equals a whole `SalesRegister` or `RegisterTotals`, add the new fields (`b2b: []`, `hsnB2b: []`, `challans: []`, `totals.b2b` zero, `b2bIssued: 0`, `b2bCancelled: 0`, `combinedNet` equal to `net`) to its expectation; if a `loadSalesRegister` test counts queries, it now makes five. Change nothing else in old tests.

- [ ] **Step 5: Commit**

```bash
git add lib/gst app/admin/sales-register
git commit -m "feat(gst): shop B2B invoices, HSN B2B and challan runs in the sales register"
```

---

### Task 12: Docs, probe, and full verification

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-10-08-retail-consignment-design.md`, `scripts/sql/security-probe.sql`

- [ ] **Step 1: Record the deliberate deviations in the spec**

In the spec, add a section `## Implementation notes (2026-10-08)` listing:
- Functions are `SECURITY INVOKER` (not definer) and granted to `service_role` only, matching `stall_refill_*`; `gst_financial_year` is granted to `service_role` for them.
- The shop/month marker is a visible "About" sheet (the xlsx writer cannot hide sheets); the MRP column is informational and not checked on upload.
- FIFO allocation lives only in SQL (`consignment_fill_from_batches`), and a sale can only draw on batches sent by its month's last day.
- B2B cancellation is as at now (no "Cancelled earlier" for shop invoices).
- Payments can be deleted (`DELETE /api/admin/retail/payments/[id]`) to fix typos.

- [ ] **Step 2: Add a CLAUDE.md section**

Add under the GST sales register section:

```markdown
### Retail consignment (`/admin/retail`)
- Stock placed in GST-registered shops on sale-or-return. Spec: `docs/superpowers/specs/2026-10-08-retail-consignment-design.md`. Cozyberries raises one B2B tax invoice per shop per month for its share (`our_share_pct`, default 75% of the tag MRP, GST included); the shop bills its own customers. Owner to confirm the model with the CA.
- Tables (admin/internal tier, service role only): `retailers`, `consignment_docs` (`challan` `CBC/yy-yy/NNNN`, `sale` `CBR/…`, `return` `RET/…`; draft → issued → cancelled), `consignment_lines` (challan lines are batches with the MRP locked at dispatch; sale/return lines point at a batch), `retailer_payments`, `consignment_counters`. What a shop holds is the view `retailer_batch_balances` (sent − issued sales − issued returns), never stored.
- All writes go through `consignment_save_challan|return|sale`, `consignment_issue`, `consignment_cancel` (per-shop advisory lock). Issuing a challan takes `product_variants.stock_quantity`; issuing a return gives it back; sales never touch stock. Sales and returns draw on the oldest batch first. A shop invoice can be cancelled only before 00:00 IST on the 11th of the next month (TOO_LATE → credit note via the CA).
- Monthly flow: download `/api/admin/retail/[id]/sheet?month=` (Sales + About sheets), the shop fills "Sold this month", upload it back (row errors → 422, nothing saved), issue, download/share the PDF. Six-month rule (Section 31(7)): batches amber from 5 months, red from 6.
- The sales register adds B2B, HSN B2B and challan runs; `totals.combinedNet` is the GSTR-3B figure. Shop sales stay out of the sales dashboard.
- Tests: `npm run db:test-retail` (rolled back) and vitest under `lib/retail`, `app/api/admin/retail`, `app/admin/retail`, `components/admin/retail`.
```

Also add `/admin/retail` and `/api/admin/retail/*` lines to the route structure block, and add "retail consignment routes" to the service-role "Admin-gated routes" list.

- [ ] **Step 3: Run the whole unit suite, lint and types**

Run: `npm run test:unit && npm run lint && npx tsc --noEmit -p tsconfig.json`
Expected: all pass. Fix anything that fails before continuing.

- [ ] **Step 4: Hand the database steps to the owner**

The migrations are not applied yet. Ask the owner to run, in order, and paste the output:

1. `! npm run db:test-retail` — expect 32 PASS.
2. Apply `supabase/migrations/20261008120000_retail_consignment.sql` then `…120100_retail_consignment_functions.sql` (Supabase SQL editor or their usual migration command).
3. `! npm run db:lint` — expect no new ERROR (still `ERROR=0`).

After step 2 is confirmed live, add `'retailers','consignment_docs','consignment_lines','retailer_payments','consignment_counters'` to the admin-table array in `scripts/sql/security-probe.sql` (line ~81), then ask the owner to run `! npm run db:probe` and expect every line PASS. (Adding them before the tables exist would abort the probe with a missing-relation error.)

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md scripts/sql/security-probe.sql
git add -f docs/superpowers/specs/2026-10-08-retail-consignment-design.md
git commit -m "docs: retail consignment in CLAUDE.md, spec implementation notes, probe tables"
```
