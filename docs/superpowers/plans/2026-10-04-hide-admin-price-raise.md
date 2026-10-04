# Hide Admin Price Raises Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer can never tell that an admin raised an order's prices: the raise is recorded only in an admin-only table, admins see it on admin pages and Telegram, and every invoice shows MRP plus the full discount.

**Architecture:** A new admin/internal-tier table `order_price_overrides` holds who overrode an order's price, how much and why; `POST /api/orders` writes it with the shadow-mode service-role client, and the customer-readable `orders` row keeps only the customer's note and, for a raise, no discount code. A migration backfills the four existing override orders. Customer order pages go back to the normal MRP rule, `toCustomerOrder` scrubs any leftover override text, admin APIs attach the record, Telegram reads it, and `buildInvoice` adds an MRP block.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (Postgres, PostgREST, service role), Vitest 4 + Testing Library, `@react-pdf/renderer`, psql SQL tests.

**Spec:** `docs/superpowers/specs/2026-10-04-hide-admin-price-raise-design.md`

## Global Constraints

- Work only in the worktree `/Users/abdul.azeez/Personal/cozyberries/vercel-frontend-worktrees/hide-price-raise` on `feature/hide-price-raise`. Never `git checkout`/`switch`/`stash`/`push`, and never touch the main checkout `/Users/abdul.azeez/Personal/cozyberries/vercel-frontend`.
- **Never run SQL against the live database** (no `npm run db:test-overrides`, `db:probe`, `db:lint`, `psql`, Supabase MCP writes). The owner runs those. Write the SQL carefully; the final review reads it.
- Table `public.order_price_overrides`, columns exactly: `order_id uuid PK → orders(id) on delete cascade`, `mode text` (`amount` | `percent_off` | `percent_up`), `percent numeric(4,1)` (null exactly when mode is `amount`), `amount numeric(10,2)`, `catalogue_subtotal numeric(10,2)`, `reason text` (≤ 500), `admin_id uuid`, `admin_email text`, `created_at timestamptz default now()`. Admin/internal tier: RLS enabled + forced, no policies, `revoke all … from public, anon, authenticated`, `grant select, insert, delete … to service_role`.
- `orders` after this change: discounts keep `discount_code = 'ADMIN_OVERRIDE'` and their rupee `discount_amount`; a raise has `discount_code` null and `discount_amount` 0; `orders.notes` holds only the customer's own note in every mode. The string `ADMIN_PRICE_UP` must no longer be written anywhere.
- Copy, verbatim:
  - admin line: `Prices raised +10% (+₹245) by asha@… · Event price`, `Prices raised +50%`, `Admin discount −10% (₹245) by …`, `Admin discount ₹250 by … · Offline discount` (" by …" only with an email, " · reason" only with a reason; the minus is U+2212 `−`).
  - Telegram: `📈 Prices raised +10% (+₹245)` / `📈 Prices raised +50%`.
  - Invoice: `Total MRP`, `Discount`, sub-line `(₹A off MRP + ₹B <label>)` or `(₹A off MRP)`; label `special discount` for `ADMIN_OVERRIDE`, the code itself for other codes, `discount` when there is no code.
- Customer-facing code must never read `order_price_overrides` or import `lib/services/price-overrides.ts`.
- Tests: Vitest only (Playwright skipped by the owner's preference). TDD: every behaviour change starts with a failing test.
- TypeScript baseline at branch start: `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` prints **24** (all in files this plan does not touch). It must stay 24.
- Lint: `npx next lint --file <path> …` on changed files shows only the two findings already on `develop` (`app/api/orders/route.test.ts` unused `adminOrdersDelete`, `lib/types/order.ts` empty `OrderCreate` interface).

## Review Focus

1. **A customer opens a raised order whose detail was cached in Redis before the migration** → the response carries no `[ADMIN OVERRIDE …]` line and no `ADMIN_PRICE_UP`. → Task 2 `order-mapper.test.ts`.
2. **A raised order that also has a customer note** → the backfill moves only the first line; the customer note survives. → Task 1 SQL fixture `up` ("…\nGift wrap please").
3. **The override row fails to write** (e.g. the migration isn't applied where the code runs) → the order is rolled back, staff get "Failed to save order", no Telegram message. → Task 4 route test.
4. **The admin list when the override lookup errors** → the list still loads, `price_override: null`. → Task 3 `price-overrides.test.ts` (error → empty map) + Task 5 route tests use it.
5. **A delivery order's invoice** → the "Shipping charges" line has no MRP and Total MRP covers goods only. → Task 6 build-invoice test.

---

### Task 1: Migration, backfill and SQL test

**Files:**
- Create: `supabase/migrations/20261004120000_order_price_overrides.sql`
- Create: `scripts/sql/test-order-price-overrides.sql`
- Create: `scripts/db-test-overrides.mjs`
- Modify: `package.json` (scripts)
- Modify: `scripts/sql/security-probe.sql:80-81` (admin tables list)

**Interfaces:**
- Produces: the table above; `npm run db:test-overrides` (13 assertions).

- [ ] **Step 1: Set up the worktree and commit the docs**

```bash
cd /Users/abdul.azeez/Personal/cozyberries/vercel-frontend-worktrees/hide-price-raise
npm ci
ls -l .env.local   # already a symlink to ../../vercel-frontend/.env.local; do not read it
git add -f docs/superpowers/specs/2026-10-04-hide-admin-price-raise-design.md docs/superpowers/plans/2026-10-04-hide-admin-price-raise.md
git commit -m "docs: hide admin price raises spec and plan"
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"   # expect 24
```

- [ ] **Step 2: Write the SQL test first**

Create `scripts/sql/test-order-price-overrides.sql`:

```sql
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

create function pg_temp.make(p_key text, p_notes text, p_code text, p_discount numeric, p_subtotal numeric)
returns void language plpgsql as $$
declare v_id uuid; v_uid uuid := (select v::uuid from t_ctx where k = 'uid');
begin
  insert into public.orders (user_id, customer_email, subtotal, discount_code, discount_amount,
                             delivery_charge, total_amount, fulfilment_method, notes, placed_by_admin_id)
  values (v_uid, 'zz@test.local', p_subtotal, p_code, p_discount, 0, p_subtotal - p_discount,
          'pickup', p_notes, v_uid)
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

-- 8. updated_at is kept (the trigger is off around the backfill update).
do $$
declare v_now timestamptz;
begin
  select updated_at into v_now from public.orders where id = pg_temp.oid('amt');
  insert into t_result values ('updated_at_kept',
    v_now::text = (select v from t_ctx where k = 'amt:updated_at'),
    format('before=%s after=%s', (select v from t_ctx where k = 'amt:updated_at'), v_now));
end $$;

-- 9. The trigger is back on afterwards.
do $$
declare v_enabled "char";
begin
  select tgenabled into v_enabled from pg_trigger
   where tgrelid = 'public.orders'::regclass and tgname = 'trigger_orders_updated_at';
  insert into t_result values ('updated_at_trigger_reenabled', v_enabled = 'O', format('tgenabled=%s', v_enabled));
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
```

Create `scripts/db-test-overrides.mjs`:

```js
#!/usr/bin/env node
// Behavioural tests for the order-price-overrides migration. The SQL loads the
// migration inside a transaction and rolls back, so it mutates nothing.
import { runPsqlAssertions } from "./lib/run-psql-assertions.mjs";

runPsqlAssertions({ file: "scripts/sql/test-order-price-overrides.sql", expected: 13 });
```

In `package.json` scripts, add after the `"db:test-category-data"` line:

```json
    "db:test-overrides": "node scripts/db-test-overrides.mjs",
```

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261004120000_order_price_overrides.sql`:

```sql
-- Admin price overrides: who discounted or raised an order's prices in shadow
-- mode, by how much and why. Admin/internal tier (CLAUDE.md, Database Security
-- Conventions): no grants to anon/authenticated, RLS forced, no policies.
-- Written by POST /api/orders with the service-role client it holds while an
-- admin is acting; read by /api/admin/orders, /api/admin/pickup-orders,
-- /api/payments/cash and /api/telegram/webhook (all service role).
-- A customer can read every column of their own orders row, so nothing about a
-- price raise may stay on it. Spec:
-- docs/superpowers/specs/2026-10-04-hide-admin-price-raise-design.md
--
-- No begin/commit on purpose: scripts/sql/test-order-price-overrides.sql loads
-- this file inside a rolled-back transaction. Apply it as one transaction:
--   psql "$URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20261004120000_order_price_overrides.sql
-- Every statement is idempotent: re-run it after the code deploys to move any
-- override note the old code wrote in between.

create table if not exists public.order_price_overrides (
  order_id uuid primary key references public.orders(id) on delete cascade,
  mode text not null check (mode in ('amount', 'percent_off', 'percent_up')),
  percent numeric(4,1),
  -- ₹ taken off (discounts) or ₹ added (a raise). Null only for a raise
  -- backfilled from an old note: rounded raised prices hide the exact figure.
  amount numeric(10,2) check (amount is null or amount >= 0),
  catalogue_subtotal numeric(10,2) check (catalogue_subtotal is null or catalogue_subtotal >= 0),
  reason text check (reason is null or char_length(reason) <= 500),
  admin_id uuid,
  admin_email text,
  created_at timestamptz not null default now(),
  constraint order_price_overrides_percent_matches_mode
    check ((mode = 'amount') = (percent is null))
);

alter table public.order_price_overrides enable row level security;
alter table public.order_price_overrides force row level security;
revoke all on table public.order_price_overrides from public, anon, authenticated;
grant select, insert, delete on table public.order_price_overrides to service_role;

-- Backfill: until 2026-10-04 the override was written into orders.notes as a
-- first line "[ADMIN OVERRIDE by <email>]" + optional ": " + optional
-- "(−p% discount)" / "(+p% prices)" + optional reason. Move it into the table.
insert into public.order_price_overrides
  (order_id, mode, percent, amount, catalogue_subtotal, reason, admin_id, admin_email, created_at)
select c.order_id,
       c.mode,
       case when c.mode = 'amount' then null else c.percent end,
       case when c.mode = 'percent_up' then null else c.discount_amount end,
       case when c.mode = 'percent_up' then null else c.subtotal end,
       left(c.reason, 500),
       c.placed_by_admin_id,
       nullif(c.admin_email, ''),
       c.created_at
  from (
    select f.*,
           case when f.detail ~ '^\(\+[0-9]+(\.[0-9])?% prices\)' then 'percent_up'
                when f.detail ~ '^\(−[0-9]+(\.[0-9])?% discount\)' then 'percent_off'
                else 'amount' end as mode,
           substring(f.detail from '^\([+−]([0-9]+(?:\.[0-9])?)% (?:prices|discount)\)')::numeric as percent,
           nullif(btrim(regexp_replace(coalesce(f.detail, ''),
                                       '^\([+−][0-9]+(\.[0-9])?% (prices|discount)\)', '')), '') as reason
      from (
        select o.id as order_id, o.discount_amount, o.subtotal, o.placed_by_admin_id, o.created_at,
               substring(split_part(o.notes, E'\n', 1) from '^\[ADMIN OVERRIDE by ([^\]]*)\]') as admin_email,
               nullif(btrim(substring(split_part(o.notes, E'\n', 1)
                                      from '^\[ADMIN OVERRIDE by [^\]]*\](?:: )?(.*)$')), '') as detail
          from public.orders o
         where o.notes like '[ADMIN OVERRIDE by %'
      ) f
  ) c
on conflict (order_id) do nothing;

-- Strip the moved line and the retired ADMIN_PRICE_UP marker. updated_at must
-- not move: two orders collected on 2026-09-27 predate order_status_events, so
-- collectedAt() falls back to updated_at and would list them under today's
-- "Collected" tab. The trigger is off only inside this transaction.
alter table public.orders disable trigger trigger_orders_updated_at;

update public.orders o
   set notes = nullif(btrim(substr(o.notes, length(split_part(o.notes, E'\n', 1)) + 2)), ''),
       discount_code = case when o.discount_code = 'ADMIN_PRICE_UP' then null else o.discount_code end
 where o.notes like '[ADMIN OVERRIDE by %'
   and exists (select 1 from public.order_price_overrides r where r.order_id = o.id);

alter table public.orders enable trigger trigger_orders_updated_at;
```

- [ ] **Step 4: Add the table to the security probe**

In `scripts/sql/security-probe.sql`, in the `admin_tables_are_service_role_only` block, change:

```sql
                           'impersonation_events','webhook_events','recent_activities',
                           'shelf_refills']
```

to:

```sql
                           'impersonation_events','webhook_events','recent_activities',
                           'shelf_refills','order_price_overrides']
```

(The probe casts each name with `::regclass`, so it must only be run after the migration is applied; the owner's rollout order already does that.)

- [ ] **Step 5: Self-check the SQL without a database**

You cannot run it here. Re-read both SQL files against these checks and fix anything off:
- Each `\ir` path is `../../supabase/migrations/20261004120000_order_price_overrides.sql`.
- Exactly 13 `insert into t_result` statements, matching `expected: 13` in the .mjs: `amount_note_moved`, `bare_line_moved`, `client_roles_have_no_access`, `decimal_raise_parsed`, `delete_cascades`, `percent_must_match_mode`, `percent_off_note_moved`, `plain_note_untouched`, `raise_moved_marker_cleared_customer_note_kept`, `rerun_changes_nothing`, `rls_enabled_and_forced`, `updated_at_kept`, `updated_at_trigger_reenabled`.
- The `−` in the regexes is U+2212 (copy it from this plan), not a hyphen.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261004120000_order_price_overrides.sql scripts/sql/test-order-price-overrides.sql scripts/db-test-overrides.mjs scripts/sql/security-probe.sql package.json
git commit -m "feat(db): admin-only order_price_overrides table, backfilled from override notes"
```

---

### Task 2: Customers see a raised order like any other

**Files:**
- Modify: `lib/utils/order-mapper.ts:54-63` (`toCustomerOrder`)
- Create: `lib/utils/order-mapper.test.ts`
- Modify: `lib/utils/discount.ts` (remove `orderMrpSavings` and its import), `lib/utils/discount.test.ts` (remove its tests)
- Modify: `app/orders/page.tsx:33,370`, `app/orders/[id]/page.tsx:33,291`, `app/orders/[id]/page.test.tsx:77-90`

**Interfaces:**
- Produces: `toCustomerOrder` additionally strips a leading `[ADMIN OVERRIDE by …]` line from `notes` (null when nothing remains) and returns `discount_code: null` for `"ADMIN_PRICE_UP"`. `orderMrpSavings` no longer exists.

- [ ] **Step 1: Write the failing tests**

Create `lib/utils/order-mapper.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toCustomerOrder } from "./order-mapper";

describe("toCustomerOrder", () => {
  it("removes the admin id", () => {
    expect(toCustomerOrder({ id: "o-1", placed_by_admin_id: "admin-1" })).toEqual({ id: "o-1" });
  });

  it("drops a leftover admin override line and keeps the customer's note", () => {
    const out = toCustomerOrder({
      id: "o-1",
      notes: "[ADMIN OVERRIDE by asha@cozyberries.in]: (+10% prices) Event price\nGift wrap please",
    });
    expect(out).toEqual({ id: "o-1", notes: "Gift wrap please" });
  });

  it("leaves no note when the override line was the whole note", () => {
    expect(toCustomerOrder({ id: "o-1", notes: "[ADMIN OVERRIDE by asha@cozyberries.in]" }).notes).toBeNull();
  });

  it("leaves an ordinary note alone", () => {
    expect(toCustomerOrder({ id: "o-1", notes: "Leave at the gate" }).notes).toBe("Leave at the gate");
  });

  it("hides the retired ADMIN_PRICE_UP code but keeps a real discount code", () => {
    expect(toCustomerOrder({ id: "o-1", discount_code: "ADMIN_PRICE_UP" }).discount_code).toBeNull();
    expect(toCustomerOrder({ id: "o-1", discount_code: "ADMIN_OVERRIDE" }).discount_code).toBe("ADMIN_OVERRIDE");
  });

  it("adds no fields to an order that has none of them", () => {
    expect(toCustomerOrder({ id: "o-1" })).toEqual({ id: "o-1" });
  });
});
```

In `app/orders/[id]/page.test.tsx`, replace the test `"shows no MRP rows and no discount row when an admin raised the prices"` with:

```tsx
  it("shows a raised order's MRP like any other order", async () => {
    Object.assign(h.order, {
      discount_code: null,
      discount_amount: 0,
      subtotal: 1100,
      total_amount: 1190,
      items: [{ id: "p1", name: "Frock", price: 1100, quantity: 1, image: "", size: "3-4Y" }],
    });
    render(<OrderDetailsPage />);
    await screen.findByText("Bill details");
    // MRP = ₹1,100 ÷ 0.9 = ₹1,222.
    expect(screen.getByText("Total MRP")).toBeInTheDocument();
    expect(screen.getByText("₹1222")).toBeInTheDocument();
    expect(screen.queryByText(/ADMIN/)).not.toBeInTheDocument();
  });
```

In `lib/utils/discount.test.ts`, delete the whole `describe("orderMrpSavings", …)` block and change the import line to:

```ts
import { getDiscountedPrice, mrpFor, mrpTotals } from "./discount";
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/utils/order-mapper.test.ts "app/orders/[id]/page.test.tsx"`
Expected: FAIL — the override line and `ADMIN_PRICE_UP` survive `toCustomerOrder`; the order page test passes already (the fixture has no `ADMIN_PRICE_UP` code), which is fine: it pins the behaviour once `isPriceRaised` is gone.

- [ ] **Step 3: Implement**

`lib/utils/order-mapper.ts` — replace `toCustomerOrder` and its comment with:

```ts
/** A first line written into orders.notes by admin overrides before 2026-10-04. */
const LEGACY_OVERRIDE_LINE = /^\[ADMIN OVERRIDE by [^\]]*\][^\n]*(\n|$)/;
/** discount_code that marked admin-raised orders before 2026-10-04. */
const LEGACY_PRICE_UP_CODE = "ADMIN_PRICE_UP";

/**
 * Removes admin-only data from an order row before it goes to a customer.
 * `placed_by_admin_id` names the staff account that placed an on-behalf order;
 * customers must never see admin ids. New orders keep override details only in
 * the admin table order_price_overrides, but rows cached in Redis before that
 * migration may still carry the old note line or ADMIN_PRICE_UP code.
 */
export function toCustomerOrder<T extends object>(order: T): Omit<T, "placed_by_admin_id"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { placed_by_admin_id, ...rest } = order as T & { placed_by_admin_id?: unknown };
  const out = rest as Record<string, unknown>;
  if (typeof out.notes === "string" && LEGACY_OVERRIDE_LINE.test(out.notes)) {
    const remaining = out.notes.replace(LEGACY_OVERRIDE_LINE, "").trim();
    out.notes = remaining.length > 0 ? remaining : null;
  }
  if (out.discount_code === LEGACY_PRICE_UP_CODE) out.discount_code = null;
  return rest;
}
```

`lib/utils/discount.ts` — delete the line `import { isPriceRaised } from '@/lib/utils/admin-override'` and the whole `orderMrpSavings` function with its comment.

`app/orders/page.tsx` — change `import { orderMrpSavings } from "@/lib/utils/discount";` to `import { mrpTotals } from "@/lib/utils/discount";` and line 370 `const mrpSavings = orderMrpSavings(order);` to:

```tsx
  const { mrpSavings } = mrpTotals(order.items, order.created_at);
```

`app/orders/[id]/page.tsx` — delete `import { isPriceRaised } from "@/lib/utils/admin-override";` and change line 291 to:

```tsx
            <MrpSummaryRows items={order.items} placedAt={order.created_at} />
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/utils/order-mapper.test.ts "app/orders/[id]/page.test.tsx" lib/utils/discount.test.ts app/api/orders`
Expected: PASS.

Run: `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` → `24`.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/order-mapper.ts lib/utils/order-mapper.test.ts lib/utils/discount.ts lib/utils/discount.test.ts app/orders/page.tsx "app/orders/[id]/page.tsx" "app/orders/[id]/page.test.tsx"
git commit -m "fix(orders): raised orders show MRP like any other; scrub legacy override data for customers"
```

---

### Task 3: Override lookups and the Telegram 📈 line

**Files:**
- Modify: `lib/types/order.ts` (append two types)
- Create: `lib/services/price-overrides.ts`, `lib/services/price-overrides.test.ts`
- Modify: `lib/services/telegram.ts:5,138-162,203,303`, `lib/services/telegram.test.ts:65-69`
- Modify: `app/api/payments/cash/route.ts` (~line 128), `app/api/payments/cash/route.test.ts`
- Modify: `app/api/telegram/webhook/route.ts` (~line 211-238), `app/api/telegram/webhook/route.test.ts`

**Interfaces:**
- Produces (in `@/lib/types/order`):
  ```ts
  export interface PriceOverrideRecord { order_id: string; mode: AdminOverrideMode; percent: number | null; amount: number | null; catalogue_subtotal: number | null; reason: string | null; admin_id: string | null; admin_email: string | null; created_at: string; }
  export interface PriceRaise { percent: number; amount: number | null; }
  ```
- Produces (in `@/lib/services/price-overrides`, server-only):
  ```ts
  fetchPriceOverrides(client: SupabaseClient, orderIds: string[]): Promise<Map<string, PriceOverrideRecord>>
  priceRaiseFrom(record: { mode: AdminOverrideMode; percent: number | null; amount: number | null } | null | undefined): PriceRaise | null
  fetchPriceRaise(client: SupabaseClient, orderId: string): Promise<PriceRaise | null>
  ```
- Produces: `NewOrderData.priceRaise?: PriceRaise | null` in `@/lib/services/telegram`.

- [ ] **Step 1: Write the failing tests**

Create `lib/services/price-overrides.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPriceOverrides, fetchPriceRaise, priceRaiseFrom } from "./price-overrides";

const row = {
  order_id: "o-1", mode: "percent_up", percent: "10.0", amount: "245.00", catalogue_subtotal: "2447.00",
  reason: "Event price", admin_id: "admin-1", admin_email: "asha@cozyberries.in", created_at: "2026-10-04T08:00:00Z",
};

function fakeClient(result: { data: unknown; error: unknown } | Error) {
  const calls: unknown[][] = [];
  const client = {
    from: (table: string) => ({
      select: (cols: string) => ({
        in: async (col: string, ids: string[]) => {
          calls.push([table, cols, col, ids]);
          if (result instanceof Error) throw result;
          return result;
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("fetchPriceOverrides", () => {
  it("returns the rows keyed by order id, with numbers as numbers", async () => {
    const { client, calls } = fakeClient({ data: [row], error: null });
    const map = await fetchPriceOverrides(client, ["o-1", "o-2"]);
    expect(calls[0][0]).toBe("order_price_overrides");
    expect(calls[0][3]).toEqual(["o-1", "o-2"]);
    expect(map.get("o-1")).toEqual({ ...row, percent: 10, amount: 245, catalogue_subtotal: 2447 });
    expect(map.has("o-2")).toBe(false);
  });

  it("skips the query for no orders", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    expect((await fetchPriceOverrides(client, [])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("logs and returns an empty map when the lookup errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient({ data: null, error: { message: "relation does not exist" } });
    expect((await fetchPriceOverrides(client, ["o-1"])).size).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs and returns an empty map when the lookup throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient(new Error("network down"));
    expect((await fetchPriceOverrides(client, ["o-1"])).size).toBe(0);
    spy.mockRestore();
  });
});

describe("priceRaiseFrom", () => {
  it("gives the percent and amount of a raise", () => {
    expect(priceRaiseFrom({ mode: "percent_up", percent: 10, amount: 245 })).toEqual({ percent: 10, amount: 245 });
    expect(priceRaiseFrom({ mode: "percent_up", percent: 50, amount: null })).toEqual({ percent: 50, amount: null });
  });

  it("is null for a discount or no record", () => {
    expect(priceRaiseFrom({ mode: "percent_off", percent: 10, amount: 245 })).toBeNull();
    expect(priceRaiseFrom({ mode: "amount", percent: null, amount: 250 })).toBeNull();
    expect(priceRaiseFrom(null)).toBeNull();
  });
});

describe("fetchPriceRaise", () => {
  it("looks up one order", async () => {
    const { client } = fakeClient({ data: [row], error: null });
    expect(await fetchPriceRaise(client, "o-1")).toEqual({ percent: 10, amount: 245 });
  });
});
```

In `lib/services/telegram.test.ts`, replace the test `"tells the owner an admin raised the prices"` with:

```ts
  it("tells the owner how much an admin raised the prices", () => {
    const text = buildNewOrderText({ ...base, priceRaise: { percent: 10, amount: 1245 } }, "HEADER", "now");
    expect(text).toContain("📈 Prices raised +10% (+₹1,245)");
    expect(text).not.toContain("Discount");
  });

  it("leaves out the rupee figure when a raise was recorded without one", () => {
    const text = buildNewOrderText({ ...base, priceRaise: { percent: 50, amount: null } }, "HEADER", "now");
    expect(text).toContain("📈 Prices raised +50%\n");
    expect(text).not.toContain("(+₹");
  });

  it("no longer treats the retired ADMIN_PRICE_UP code as a raise", () => {
    const text = buildNewOrderText({ ...base, discountCode: "ADMIN_PRICE_UP", discountAmount: 0 }, "HEADER", "now");
    expect(text).not.toContain("📈");
    expect(text).not.toContain("Discount");
  });
```

In `app/api/payments/cash/route.test.ts`:
- Add after the `vi.mock('@/lib/services/telegram', …)` line:

```ts
const overrides = vi.hoisted(() => ({ fetchPriceRaise: vi.fn(async () => null as unknown) }));
vi.mock('@/lib/services/price-overrides', () => ({ fetchPriceRaise: overrides.fetchPriceRaise }));
```

- Add inside `describe('POST /api/payments/cash', …)`:

```ts
  it('tells the owner when an admin raised the prices', async () => {
    asStaff();
    overrides.fetchPriceRaise.mockResolvedValueOnce({ percent: 10, amount: 245 });
    await POST(req({ orderId: 'order-1' }));
    expect(overrides.fetchPriceRaise).toHaveBeenCalledWith(h.client, 'order-1');
    expect(h.notifyNewOrder).toHaveBeenCalledWith(
      expect.objectContaining({ priceRaise: { percent: 10, amount: 245 } }),
      expect.anything()
    );
  });
```

In `app/api/telegram/webhook/route.test.ts`:
- Add after the `vi.mock('@/lib/admin/dashboard-actions', …)` line:

```ts
const overrides = vi.hoisted(() => ({ fetchPriceRaise: vi.fn(async () => null as unknown) }));
vi.mock('@/lib/services/price-overrides', () => ({ fetchPriceRaise: overrides.fetchPriceRaise }));
```

- Add inside `describe('POST /api/telegram/webhook — confirm payment', …)`:

```ts
  it('keeps the price-raise line when it rebuilds the message', async () => {
    overrides.fetchPriceRaise.mockResolvedValueOnce({ percent: 50, amount: null });
    await POST(tap());
    expect(overrides.fetchPriceRaise).toHaveBeenCalledWith(h.client, 'order-1');
    expect(h.buildNewOrderText).toHaveBeenCalledWith(
      expect.objectContaining({ priceRaise: { percent: 50, amount: null } }),
      expect.stringContaining('Payment Confirmed')
    );
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run lib/services/price-overrides.test.ts lib/services/telegram.test.ts app/api/payments/cash/route.test.ts app/api/telegram/webhook/route.test.ts`
Expected: FAIL — `./price-overrides` cannot be resolved; no 📈 line from `priceRaise`; the cash and webhook tests miss `priceRaise`.

- [ ] **Step 3: Types**

Append to `lib/types/order.ts`:

```ts
/** A row of order_price_overrides (admin/internal tier: service role only). */
export interface PriceOverrideRecord {
  order_id: string;
  mode: AdminOverrideMode;
  percent: number | null;
  /** ₹ taken off (discounts) or ₹ added (a raise); null for a raise backfilled from an old note. */
  amount: number | null;
  catalogue_subtotal: number | null;
  reason: string | null;
  admin_id: string | null;
  admin_email: string | null;
  created_at: string;
}

/** What the owner's Telegram message says about a price raise. */
export interface PriceRaise {
  percent: number;
  amount: number | null;
}
```

- [ ] **Step 4: The lookup module**

Create `lib/services/price-overrides.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminOverrideMode, PriceOverrideRecord, PriceRaise } from "@/lib/types/order";

// order_price_overrides is admin/internal tier: only a service-role client can
// read it. Never call these with a customer's session client, and never import
// this module from customer-facing code.

const COLUMNS = "order_id, mode, percent, amount, catalogue_subtotal, reason, admin_id, admin_email, created_at";

const toNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

function toRecord(row: Record<string, unknown>): PriceOverrideRecord {
  return {
    order_id: String(row.order_id),
    mode: row.mode as AdminOverrideMode,
    percent: toNumber(row.percent),
    amount: toNumber(row.amount),
    catalogue_subtotal: toNumber(row.catalogue_subtotal),
    reason: (row.reason as string | null | undefined) ?? null,
    admin_id: (row.admin_id as string | null | undefined) ?? null,
    admin_email: (row.admin_email as string | null | undefined) ?? null,
    created_at: String(row.created_at),
  };
}

/**
 * Override records for these orders, keyed by order id. A failed lookup is
 * logged and gives an empty map, so admin pages and Telegram degrade instead
 * of failing.
 */
export async function fetchPriceOverrides(
  client: SupabaseClient,
  orderIds: string[]
): Promise<Map<string, PriceOverrideRecord>> {
  const records = new Map<string, PriceOverrideRecord>();
  if (orderIds.length === 0) return records;
  try {
    const { data, error } = await client.from("order_price_overrides").select(COLUMNS).in("order_id", orderIds);
    if (error) {
      console.error("[price-overrides] lookup failed:", error);
      return records;
    }
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const record = toRecord(row);
      records.set(record.order_id, record);
    }
  } catch (error) {
    console.error("[price-overrides] lookup threw:", error);
  }
  return records;
}

/** The Telegram 📈 data for a raise; null for a discount or no record. */
export function priceRaiseFrom(
  record: { mode: AdminOverrideMode; percent: number | null; amount: number | null } | null | undefined
): PriceRaise | null {
  if (!record || record.mode !== "percent_up" || record.percent === null) return null;
  return { percent: record.percent, amount: record.amount };
}

/** The 📈 data for one order; null when there is none or the lookup failed. */
export async function fetchPriceRaise(client: SupabaseClient, orderId: string): Promise<PriceRaise | null> {
  const records = await fetchPriceOverrides(client, [orderId]);
  return priceRaiseFrom(records.get(orderId));
}
```

- [ ] **Step 5: Telegram**

In `lib/services/telegram.ts`:
- Replace `import { ADMIN_PRICE_UP_CODE } from "@/lib/utils/admin-override";` with `import type { PriceRaise } from "@/lib/types/order";`.
- In `NewOrderData`, add after `placedByEmail?: string | null;`:

```ts
  /** Set when an admin raised the prices (from order_price_overrides); admins only. */
  priceRaise?: PriceRaise | null;
```

- Replace `adjustmentLine` with:

```ts
/** The pricing line for an admin price raise or a discount; empty when there is neither. */
function adjustmentLine(discountCode: string | null, discountAmount: number, priceRaise?: PriceRaise | null): string {
  if (priceRaise) {
    const rupees = priceRaise.amount === null ? "" : ` (+₹${priceRaise.amount.toLocaleString("en-IN")})`;
    return `📈 Prices raised +${priceRaise.percent}%${rupees}\n`;
  }
  if (discountCode && discountAmount > 0) {
    return `🏷️ Discount (${escapeHtml(discountCode)}): −₹${discountAmount.toLocaleString("en-IN")}\n`;
  }
  return "";
}
```

- In `buildNewOrderText`, change `adjustmentLine(data.discountCode, data.discountAmount)` to `adjustmentLine(data.discountCode, data.discountAmount, data.priceRaise)`. Leave `notifyOrderPlaced`'s call as it is.

- [ ] **Step 6: Cash route and webhook**

`app/api/payments/cash/route.ts`: add `import { fetchPriceRaise } from "@/lib/services/price-overrides";`. Just before `after(() => notifyNewOrder(`, add:

```ts
    // order_price_overrides is service-role only; this route returned 403 above
    // unless an admin is acting, so `client` is the service-role client here.
    const priceRaise = await fetchPriceRaise(client, orderId);
```

and add `priceRaise,` to the object passed to `notifyNewOrder` (after `fulfilmentMethod: …`).

`app/api/telegram/webhook/route.ts`: add `import { fetchPriceRaise } from "@/lib/services/price-overrides";`. Inside `if (full) {`, before `const updatedText =`, add:

```ts
    const priceRaise = await fetchPriceRaise(supabase, orderId);
```

and add `priceRaise,` to the object passed to `buildNewOrderText` (after `customerName: full.customer_name ?? null,`).

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run lib/services/price-overrides.test.ts lib/services/telegram.test.ts app/api/payments/cash/route.test.ts app/api/telegram/webhook/route.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` → `24`.

- [ ] **Step 8: Commit**

```bash
git add lib/types/order.ts lib/services/price-overrides.ts lib/services/price-overrides.test.ts lib/services/telegram.ts lib/services/telegram.test.ts app/api/payments/cash/route.ts app/api/payments/cash/route.test.ts app/api/telegram/webhook/route.ts app/api/telegram/webhook/route.test.ts
git commit -m "feat(telegram): price-raise line comes from the admin-only override record"
```

---

### Task 4: Orders keep no trace of the raise; the record goes to the admin table

**Files:**
- Modify: `lib/utils/admin-override.ts` (types, `priceAdminOverride`, `applyAdminOverride`; remove `ADMIN_PRICE_UP_CODE`, `isPriceRaised`)
- Modify: `lib/utils/admin-override.test.ts`
- Modify: `app/api/orders/route.ts:144-344`, `app/api/orders/route.test.ts`

**Interfaces:**
- Consumes: `priceRaiseFrom` from `@/lib/services/price-overrides` (Task 3).
- Produces (in `@/lib/utils/admin-override`):
  ```ts
  export interface OverrideAudit { mode: AdminOverrideMode; percent: number | null; amount: number; catalogueSubtotal: number; reason: string | null; }
  export interface ApplyAdminOverrideInput<T extends PricedLine> { override: AdminOverride; items: T[]; }
  // success = pricing success & { audit: OverrideAudit }  (no `notes`)
  // AdminOverridePricing ok branch: discountCode: "ADMIN_OVERRIDE" | null  (null for percent_up)
  ```

- [ ] **Step 1: Write the failing tests**

In `lib/utils/admin-override.test.ts`:

Replace the import block with:

```ts
import { describe, expect, it } from "vitest";
import type { AdminOverride } from "@/lib/types/order";
import {
  ADMIN_OVERRIDE_DISCOUNT_CODE,
  ADMIN_OVERRIDE_NOTE_MAX,
  ADMIN_OVERRIDE_PERCENT_ERROR,
  ADMIN_PRICE_UP_GST_ERROR,
  applyAdminOverride,
  linesSubtotal,
  parseOverridePercent,
  priceAdminOverride,
  raisePrice,
} from "./admin-override";
```

Keep `const worth = …`; delete `const admin = "admin@example.com";` if nothing else uses it.

Replace the whole `describe("applyAdminOverride — ₹ amount (behaviour carried over from checkout-helpers)", …)` block with:

```ts
describe("applyAdminOverride — ₹ amount", () => {
  it("returns the clamped, floored discount and its audit record", () => {
    const items = worth(1000);
    expect(applyAdminOverride({ override: { discount_amount: 250, note: "Wholesale customer" }, items })).toEqual({
      ok: true,
      mode: "amount",
      percent: null,
      items,
      discountCode: ADMIN_OVERRIDE_DISCOUNT_CODE,
      discountAmount: 250,
      audit: { mode: "amount", percent: null, amount: 250, catalogueSubtotal: 1000, reason: "Wholesale customer" },
    });
  });

  it("clamps a negative discount to 0", () => {
    const result = applyAdminOverride({ override: { discount_amount: -42 }, items: worth(1000) });
    expect(result.ok && result.discountAmount).toBe(0);
  });

  it("clamps a discount larger than the subtotal to the subtotal", () => {
    const result = applyAdminOverride({ override: { discount_amount: 9999 }, items: worth(500) });
    expect(result.ok && result.audit.amount).toBe(500);
  });

  it("floors a non-integer discount", () => {
    const result = applyAdminOverride({ override: { discount_amount: 123.9 }, items: worth(1000) });
    expect(result.ok && result.discountAmount).toBe(123);
  });

  it("rejects a discount amount that is not a number", () => {
    const override = { discount_amount: "lots" } as unknown as AdminOverride;
    expect(applyAdminOverride({ override, items: worth(1000) })).toEqual({
      ok: false,
      error: "Invalid override discount amount",
    });
  });

  it("keeps a short reason", () => {
    const result = applyAdminOverride({ override: { discount_amount: 100, note: "  ok  " }, items: worth(1000) });
    expect(result.ok && result.audit.reason).toBe("ok");
  });

  it("records no reason when it is blank or missing", () => {
    const blank = applyAdminOverride({ override: { discount_amount: 100, note: "   " }, items: worth(1000) });
    const missing = applyAdminOverride({ override: { discount_amount: 100 }, items: worth(1000) });
    expect(blank.ok && blank.audit.reason).toBeNull();
    expect(missing.ok && missing.audit.reason).toBeNull();
  });

  it("rejects a reason longer than 500 characters", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "x".repeat(ADMIN_OVERRIDE_NOTE_MAX + 1) },
      items: worth(1000),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at most 500/);
  });

  it("accepts a reason of exactly 500 characters", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 10, note: "x".repeat(ADMIN_OVERRIDE_NOTE_MAX) },
      items: worth(1000),
    });
    expect(result.ok).toBe(true);
  });

  it("collapses CR/LF in the reason to single spaces", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "line one\r\nline two\nline three" },
      items: worth(1000),
    });
    expect(result.ok && result.audit.reason).toBe("line one line two line three");
  });

  it("returns no note text for orders.notes", () => {
    const result = applyAdminOverride({ override: { discount_amount: 100, note: "x" }, items: worth(1000) });
    expect(result).not.toHaveProperty("notes");
  });
});
```

In `describe("priceAdminOverride — percentages", …)`, in the test `"percent_up raises every unit price and keeps quantities and other fields"`, change `discountCode: ADMIN_PRICE_UP_CODE,` to `discountCode: null,`.

Replace the `describe("applyAdminOverride — percentage notes", …)` block and the `describe("isPriceRaised", …)` block with:

```ts
describe("applyAdminOverride — percentage audit", () => {
  const lines = [
    { id: "p1", price: 899, quantity: 2 },
    { id: "p2", price: 649, quantity: 1 },
  ];

  it("records a raise as the rupees added across the order", () => {
    const result = applyAdminOverride({ override: { mode: "percent_up", percent: 10, note: "Event price" }, items: lines });
    expect(result.ok && result.discountCode).toBeNull();
    expect(result.ok && result.audit).toEqual({
      mode: "percent_up",
      percent: 10,
      amount: 245, // ₹2,692 raised − ₹2,447 catalogue
      catalogueSubtotal: 2447,
      reason: "Event price",
    });
  });

  it("records a percentage discount as the rupees taken off", () => {
    const result = applyAdminOverride({ override: { mode: "percent_off", percent: 12.5 }, items: lines });
    expect(result.ok && result.discountCode).toBe(ADMIN_OVERRIDE_DISCOUNT_CODE);
    expect(result.ok && result.audit).toEqual({
      mode: "percent_off",
      percent: 12.5,
      amount: 306,
      catalogueSubtotal: 2447,
      reason: null,
    });
  });

  it("checks the percentage before the reason", () => {
    const result = applyAdminOverride({
      override: { mode: "percent_up", percent: 0, note: "x".repeat(ADMIN_OVERRIDE_NOTE_MAX + 1) },
      items: worth(1000),
    });
    expect(result).toEqual({ ok: false, error: ADMIN_OVERRIDE_PERCENT_ERROR });
  });
});
```

In `app/api/orders/route.test.ts`:
- Add `insertOverridesMock,` to the destructured names at the top, create it in `vi.hoisted` with `const insertOverridesMock = vi.fn();`, return it, and in `fromMock` add before `return {};`:

```ts
    if (table === 'order_price_overrides') {
      return { insert: insertOverridesMock };
    }
```

- In both `beforeEach` blocks that call `insertItemsMock.mockResolvedValue({ error: null });`, add `insertOverridesMock.mockResolvedValue({ error: null });` next to it.
- In `'applies admin_override: ignores coupon, stores the discount and audit note, flags the audit event'`, replace `expect(inserted.notes).toBe('[ADMIN OVERRIDE by admin@example.com]: phone-order');` with:

```ts
    expect(inserted.notes).toBeUndefined();
    expect(insertOverridesMock).toHaveBeenCalledWith({
      order_id: 'order-1', mode: 'amount', percent: null, amount: 250, catalogue_subtotal: 1000,
      reason: 'phone-order', admin_id: ADMIN_ID, admin_email: 'admin@example.com',
    });
```

- In `'percent_up stores raised unit prices and a subtotal equal to their sum'`, replace the `toMatchObject({...})` on `inserted` and the `notifyNewOrderMock` assertion with:

```ts
      expect(inserted).toMatchObject({ subtotal: storedSum, discount_amount: 0, delivery_charge: 0, total_amount: 2692 });
      expect(inserted.discount_code).toBeUndefined();
      expect(inserted.notes).toBeUndefined();
      expect(storedSum).toBe(2692);
      expect(insertOverridesMock).toHaveBeenCalledWith({
        order_id: 'order-1', mode: 'percent_up', percent: 10, amount: 245, catalogue_subtotal: 2447,
        reason: 'Event price', admin_id: ADMIN_ID, admin_email: 'admin@example.com',
      });

      expect(notifyNewOrderMock).toHaveBeenCalledWith(
        expect.objectContaining({ discountCode: null, discountAmount: 0, subtotal: 2692, priceRaise: { percent: 10, amount: 245 } }),
        expect.anything()
      );
```

- In `'ignores a coupon sent with a raise'`, replace `expect(inserted).toMatchObject({ discount_code: 'ADMIN_PRICE_UP', discount_amount: 0 });` with:

```ts
      expect(inserted.discount_code).toBeUndefined();
      expect(inserted.discount_amount).toBe(0);
```

- In `'percent_off stores the rounded discount with ADMIN_OVERRIDE and catalogue prices'`, remove the `notes:` line from the `toMatchObject` and add after it:

```ts
      expect(inserted.notes).toBeUndefined();
      expect(insertOverridesMock).toHaveBeenCalledWith(expect.objectContaining({
        mode: 'percent_off', percent: 12.5, amount: 306, catalogue_subtotal: 2447, reason: 'Friend of the shop',
      }));
```

- In `'places the order when the override has no reason'`, remove the `notes:` line from the `toMatchObject` and add:

```ts
      expect(inserted.notes).toBeUndefined();
      expect(insertOverridesMock).toHaveBeenCalledWith(expect.objectContaining({ mode: 'percent_off', reason: null }));
```

- Add inside `describe('admin override by percentage', …)`:

```ts
    it("keeps the customer's own note and nothing else on the order", async () => {
      await POST(makeRequest({
        items: lines,
        shipping_address_id: 'addr-1',
        notes: '  Gift wrap please ',
        admin_override: { mode: 'percent_up', percent: 10, note: 'Event price' },
      }));
      const inserted = (insertOrdersMock.mock.calls[0] as any[])[0];
      expect(inserted.notes).toBe('Gift wrap please');
      expect(JSON.stringify(inserted)).not.toMatch(/ADMIN OVERRIDE|ADMIN_PRICE_UP|Event price/);
    });

    it('rolls the order back when the override record cannot be saved', async () => {
      insertOverridesMock.mockResolvedValueOnce({ error: { message: 'relation "order_price_overrides" does not exist' } });
      const res = await POST(makeRequest({
        items: lines,
        shipping_address_id: 'addr-1',
        admin_override: { mode: 'percent_up', percent: 10 },
      }));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Failed to save order');
      expect(adminOrdersDeleteEq).toHaveBeenCalledWith('id', 'order-1');
      expect(sessionOrdersDelete).not.toHaveBeenCalled();
      expect(notifyNewOrderMock).not.toHaveBeenCalled();
    });
```

- In the stall-pickup test `'keeps delivery charging below the threshold and resolves the place of supply'` add at the end: `expect(insertOverridesMock).not.toHaveBeenCalled();`

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run lib/utils/admin-override.test.ts app/api/orders/route.test.ts`
Expected: FAIL — `audit` missing, `discountCode` is `ADMIN_PRICE_UP`, notes still written, no override insert.

- [ ] **Step 3: The module**

In `lib/utils/admin-override.ts`:
- Delete `ADMIN_PRICE_UP_CODE` (and its comment) and the `isPriceRaised` function.
- Replace `type AdminOverrideCode = typeof ADMIN_OVERRIDE_DISCOUNT_CODE | typeof ADMIN_PRICE_UP_CODE;` with:

```ts
/** A raise carries no code: nothing on the customer-readable order may show it. */
type AdminOverrideCode = typeof ADMIN_OVERRIDE_DISCOUNT_CODE | null;
```

- In `priceAdminOverride`'s final return, change `discountCode: ADMIN_PRICE_UP_CODE,` to `discountCode: null,`.
- Replace `ApplyAdminOverrideSuccess`, `ApplyAdminOverrideInput` and the whole `applyAdminOverride` (with its JSDoc) with:

```ts
/** What POST /api/orders records in the admin-only order_price_overrides table. */
export interface OverrideAudit {
  mode: AdminOverrideMode;
  percent: number | null;
  /** ₹ taken off (discount modes) or ₹ added across the order (a raise). */
  amount: number;
  /** Σ catalogue price × quantity before the override. */
  catalogueSubtotal: number;
  /** The trimmed reason with CR/LF collapsed to spaces, or null. */
  reason: string | null;
}

export type ApplyAdminOverrideSuccess<T extends PricedLine> = Extract<
  AdminOverridePricing<T>,
  { ok: true }
> & { audit: OverrideAudit };

export interface ApplyAdminOverrideInput<T extends PricedLine> {
  override: AdminOverride;
  items: T[];
}

/**
 * Pure validator / applier for the admin price override at checkout.
 *
 * - Prices the override with priceAdminOverride (checked before the reason).
 * - The reason is optional; when given it must be at most 500 chars (trimmed).
 * - Returns the audit record for order_price_overrides. Nothing about the
 *   override goes into orders.notes: customers can read that column.
 *
 * NO side effects — safe to unit-test and to call from any route handler.
 */
export function applyAdminOverride<T extends PricedLine>(
  input: ApplyAdminOverrideInput<T>
): ApplyAdminOverrideResult<T> {
  const { override, items } = input;

  const pricing = priceAdminOverride(override, items);
  if (!pricing.ok) return pricing;

  const noteError = overrideNoteError(override?.note);
  if (noteError) return { ok: false, error: noteError };

  const reason =
    typeof override?.note === "string" ? override.note.trim().replace(/[\r\n]+/g, " ") : "";
  const catalogueSubtotal = linesSubtotal(items);
  const amount =
    pricing.mode === "percent_up"
      ? Math.round((linesSubtotal(pricing.items) - catalogueSubtotal) * 100) / 100
      : pricing.discountAmount;

  return {
    ...pricing,
    audit: {
      mode: pricing.mode,
      percent: pricing.percent,
      amount,
      catalogueSubtotal,
      reason: reason.length > 0 ? reason : null,
    },
  };
}
```

- [ ] **Step 4: The order route**

In `app/api/orders/route.ts`:
- Add `import { priceRaiseFrom } from "@/lib/services/price-overrides";`.
- In the `applyAdminOverride({ … })` call, keep only `override: admin_override,` and `items,` (delete the `actingAdminEmail` and `existingNotes` lines).
- Change `let orderNotes: string | null = normalizedCustomerNotes;` to `const orderNotes: string | null = normalizedCustomerNotes;` and delete the line `orderNotes = appliedOverride.notes;`.
- Replace the whole `if (itemsError) { … }` block with:

```ts
    // Deletes a half-written order. `authenticated` no longer has DELETE on
    // `orders` (deny-by-default RLS remediation), so this runs through the
    // service-role client; the cascade removes its items and override record.
    // NOTE: not atomic — a Supabase RPC wrapping the inserts in one Postgres
    // transaction would be strictly more robust.
    const rollbackOrder = async (orderId: string) => {
      const adminClient = createAdminSupabaseClient();
      const { error: deleteError } = await adminClient
        .from("orders")
        .delete()
        .eq("id", orderId);
      if (deleteError) {
        console.error("Compensating order delete failed — orphaned order may require manual cleanup:", {
          deleteError,
          orderId,
        });
      }
    };

    if (itemsError) {
      await rollbackOrder(order.id);
      console.error("Error inserting order items:", itemsError);
      return NextResponse.json(
        { error: "Failed to save order items" },
        { status: 500 }
      );
    }

    if (appliedOverride) {
      // Who changed the price, by how much and why lives only in the admin-only
      // table: customers can read every column of their own orders row. An
      // override exists only while an admin is acting, so `client` is the
      // service-role client getEffectiveUser returns in shadow mode.
      const { error: overrideError } = await client.from("order_price_overrides").insert({
        order_id: order.id,
        mode: appliedOverride.audit.mode,
        percent: appliedOverride.audit.percent,
        amount: appliedOverride.audit.amount,
        catalogue_subtotal: appliedOverride.audit.catalogueSubtotal,
        reason: appliedOverride.audit.reason,
        admin_id: actingAdminId,
        admin_email: sessionUser.email ?? null,
      });
      if (overrideError) {
        await rollbackOrder(order.id);
        console.error("Error saving price override:", overrideError);
        return NextResponse.json({ error: "Failed to save order" }, { status: 500 });
      }
    }
```

- In the `notifyNewOrder` data, add after `discountAmount,`:

```ts
        priceRaise: priceRaiseFrom(appliedOverride?.audit),
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run lib/utils/admin-override.test.ts app/api/orders/route.test.ts app/checkout/page.test.tsx`
Expected: PASS (the checkout page still compiles and behaves: it never read `ADMIN_PRICE_UP_CODE`).

Run: `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` → `24`.
Run: `grep -rn "ADMIN_PRICE_UP\b\|isPriceRaised\|orderMrpSavings" app lib components hooks | grep -v "LEGACY_PRICE_UP_CODE\|order-mapper\|test\.\|telegram.test"` → no output.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/admin-override.ts lib/utils/admin-override.test.ts app/api/orders/route.ts app/api/orders/route.test.ts
git commit -m "feat(orders): price overrides recorded only in the admin table; raised orders carry no marker"
```

---

### Task 5: Admins see the override on the order pages

**Files:**
- Modify: `lib/utils/admin-override.ts` (add `formatPriceOverride`), `lib/utils/admin-override.test.ts`
- Modify: `app/api/admin/orders/route.ts`, `app/api/admin/orders/route.test.ts`
- Modify: `app/api/admin/pickup-orders/route.ts`, `app/api/admin/pickup-orders/route.test.ts`
- Modify: `app/admin/orders/api.ts` (`AdminOrder`), `app/admin/orders/order-detail-dialog.tsx:97-102`, `app/admin/orders/order-detail-dialog.test.tsx`
- Modify: `lib/orders/pickup.ts:97-111` (`PickupOrderRow`), `app/admin/pickup-orders/pickup-orders-client.tsx:205-214`, `app/admin/pickup-orders/pickup-orders-client.test.tsx`

**Interfaces:**
- Consumes: `fetchPriceOverrides` (Task 3), `PriceOverrideRecord` (Task 3).
- Produces: `formatPriceOverride(record: { mode: AdminOverrideMode; percent: number | null; amount: number | null; reason: string | null; admin_email: string | null }): string`; `price_override?: PriceOverrideRecord | null` on `AdminOrder` and `PickupOrderRow`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/utils/admin-override.test.ts` (and add `formatPriceOverride` to its import list):

```ts
describe("formatPriceOverride", () => {
  const base = { reason: null, admin_email: null } as const;

  it("describes a raise with its rupee figure, admin and reason", () => {
    expect(formatPriceOverride({ ...base, mode: "percent_up", percent: 10, amount: 245, admin_email: "asha@cozyberries.in", reason: "Event price" }))
      .toBe("Prices raised +10% (+₹245) by asha@cozyberries.in · Event price");
  });

  it("describes a backfilled raise without a rupee figure", () => {
    expect(formatPriceOverride({ ...base, mode: "percent_up", percent: 50, amount: null })).toBe("Prices raised +50%");
  });

  it("describes a percentage discount", () => {
    expect(formatPriceOverride({ ...base, mode: "percent_off", percent: 12.5, amount: 1306, admin_email: "asha@cozyberries.in" }))
      .toBe("Admin discount −12.5% (₹1,306) by asha@cozyberries.in");
  });

  it("describes a rupee discount", () => {
    expect(formatPriceOverride({ ...base, mode: "amount", percent: null, amount: 250, reason: "Offline discount" }))
      .toBe("Admin discount ₹250 · Offline discount");
  });
});
```

In `app/api/admin/orders/route.test.ts`, add after the `vi.mock("@/lib/invoice/bill-link", …)` line:

```ts
const overrides = vi.hoisted(() => ({ fetchPriceOverrides: vi.fn(async () => new Map()) }));
vi.mock("@/lib/services/price-overrides", () => ({ fetchPriceOverrides: overrides.fetchPriceOverrides }));
```

and add inside `describe("GET /api/admin/orders", …)`:

```ts
  it("attaches each order's price override, null when there is none", async () => {
    const record = {
      order_id: "o-1", mode: "percent_up", percent: 10, amount: 245, catalogue_subtotal: 2447,
      reason: "Event price", admin_id: "admin-1", admin_email: "asha@cozyberries.in", created_at: "2026-10-04T08:00:00Z",
    };
    overrides.fetchPriceOverrides.mockResolvedValueOnce(new Map([["o-1", record]]));
    h.state.orders = [
      { id: "o-1", user_id: "u-1", status: "processing" },
      { id: "o-2", user_id: "u-2", status: "processing" },
    ];
    h.state.total = 2;
    const body = await (await GET(req())).json();
    expect(overrides.fetchPriceOverrides).toHaveBeenCalledWith(h.admin, ["o-1", "o-2"]);
    expect(body.orders[0].price_override).toEqual(record);
    expect(body.orders[1].price_override).toBeNull();
  });
```

In `app/api/admin/pickup-orders/route.test.ts`, add after the `vi.mock('@/lib/supabase-server', …)` block:

```ts
const overrides = vi.hoisted(() => ({ fetchPriceOverrides: vi.fn(async () => new Map()) }));
vi.mock('@/lib/services/price-overrides', () => ({ fetchPriceOverrides: overrides.fetchPriceOverrides }));
```

In its three exact-shape assertions add `price_override: null` to each order object:
- `orders: [{ id: 'order-1', bill_url: billUrl('order-1'), price_override: null }], awaiting_count: 0`
- `orders: [{ id: 'order-1', bill_url: billUrl('order-1'), price_override: null }], awaiting_count: null`
- `orders: [{ id: 'order-1', bill_url: null, price_override: null }], awaiting_count: 0`

and add inside `describe('GET /api/admin/pickup-orders', …)`:

```ts
  it("attaches the order's price override", async () => {
    const record = { order_id: 'order-1', mode: 'amount', percent: null, amount: 250, catalogue_subtotal: 1300,
      reason: null, admin_id: 'admin-1', admin_email: 'asha@cozyberries.in', created_at: '2026-10-04T08:00:00Z' };
    overrides.fetchPriceOverrides.mockResolvedValueOnce(new Map([['order-1', record]]));
    const body = await (await get('?tab=handover')).json();
    expect(overrides.fetchPriceOverrides).toHaveBeenCalledWith(h.admin, ['order-1']);
    expect(body.orders[0].price_override).toEqual(record);
  });
```

In `app/admin/orders/order-detail-dialog.test.tsx`, add:

```tsx
describe("OrderDetailDialog price override", () => {
  it("shows who raised the prices and why", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderDialog(qc, makeOrder({
      price_override: {
        order_id: "o-1", mode: "percent_up", percent: 10, amount: 245, catalogue_subtotal: 2447,
        reason: "Event price", admin_id: "admin-1", admin_email: "asha@cozyberries.in", created_at: "2026-10-04T08:00:00Z",
      },
    }));
    expect(screen.getByText("Prices raised +10% (+₹245) by asha@cozyberries.in · Event price")).toBeInTheDocument();
  });

  it("shows nothing for an order without an override", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderDialog(qc, makeOrder());
    expect(screen.queryByText(/Prices raised|Admin discount/)).not.toBeInTheDocument();
  });
});
```

In `app/admin/pickup-orders/pickup-orders-client.test.tsx`, add inside `describe("pickup orders card", …)`:

```tsx
  it("shows an admin price override on the card", async () => {
    respond({
      orders: [{
        ...order,
        price_override: {
          order_id: "order-1", mode: "percent_off", percent: 10, amount: 130, catalogue_subtotal: 1300,
          reason: null, admin_id: "admin-1", admin_email: "asha@cozyberries.in", created_at: "2026-10-04T08:00:00Z",
        },
      }],
    });
    render(<PickupOrdersClient />);
    expect(await screen.findByText("Admin discount −10% (₹130) by asha@cozyberries.in")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run lib/utils/admin-override.test.ts app/api/admin/orders/route.test.ts app/api/admin/pickup-orders/route.test.ts app/admin/orders/order-detail-dialog.test.tsx app/admin/pickup-orders/pickup-orders-client.test.tsx`
Expected: FAIL — `formatPriceOverride` missing; no `price_override` on responses; no line rendered.

- [ ] **Step 3: Implement**

Append to `lib/utils/admin-override.ts`:

```ts
/**
 * One line for admin pages, e.g. "Prices raised +10% (+₹245) by a@b.c · Event price".
 * Admin-only: never render it on a customer page.
 */
export function formatPriceOverride(record: {
  mode: AdminOverrideMode;
  percent: number | null;
  amount: number | null;
  reason: string | null;
  admin_email: string | null;
}): string {
  const rupees = (value: number) => `₹${Number(value).toLocaleString("en-IN")}`;
  const percent = record.percent === null ? "" : String(Number(record.percent));
  let head: string;
  if (record.mode === "percent_up") {
    head = `Prices raised +${percent}%${record.amount === null ? "" : ` (+${rupees(record.amount)})`}`;
  } else if (record.mode === "percent_off") {
    head = `Admin discount −${percent}%${record.amount === null ? "" : ` (${rupees(record.amount)})`}`;
  } else {
    head = record.amount === null ? "Admin discount" : `Admin discount ${rupees(record.amount)}`;
  }
  const by = record.admin_email ? ` by ${record.admin_email}` : "";
  const why = record.reason ? ` · ${record.reason}` : "";
  return `${head}${by}${why}`;
}
```

`app/api/admin/orders/route.ts`: add `import { fetchPriceOverrides } from "@/lib/services/price-overrides";`. After `const paymentMap = byOrder(payments);` add:

```ts
  // Admin-only record of price overrides; a failed lookup just leaves them null.
  const overrides = await fetchPriceOverrides(admin, ids);
```

and in the returned order object add `price_override: overrides.get(o.id as string) ?? null,` after `bill_url: …`.

`app/api/admin/pickup-orders/route.ts`: add `import { fetchPriceOverrides } from "@/lib/services/price-overrides";`. Before `let orders;` add:

```ts
    // Admin-only record of price overrides; a failed lookup just leaves them null.
    const overrides = await fetchPriceOverrides(admin, rows.map((row) => row.id));
```

and change both maps to include it:

```ts
      orders = rows.map((row) => ({ ...row, bill_url: billUrl(row.id), price_override: overrides.get(row.id) ?? null }));
```

```ts
      orders = rows.map((row) => ({ ...row, bill_url: null, price_override: overrides.get(row.id) ?? null }));
```

`app/admin/orders/api.ts`: change the first import to `import type { OrderStatus, PriceOverrideRecord } from "@/lib/types/order";` and add to `AdminOrder` after `bill_url: string | null;`:

```ts
  /** Admin-only: who discounted or raised this order's prices, and why. */
  price_override?: PriceOverrideRecord | null;
```

`lib/orders/pickup.ts`: add `PriceOverrideRecord` to its `@/lib/types/order` type import (add the import if there is none) and add to `PickupOrderRow` after `bill_url: string | null;`:

```ts
  /** Admin-only: who discounted or raised this order's prices, and why. */
  price_override?: PriceOverrideRecord | null;
```

`app/admin/orders/order-detail-dialog.tsx`: add `import { formatPriceOverride } from "@/lib/utils/admin-override";` and, right after the items `</ul>` (before the closing `</div>` of that first block), add:

```tsx
          {order.price_override && (
            <p className="mt-1 text-xs font-medium text-amber-800">{formatPriceOverride(order.price_override)}</p>
          )}
```

`app/admin/pickup-orders/pickup-orders-client.tsx`: add `import { formatPriceOverride } from "@/lib/utils/admin-override";` and, right after the `order.order_items` `</ul>`, add:

```tsx
                {order.price_override && (
                  <p className="mt-2 text-xs font-medium text-amber-800">{formatPriceOverride(order.price_override)}</p>
                )}
```

- [ ] **Step 4: Run the tests to see them pass**

Run the Step 2 command again. Expected: PASS.
Run: `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` → `24`.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/admin-override.ts lib/utils/admin-override.test.ts app/api/admin/orders/route.ts app/api/admin/orders/route.test.ts app/api/admin/pickup-orders/route.ts app/api/admin/pickup-orders/route.test.ts app/admin/orders/api.ts app/admin/orders/order-detail-dialog.tsx app/admin/orders/order-detail-dialog.test.tsx lib/orders/pickup.ts app/admin/pickup-orders/pickup-orders-client.tsx app/admin/pickup-orders/pickup-orders-client.test.tsx
git commit -m "feat(admin): show price overrides on admin order pages"
```

---

### Task 6: Invoice shows the MRP and the full discount

**Files:**
- Modify: `lib/invoice/build-invoice.ts`, `lib/invoice/build-invoice.test.ts`
- Modify: `app/orders/[id]/invoice/page.tsx:155-217`, `app/orders/[id]/invoice/page.test.tsx`
- Modify: `lib/invoice/pdf.tsx` (styles, item table, totals), `lib/invoice/pdf.test.ts`

**Interfaces:**
- Consumes: `mrpFor`, `mrpTotals` from `@/lib/utils/discount`; `ADMIN_OVERRIDE_DISCOUNT_CODE` from `@/lib/utils/admin-override`.
- Produces: `InvoiceOrderRow.discount_code?: string | null`; `InvoiceDocument.mrp: InvoiceMrp | null` where

```ts
export interface InvoiceMrp {
  unitMrpPaise: (number | null)[];   // aligned with `lines`; null on "Shipping charges"
  totalMrpPaise: number;             // goods only
  mrpSavingPaise: number;            // Total MRP − Σ price × quantity
  extraDiscountPaise: number;        // the order's own discount (admin or coupon)
  extraDiscountLabel: string | null; // "special discount" | coupon code | "discount"; null when no extra discount
  discountPaise: number;             // mrpSaving + extraDiscount
}
```

- [ ] **Step 1: Write the failing tests**

In `lib/invoice/build-invoice.test.ts`, change the first import to `import { afterEach, describe, expect, it, vi } from "vitest";` and add after the imports:

```ts
const mrp = vi.hoisted(() => ({ discountRate: 0.1, shownSince: new Date("2026-09-27T00:00:00+05:30") }));
vi.mock("@/lib/config/offers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/offers")>()),
  MRP_DISPLAY: mrp,
}));
afterEach(() => {
  mrp.discountRate = 0.1;
});
```

and append:

```ts
describe("buildInvoice — MRP and the full discount", () => {
  const placed = "2026-10-02T10:00:00+05:30";

  it("shows no MRP for an order placed before the MRP was shown", () => {
    expect(build({}).mrp).toBeNull(); // baseOrder is from 25 Sep
  });

  it("shows no MRP while the MRP display is off", () => {
    mrp.discountRate = 0;
    expect(build({ created_at: placed }).mrp).toBeNull();
  });

  it("lists the MRP saving as the discount on a plain order", () => {
    // ₹1,050 ÷ 0.9 = ₹1,166.67 → ₹1,167.
    expect(build({ created_at: placed }).mrp).toEqual({
      unitMrpPaise: [116700],
      totalMrpPaise: 116700,
      mrpSavingPaise: 11700,
      extraDiscountPaise: 0,
      extraDiscountLabel: null,
      discountPaise: 11700,
    });
  });

  it("adds an admin discount as a special discount", () => {
    const inv = build({
      created_at: placed, subtotal: 1000, discount_code: "ADMIN_OVERRIDE", discount_amount: 100, total_amount: 900,
      order_items: [{ name: "Frock", size: "3-4Y", color: null, price: 1000, quantity: 1 }],
    });
    expect(inv.mrp).toMatchObject({
      totalMrpPaise: 111100, mrpSavingPaise: 11100, extraDiscountPaise: 10000,
      extraDiscountLabel: "special discount", discountPaise: 21100,
    });
    expect(inv.totals.totalPaise).toBe(90000);
  });

  it("names a coupon by its code", () => {
    const inv = build({
      created_at: placed, subtotal: 1000, discount_code: "EARLY5", discount_amount: 50, total_amount: 950,
      order_items: [{ name: "Frock", size: null, color: null, price: 1000, quantity: 1 }],
    });
    expect(inv.mrp?.extraDiscountLabel).toBe("EARLY5");
  });

  it("gives a raised line its own MRP, so it reads like any other", () => {
    const inv = build({
      created_at: placed, subtotal: 989, total_amount: 989,
      order_items: [{ name: "Frock", size: null, color: null, price: 989, quantity: 1 }],
    });
    expect(inv.mrp).toMatchObject({ totalMrpPaise: 109900, mrpSavingPaise: 11000, discountPaise: 11000 });
  });

  it("leaves the shipping line without an MRP and out of Total MRP", () => {
    const inv = build({
      created_at: placed, fulfilment_method: "delivery", delivery_charge: 90, total_amount: 1140,
      shipping_address: { full_name: "Asha Rao", address_line_1: "1 MG Road", city: "Bengaluru", state: "Karnataka", postal_code: "560001", country: "India" },
    });
    expect(inv.lines).toHaveLength(2);
    expect(inv.mrp?.unitMrpPaise).toEqual([116700, null]);
    expect(inv.mrp?.totalMrpPaise).toBe(116700);
  });

  it("changes no tax figure", () => {
    const order = {
      subtotal: 1000, discount_code: "ADMIN_OVERRIDE", discount_amount: 100, total_amount: 900,
      order_items: [{ name: "Frock", size: null, color: null, price: 1000, quantity: 1 }],
    };
    const withMrp = build({ ...order, created_at: placed });
    const withoutMrp = build({ ...order });
    expect(withMrp.totals).toEqual(withoutMrp.totals);
    expect(withMrp.lines).toEqual(withoutMrp.lines);
  });
});
```

In `app/orders/[id]/invoice/page.test.tsx`, add inside `describe("invoice page", …)`:

```tsx
  it("shows the MRP, Total MRP and the full discount when the invoice has them", async () => {
    serve({
      ...base, status: "issued", invoiceNumber: "CB/26-27/0001",
      mrp: { unitMrpPaise: [116700], totalMrpPaise: 116700, mrpSavingPaise: 11700, extraDiscountPaise: 10000,
             extraDiscountLabel: "special discount", discountPaise: 21700 },
    });
    render(<InvoicePage />);
    expect(await screen.findByText("Total MRP")).toBeInTheDocument();
    expect(screen.getByText("MRP")).toBeInTheDocument();
    expect(screen.getAllByText("₹1,167.00").length).toBeGreaterThan(0);
    expect(screen.getByText("−₹217.00")).toBeInTheDocument();
    expect(screen.getByText("(₹117.00 off MRP + ₹100.00 special discount)")).toBeInTheDocument();
    expect(screen.queryByText("Discount (included above)")).not.toBeInTheDocument();
  });

  it("keeps the old layout for an invoice without MRP", async () => {
    serve({ ...base, status: "issued", invoiceNumber: "CB/26-27/0001", mrp: null });
    render(<InvoicePage />);
    expect(await screen.findByText("TAX INVOICE")).toBeInTheDocument();
    expect(screen.queryByText("Total MRP")).not.toBeInTheDocument();
    expect(screen.queryByText("MRP")).not.toBeInTheDocument();
  });
```

In `lib/invoice/pdf.test.ts`, add inside `describe("renderInvoicePdf", …)`:

```ts
  it("renders an invoice with the MRP block", async () => {
    const withMrp = doc({ created_at: "2026-10-02T10:00:00+05:30", discount_code: "ADMIN_OVERRIDE" });
    expect(withMrp.mrp).not.toBeNull();
    const pdf = await renderInvoicePdf(withMrp);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run lib/invoice "app/orders/[id]/invoice/page.test.tsx"`
Expected: FAIL — `mrp` is undefined on the document; the page renders no MRP.

- [ ] **Step 3: buildInvoice**

In `lib/invoice/build-invoice.ts`:
- Add imports:

```ts
import { mrpFor, mrpTotals } from "@/lib/utils/discount";
import { ADMIN_OVERRIDE_DISCOUNT_CODE } from "@/lib/utils/admin-override";
```

- In `InvoiceOrderRow`, add after `discount_amount: number | null;`:

```ts
  discount_code?: string | null;
```

- Add before `InvoiceDocument`:

```ts
/**
 * MRP figures for the invoice: an MRP column, Total MRP and one Discount row
 * (MRP saving + the order's own discount). Null exactly when the order page
 * shows no MRP either. Display only: taxable value, GST and total never change.
 */
export interface InvoiceMrp {
  /** Unit MRP per invoice line, aligned with `lines`; null on the "Shipping charges" line. */
  unitMrpPaise: (number | null)[];
  /** Goods only; delivery stays its own line. */
  totalMrpPaise: number;
  /** Total MRP − Σ price × quantity. */
  mrpSavingPaise: number;
  /** The order's own discount (admin or coupon). */
  extraDiscountPaise: number;
  /** "special discount" for an admin discount, the code for a coupon; null with no extra discount. */
  extraDiscountLabel: string | null;
  /** MRP saving + extra discount. */
  discountPaise: number;
}
```

- In `InvoiceDocument`, add after `totals: InvoiceTotals;`:

```ts
  mrp: InvoiceMrp | null;
```

- Add above `export function buildInvoice`:

```ts
const paise = (rupees: number) => Math.round(rupees * 100);

function discountLabel(code: string | null | undefined): string {
  if (code === ADMIN_OVERRIDE_DISCOUNT_CODE) return "special discount";
  return code && code.trim() ? code : "discount";
}

function invoiceMrp(order: InvoiceOrderRow, lineCount: number, extraDiscountPaise: number): InvoiceMrp | null {
  const items = order.order_items.map((item) => ({ price: Number(item.price), quantity: item.quantity }));
  if (mrpTotals(items, order.created_at).mrpSavings <= 0) return null;
  const goodsPaise = items.reduce((sum, item) => sum + paise(item.price) * item.quantity, 0);
  const totalMrpPaise = items.reduce((sum, item) => sum + paise(mrpFor(item.price)) * item.quantity, 0);
  const mrpSavingPaise = totalMrpPaise - goodsPaise;
  return {
    unitMrpPaise: Array.from({ length: lineCount }, (_, idx) =>
      idx < items.length ? paise(mrpFor(items[idx].price)) : null
    ),
    totalMrpPaise,
    mrpSavingPaise,
    extraDiscountPaise,
    extraDiscountLabel: extraDiscountPaise > 0 ? discountLabel(order.discount_code) : null,
    discountPaise: mrpSavingPaise + extraDiscountPaise,
  };
}
```

- In the returned object, add after `totals: gst.totals,`:

```ts
    mrp: invoiceMrp(order, gst.lines.length, gst.totals.discountPaise),
```

- [ ] **Step 4: Web invoice page**

In `app/orders/[id]/invoice/page.tsx`:
- In the table header, after `<th className="py-2 px-2 font-medium text-right">Qty</th>` add:

```tsx
                {invoice.mrp && <th className="py-2 px-2 font-medium text-right">MRP</th>}
```

- In each row, after the Qty `<td>` add:

```tsx
                  {invoice.mrp && (
                    <td className="py-2 px-2 text-right text-gray-600">
                      {invoice.mrp.unitMrpPaise[idx] == null ? "" : rupees(invoice.mrp.unitMrpPaise[idx] as number)}
                    </td>
                  )}
```

- Replace the totals' `{invoice.totals.discountPaise > 0 && ( … )}` block with:

```tsx
            {invoice.mrp ? (
              <>
                <div className="flex justify-between"><span className="text-gray-500">Total MRP</span><span>{rupees(invoice.mrp.totalMrpPaise)}</span></div>
                <div className="flex justify-between text-gray-600"><span>Discount</span><span>−{rupees(invoice.mrp.discountPaise)}</span></div>
                <p className="text-right text-xs text-gray-400">
                  ({rupees(invoice.mrp.mrpSavingPaise)} off MRP
                  {invoice.mrp.extraDiscountPaise > 0
                    ? ` + ${rupees(invoice.mrp.extraDiscountPaise)} ${invoice.mrp.extraDiscountLabel}`
                    : ""})
                </p>
              </>
            ) : (
              invoice.totals.discountPaise > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Discount (included above)</span>
                  <span>−{rupees(invoice.totals.discountPaise)}</span>
                </div>
              )
            )}
```

- [ ] **Step 5: PDF**

In `lib/invoice/pdf.tsx`:
- Add to the `StyleSheet.create({ … })` object:

```ts
  cItemMrp: { width: "24%", paddingRight: 8 },
  cMrp: { width: "10%", textAlign: "right" },
  mrpNote: { fontSize: 7, color: "#9ca3af", textAlign: "right", paddingBottom: 2 },
```

- In the header row, change `<Text style={s.cItem}>Item</Text>` to `<Text style={doc.mrp ? s.cItemMrp : s.cItem}>Item</Text>` and after `<Text style={s.cQty}>Qty</Text>` add `{doc.mrp && <Text style={s.cMrp}>MRP</Text>}`.
- In each line row, change `<Text style={s.cItem}>{line.description}</Text>` to `<Text style={doc.mrp ? s.cItemMrp : s.cItem}>{line.description}</Text>` and after `<Text style={s.cQty}>{line.quantity}</Text>` add:

```tsx
              {doc.mrp && (
                <Text style={s.cMrp}>{doc.mrp.unitMrpPaise[idx] == null ? "" : rs(doc.mrp.unitMrpPaise[idx] as number)}</Text>
              )}
```

- Replace the totals' `{doc.totals.discountPaise > 0 && ( … )}` block with:

```tsx
          {doc.mrp ? (
            <>
              <View style={s.tline}>
                <Text style={s.muted}>Total MRP</Text>
                <Text>{rs(doc.mrp.totalMrpPaise)}</Text>
              </View>
              <View style={s.tline}>
                <Text style={s.muted}>Discount</Text>
                <Text>- {rs(doc.mrp.discountPaise)}</Text>
              </View>
              <Text style={s.mrpNote}>
                ({rs(doc.mrp.mrpSavingPaise)} off MRP
                {doc.mrp.extraDiscountPaise > 0 ? ` + ${rs(doc.mrp.extraDiscountPaise)} ${doc.mrp.extraDiscountLabel}` : ""})
              </Text>
            </>
          ) : (
            doc.totals.discountPaise > 0 && (
              <View style={s.tline}>
                <Text style={s.muted}>Discount (included in amounts)</Text>
                <Text>- {rs(doc.totals.discountPaise)}</Text>
              </View>
            )
          )}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run lib/invoice "app/orders/[id]/invoice/page.test.tsx" "app/bill" app/api/orders`
Expected: PASS (the `/bill` route and invoice API tests still pass with the new field).
Run: `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"` → `24`.

- [ ] **Step 7: Commit**

```bash
git add lib/invoice/build-invoice.ts lib/invoice/build-invoice.test.ts "app/orders/[id]/invoice/page.tsx" "app/orders/[id]/invoice/page.test.tsx" lib/invoice/pdf.tsx lib/invoice/pdf.test.ts
git commit -m "feat(invoice): MRP column, Total MRP and the full discount on every invoice"
```

---

### Task 7: CLAUDE.md and whole-branch checks

**Files:**
- Modify: `CLAUDE.md` (commands list line 58, MRP section lines 186-187, admin override section lines 190, 192, 194)

- [ ] **Step 1: CLAUDE.md**

- After line 58 (`npm run db:test-category-data …`) add:

```
npm run db:test-overrides                # admin price-override table + note backfill SQL tests (rolled back)
```

- In `### MRP display (display-only)`, replace the bullet that starts `- Orders whose prices an admin raised (\`discount_code = ADMIN_PRICE_UP\`)` with:

```markdown
- Orders whose prices an admin raised show their MRP like any other order (MRP = charged price ÷ 0.9), so nothing tells a customer the prices were raised.
```

  and replace the bullet that starts `- It never appears in cart/order totals` with:

```markdown
- It appears on the GST invoice (web and PDF) as an MRP column, Total MRP and one combined Discount (MRP saving + any admin or coupon discount; `InvoiceDocument.mrp` from `buildInvoice`). The taxable value, GST and total are unchanged. Owner's decision 2026-10-04; the MRP is computed, so the owner is confirming the presentation with their CA. It never appears in cart/order totals, `/api/orders`, JSON-LD, or the Meta Pixel `value`.
```

- In `### Admin price override (shadow mode)`:
  - In the first bullet, replace everything from ` With no reason, \`orders.notes\` still records` up to (not including) ` Spec:` with nothing, and change ` Spec: \`docs/superpowers/specs/2026-10-04-admin-percent-price-override-design.md\`.` to ` Specs: \`docs/superpowers/specs/2026-10-04-admin-percent-price-override-design.md\`, \`docs/superpowers/specs/2026-10-04-hide-admin-price-raise-design.md\`.`
  - Replace the bullet that starts `- Discounts are stored as before` with:

```markdown
- Discounts are stored as before (`discount_code = ADMIN_OVERRIDE`, rupee `discount_amount`) and stay visible to customers. An increase raises every `order_items.price` to the nearest rupee (worked in tenths of a percent so ties round up) and makes `subtotal` their sum (the paid-status `ITEMS_MISMATCH` check needs that); the order gets no discount code and ₹0 discount, so it looks like any other order.
```

  - Replace the bullet that starts `- \`isPriceRaised(order)\`` with:

```markdown
- **A customer must never see that prices were raised.** Who applied an override, how much and why live only in `order_price_overrides` (admin/internal tier, service role only; migration 20261004120000, `npm run db:test-overrides`). `POST /api/orders` writes it with the shadow-mode service-role client and rolls the order back if that write fails; `orders.notes` holds only the customer's note. `toCustomerOrder` also strips a leftover `[ADMIN OVERRIDE by …]` line and the retired `ADMIN_PRICE_UP` code (Redis-cached copies). Admins see one line (`formatPriceOverride`) on `/admin/orders` and `/admin/pickup-orders`; Telegram shows "📈 Prices raised +10% (+₹245)" (`lib/services/price-overrides.ts`, also used by the cash route and the ✅ webhook) and a discount line only above ₹0. Customer-facing code must never read that table or import that module.
```

- [ ] **Step 2: Whole-branch checks**

```bash
npm run test:unit                                             # all pass
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"               # 24
git diff --name-only --diff-filter=d origin/develop -- '*.ts' '*.tsx' | awk '{printf "--file\n%s\n", $0}' | xargs npx next lint
# only the two pre-existing findings (route.test.ts unused adminOrdersDelete; order.ts empty OrderCreate)
npm run build                                                 # exit 0
grep -rn "order_price_overrides\|price-overrides" app/orders app/checkout app/payment components hooks   # no output
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: admin price raises are admin-only; MRP on the invoice"
```

- [ ] **Step 4: Owner's rollout (not run by the implementer)**

List these in the report for the owner, in order:
1. `npm run db:test-overrides` (all PASS).
2. Apply: `psql "$POSTGRES_URL_NON_POOLING" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20261004120000_order_price_overrides.sql`.
3. Ship the branch (fast-forward `develop` and `main`).
4. After the deploy, run the same `psql … -f …20261004120000_order_price_overrides.sql` once more.
5. `npm run db:lint` and `npm run db:probe`.
