# Hide admin price raises from customers — design

**Date:** 2026-10-04
**Status:** approved 2026-10-04; plan at `docs/superpowers/plans/2026-10-04-hide-admin-price-raise.md`
**Branch:** `feature/hide-price-raise` (worktree `../vercel-frontend-worktrees/hide-price-raise`)
**Builds on:** `2026-10-04-admin-percent-price-override-design.md` (shipped a91d009, reason made optional 86913b9)

## Problem

Staff can raise every unit price of an order by a percentage in shadow-mode
checkout. Today a customer can find out:

1. `orders.notes` holds `[ADMIN OVERRIDE by <admin email>]: (+10% prices) <reason>`.
2. `orders.discount_code = 'ADMIN_PRICE_UP'` marks the order.
3. `/orders/[id]` hides the MRP rows for a raised order, a visible difference.

Both columns reach the customer two ways: our customer order APIs return
them, and the `authenticated` role can `SELECT` every column of its own
`orders` rows directly (policy `user_id = (select auth.uid())`, checked on the
live database 2026-10-04). Hiding them in the API alone is not enough.

The same note puts the admin's email in front of customers for admin
discounts, which contradicts `toCustomerOrder` ("customers must never see
admin ids").

Live data on 2026-10-04: 4 orders carry an override note, all placed on
behalf by staff, none with a customer note.

| Order | Code | Note (email masked) |
|---|---|---|
| ORD-20260927-081818-00268 | `ADMIN_OVERRIDE` ₹130 | `[ADMIN OVERRIDE by <email>]: Offline discount` |
| ORD-20260927-140752-00304 | `ADMIN_OVERRIDE` ₹100 | `[ADMIN OVERRIDE by <email>]: offline discount` |
| ORD-20261004-075527-00331 | `ADMIN_PRICE_UP` ₹0 | `[ADMIN OVERRIDE by <email>]: (+50% prices) stall pickup` |
| ORD-20261004-082217-00332 | `ADMIN_OVERRIDE` ₹153 | `[ADMIN OVERRIDE by <email>]: (−5% discount)` |

## Goal

A customer can never tell that an order's prices were raised, from any page,
bill, API response or direct database read. The raise is recorded in an
admin-only table and shown only to admins (admin order pages, Telegram).
Discounts stay visible to customers. Every invoice shows the MRP and the
full discount, so a raised order reads like any other.

## Decisions (approved 2026-10-04)

| Decision | Choice |
|---|---|
| What is hidden | Only the raise. The customer still sees and pays the raised prices (the GST invoice must show the real price); nothing says they were raised. |
| Where the raise is recorded | New admin/internal-tier table `order_price_overrides` (approach A). Rejected B: revoking column access on `orders` breaks every customer route that selects `*`, and `discount_code` must stay readable for discounts. |
| Discounts | Stay visible to customers (discount line on the order page and invoice, code `ADMIN_OVERRIDE`). Their audit details (admin, reason) move to the admin table too, so no admin email reaches customers. |
| Where admins see it | `/admin/orders` detail dialog and `/admin/pickup-orders` rows, plus Telegram. |
| MRP on a raised order | Same rule as every order: MRP = charged price ÷ 0.9. The earlier "no MRP on raised orders" rule is removed. |
| Invoice | Every invoice (web and PDF bill) shows the unit MRP per line, Total MRP and one combined Discount (MRP saving + any admin or coupon discount). Taxable value, GST and total are unchanged. Overrides the CLAUDE.md rule "MRP never on the GST invoice" (owner's decision; MRP is computed, so the owner will confirm with their CA). |
| Rollout | Owner applies the migration first, then the code deploys; the backfill is idempotent and re-run after the deploy. |

## Section 1 — Data and migration

### Table `public.order_price_overrides`

Migration `supabase/migrations/20261004120000_order_price_overrides.sql`.

| Column | Type | Meaning |
|---|---|---|
| `order_id` | `uuid primary key references public.orders(id) on delete cascade` | the order |
| `mode` | `text not null check (mode in ('amount','percent_off','percent_up'))` | |
| `percent` | `numeric(4,1)`, null in `amount` mode | e.g. 10.0 |
| `amount` | `numeric(10,2)` | ₹ taken off (discount modes) or ₹ added (raise); null only for a backfilled raise |
| `catalogue_subtotal` | `numeric(10,2)` | goods total before the override; null only for a backfilled raise |
| `reason` | `text`, null when none | at most 500 characters (check) |
| `admin_id` | `uuid` | `orders.placed_by_admin_id` / the acting admin |
| `admin_email` | `text` | |
| `created_at` | `timestamptz not null default now()` | |

Checks: `percent` is null exactly when `mode = 'amount'`; `amount >= 0`;
`char_length(reason) <= 500`.

Tier: **admin/internal** — `enable` and `force row level security`, no
policies, `revoke all … from public, anon, authenticated`, and
`grant select, insert, delete … to service_role` (same pattern as
`shelf_refills`, migration 20260927000000).

### What `orders` holds afterwards

| Mode | `discount_code` | `discount_amount` | `order_items.price` | `notes` |
|---|---|---|---|---|
| ₹ discount | `ADMIN_OVERRIDE` | rupees | catalogue | customer note only |
| % discount | `ADMIN_OVERRIDE` | rounded rupees | catalogue | customer note only |
| % increase | null | 0 | raised | customer note only |

### Backfill (in the same migration, idempotent)

For every order whose `notes` starts with `[ADMIN OVERRIDE by `:

- Parse the first line: `[ADMIN OVERRIDE by <email>]` then optionally
  `: ` + optionally `(−<p>% discount)` or `(+<p>% prices)` + optionally a
  space and the reason.
- Insert an `order_price_overrides` row (`on conflict (order_id) do nothing`):
  - `(+p% prices)` → `percent_up`, `percent = p`, `amount` and
    `catalogue_subtotal` null (the catalogue total cannot be recovered exactly
    from rounded raised prices), `reason` = rest or null.
  - `(−p% discount)` → `percent_off`, `percent = p`,
    `amount = discount_amount`, `catalogue_subtotal = subtotal`.
  - otherwise → `amount`, `amount = discount_amount`,
    `catalogue_subtotal = subtotal`, `reason` = rest or null.
  - `admin_email` from the bracket, `admin_id = placed_by_admin_id`.
- Remove that first line from `notes` (null when nothing remains).
- Set `discount_code = null` where it is `ADMIN_PRICE_UP`.
- Keep `updated_at` as it was: both triggers that stamp it with `now()` on
  UPDATE — `trigger_orders_updated_at` and `trigger_set_order_number` — are
  disabled around these updates and re-enabled in the same transaction.
  *Correction 2026-10-05: the first apply disabled only the first trigger, so
  the 7 orders it moved got `updated_at` = the apply time. No visible effect:
  "Collected today" goes by each order's `collected` status event, which all 6
  collected ones have.*

Re-running finds nothing left to move. The migration has no `begin/commit`,
so the SQL test can load it inside a rolled-back transaction (house style).

### SQL test

`scripts/sql/test-order-price-overrides.sql` + `scripts/db-test-overrides.mjs`
+ `npm run db:test-overrides`, rolled back like `db:test-refills`. Asserts: the
table exists with RLS forced; `anon` and `authenticated` hold no privilege on
it; the backfill turns fixture orders in each of the four note shapes into the
right rows, strips the notes (keeping a following customer note line), clears
`ADMIN_PRICE_UP`; a second run changes nothing.
`scripts/sql/security-probe.sql` (`npm run db:probe`) gains an assertion that
`authenticated` cannot read `order_price_overrides`.

### Rollout

1. Owner runs `npm run db:test-overrides`, then applies the migration.
2. Code deploys.
3. Owner re-runs the migration once (idempotent) to move any override placed
   by the old code between steps 1 and 2.
4. `npm run db:lint` and `npm run db:probe`.

## Section 2 — Writing the record; what customers and admins see

### Shared module (`lib/utils/admin-override.ts`)

- `priceAdminOverride` returns `discountCode: null` for `percent_up`
  (`ADMIN_OVERRIDE` for the discount modes, as today). `ADMIN_PRICE_UP_CODE`
  and `isPriceRaised` are removed.
- `applyAdminOverride` no longer builds a note. Its success result carries
  `audit: { mode, percent, amount, catalogueSubtotal, reason }`, where
  `amount` is the ₹ discount, or Σ raised − Σ catalogue for a raise;
  `catalogueSubtotal` is the catalogue Σ price × quantity; `reason` is the
  trimmed, CR/LF-collapsed reason or null. Validation (percent range, GST
  ceiling, reason ≤ 500) is unchanged.

### `POST /api/orders` (shadow mode)

- `orders.notes` = the customer's own note only; `discount_code` from the
  pricing (null for a raise).
- After the order and its items are inserted, insert the
  `order_price_overrides` row with the shadow-mode `client` (the service-role
  client `getEffectiveUser` returns while an admin is acting), with
  `admin_id = actingAdminId`, `admin_email = sessionUser.email`.
- If that insert fails: delete the order through `createAdminSupabaseClient()`
  (the existing compensating delete; cascade removes items) and return 500
  `{ error: "Failed to save order" }`. An order never exists with a raise
  admins cannot see.
- Telegram gets `priceRaise: { percent, amount }` for a raise (below).

### Customers

- `/orders/[id]` and `/orders` use the normal MRP rule for every order:
  `MrpSummaryRows` always renders, `/orders` cards use `mrpTotals`.
  `orderMrpSavings` is removed.
- Customer APIs never read `order_price_overrides`.
- `toCustomerOrder` (`lib/utils/order-mapper.ts`) also drops a leading
  `[ADMIN OVERRIDE by …]` line from `notes` (null when nothing remains) and
  returns `discount_code: null` when it is `ADMIN_PRICE_UP`. New orders never
  carry either, but `GET /api/orders/[id]` serves Redis-cached copies
  (`CacheService.getOrderDetails`) that may predate the migration; this keeps
  them clean too.

### Admins

- `GET /api/admin/orders` and `GET /api/admin/pickup-orders` (both behind
  `requireAdmin()`, service-role client) load the override rows for the
  orders on the page with one `.in("order_id", ids)` query and attach
  `price_override` (or null) to each order.
- One line on the `/admin/orders` detail dialog and on each
  `/admin/pickup-orders` row (`formatPriceOverride` in
  `lib/utils/admin-override.ts`):
  - `Prices raised +10% (+₹245) by asha@… · Event price`
  - `Prices raised +50%` (backfilled raise: no ₹ figure)
  - `Admin discount −10% (₹245) by asha@…`
  - `Admin discount ₹250 by asha@… · Offline discount`
  - " by …" is omitted when the email is null; " · reason" when the reason is null.

### Telegram (owner chat only)

- `NewOrderData` gains `priceRaise?: { percent: number; amount: number | null } | null`.
  `adjustmentLine` prints `📈 Prices raised +10% (+₹245)` (or
  `📈 Prices raised +50%` when `amount` is null) from it, instead of checking
  for `ADMIN_PRICE_UP`. The 🏷️ discount line stays as today (only above ₹0).
- `POST /api/orders` passes it from the override result.
- `POST /api/payments/cash` and the ✅ `/api/telegram/webhook` rebuild the
  message from the database: they read `order_price_overrides` for the order
  (both already hold a service-role client there: cash returns 403 unless an
  admin is acting, so its `client` is the service-role one; the webhook builds
  its client with `SUPABASE_SERVICE_ROLE_KEY`) and pass `priceRaise` when
  the row's mode is `percent_up`. A failed lookup is logged and the message
  goes out without the 📈 line; it never blocks the payment.

## Section 3 — Invoice with MRP and the full discount

Applies to the web invoice (`/orders/[id]/invoice`) and the PDF bill
(`/bill/<orderId>/<sig>`), both built by `buildInvoice` (`lib/invoice/build-invoice.ts`).

- `InvoiceOrderRow` gains `discount_code`. `InvoiceDocument` gains
  `mrp: { unitMrpPaise: (number | null)[] (aligned with `lines`; null for the
  "Shipping charges" line that `computeGst` appends), totalMrpPaise,
  mrpSavingPaise, extraDiscountPaise, extraDiscountLabel: string | null,
  discountPaise } | null`. Total MRP covers goods only; delivery stays its own
  line.
- `mrp` is null exactly when the order page shows no MRP:
  `mrpTotals(order.order_items, order.created_at).mrpSavings <= 0` (placed
  before `MRP_DISPLAY.shownSince`, or the rate is 0). Then the invoice is
  unchanged.
- Otherwise:
  - unit MRP per line = `mrpFor(price)`; Total MRP = Σ unit MRP × quantity;
  - MRP saving = Total MRP − Σ price × quantity;
  - extra discount = `discount_amount`, labelled `special discount` for
    `ADMIN_OVERRIDE`, the code itself for any other code (e.g. `EARLY5`),
    `discount` when the code is null;
  - combined Discount = MRP saving + extra discount.
- Rendering (web and PDF): an `MRP` column in the item table (blank on the
  "Shipping charges" line); totals start
  with `Total MRP` and `Discount −₹X` with a muted sub-line
  `(₹A off MRP + ₹B <label>)` (just `(₹A off MRP)` with no extra discount).
  This replaces the `Discount (included above / in amounts)` row. Taxable
  value, CGST/SGST/IGST, delivery and total are computed exactly as today.
- Example (₹1,000 frock, 10% admin discount, pickup): Total MRP ₹1,111;
  Discount −₹211 (₹111 off MRP + ₹100 special discount); taxable ₹857.14;
  CGST ₹21.43; SGST ₹21.43; total ₹900. Raised ₹899 → ₹989: MRP ₹1,099,
  Discount −₹110 (₹110 off MRP), total ₹989.

## Errors

- Override record insert fails → order rolled back, 500, nothing left behind.
- Telegram override lookup fails → logged, message without 📈.
- Admin API override lookup fails → logged, orders returned with
  `price_override: null` (the page still works).

## Testing (Vitest; Playwright skipped by the owner's preference)

- `admin-override.test.ts`: `percent_up` → `discountCode` null; `audit` per
  mode (amount, percent, catalogue subtotal, reason or null); no `notes`;
  `formatPriceOverride` for each line shape.
- `app/api/orders/route.test.ts`: raise → order row with `discount_code`
  null, `discount_amount` 0, notes = customer note only (or none); the
  override row inserted with the expected fields; override insert failure →
  compensating delete + 500; discount → `ADMIN_OVERRIDE` kept, audit row
  written, no override text in notes; the response body contains no
  `ADMIN OVERRIDE` / `ADMIN_PRICE_UP` text; Telegram gets `priceRaise`.
- `/orders/[id]` and `discount.test.ts`: a raised order renders MRP rows
  like any other; `orderMrpSavings` tests removed.
- `telegram.test.ts`: 📈 line from `priceRaise` (with and without amount);
  `ADMIN_PRICE_UP` no longer special.
- Cash route and Telegram webhook tests: the override lookup feeds
  `priceRaise`; a lookup error still sends the message.
- Admin orders / pickup-orders API and UI tests: `price_override` attached and
  the line rendered.
- `build-invoice.test.ts`: `mrp` block for a current order (admin discount,
  coupon, none); null before launch and at rate 0; raised order; taxable and
  taxes equal to the old computation. Web invoice page, PDF and `/bill` route
  render tests.
- SQL: `npm run db:test-overrides` (above).

## Out of scope

- Changing what the customer pays or the raised prices themselves.
- Showing overrides anywhere else in admin (dashboard, on-behalf-orders).
- Relabelling `ADMIN_OVERRIDE` on the customer's order page (the order page
  keeps `Discount (ADMIN_OVERRIDE)`; only the invoice says "special discount").
- MRP on the checkout, cart or order totals beyond today's display rows.

## Files

| File | Change |
|---|---|
| `supabase/migrations/20261004120000_order_price_overrides.sql` | New table + backfill. |
| `scripts/sql/test-order-price-overrides.sql`, `scripts/db-test-overrides.mjs`, `package.json` | SQL test + `db:test-overrides`. |
| `scripts/sql/security-probe.sql` | Probe: `authenticated` cannot read the table. |
| `lib/utils/admin-override.ts` / test | `discountCode` null for raises, `audit`, `formatPriceOverride`; remove `ADMIN_PRICE_UP_CODE`, `isPriceRaised`. |
| `lib/types/order.ts` | `PriceOverrideRecord` type. |
| `app/api/orders/route.ts` / test | Customer-only notes; write the override row; rollback on failure. |
| `lib/utils/order-mapper.ts` / test | `toCustomerOrder` strips a leftover override line and `ADMIN_PRICE_UP`. |
| `app/orders/[id]/page.tsx` / test, `app/orders/page.tsx`, `lib/utils/discount.ts` / test | Back to the normal MRP rule; remove `orderMrpSavings`. |
| `lib/services/telegram.ts` / test | `priceRaise` instead of the code check. |
| `app/api/payments/cash/route.ts`, `app/api/telegram/webhook/route.ts` / tests | Look up the override row for the message. |
| `app/api/admin/orders/route.ts`, `app/api/admin/pickup-orders/route.ts` / tests | Attach `price_override`. |
| `app/admin/orders/api.ts`, `order-detail-dialog.tsx`, `lib/orders/pickup.ts`, `pickup-orders-client.tsx` / tests | Types + the admin line. |
| `lib/invoice/build-invoice.ts`, `app/orders/[id]/invoice/page.tsx`, `lib/invoice/pdf.tsx` / tests | MRP column, Total MRP, combined Discount. |
| `CLAUDE.md` | Admin override section; MRP rule now includes the invoice; `db:test-overrides`; new table's tier. |
