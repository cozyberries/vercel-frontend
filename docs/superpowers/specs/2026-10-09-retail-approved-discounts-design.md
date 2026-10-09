# Retail consignment: approved discounts — design

**Date:** 2026-10-09
**Status:** approved 2026-10-09; plan at docs/superpowers/plans/2026-10-09-retail-approved-discounts.md
**Branch:** `feature/retail-approved-discounts`
**Builds on:** `docs/superpowers/specs/2026-10-08-retail-consignment-design.md`

## Problem

The consignment agreement with Play O'Clock was revised on 2026-10-09
(`exports/retailer/CozyBerries - Play OClock Consignment Agreement.pdf`,
clauses 1.5, 3.1, 3.5–3.7, 5, 6.1, Annexure B):

- Cozyberries decides fixed discount rates ("Approved Discounts") and shares
  them with the shop in writing.
- A piece's **Selling Price** is its MRP less the Approved Discount it was sold
  at (the MRP itself when sold at full price).
- The shop's monthly invoice charges **75% of the Selling Price**, so an
  Approved Discount is borne 75 : 25 by the two parties.
- A discount the shop gives beyond the Approved Discount is the shop's own
  cost; the app never sees it (the shop reports at the approved rate).

The app prices every sale line at `share × MRP`
(`consignment_issue`: `unit_price_paise = round(mrp_paise × share_pct / 100)`),
and the monthly sheet has one "Sold this month" column. There is no way to
record a discounted sale.

## Decisions (owner, 2026-10-09)

1. **One sheet column per approved rate.** The shop splits each product's
   sales across "Sold at full MRP", "Sold at 10% off", … It cannot type a rate
   that was not approved.
2. **Rates are per shop, per month, and apply to every product** the shop
   holds. Restricting a rate to some products stays a matter for the
   agreement and the WhatsApp message, not the app.
3. **Rates are stored** in a small admin-tier table, and the database refuses
   a sale line at a rate not approved for its month.

## Out of scope

- Product-specific rates, app-wide rate lists, date ranges inside a month.
- Discounts on damaged, lost or six-month (Section 31(7)) stock: these are not
  sales in the app today and stay at full MRP under the agreement.
- Recording what the shop actually charged its customer.
- Changing already issued invoices (every existing line becomes rate 0).

## Data model (one migration)

### `retailer_discount_rates` — admin/internal tier

| column | type | notes |
|---|---|---|
| `retailer_id` | uuid not null fk → retailers on delete cascade | |
| `period` | text not null | `YYYY-MM` (CHECK, same regex as `consignment_docs.period`) |
| `rate_pct` | numeric(5,2) not null | `rate_pct > 0 and rate_pct < 100` |
| `created_by` | uuid | admin who added it |
| `created_at` | timestamptz not null default now() | |

Primary key `(retailer_id, period, rate_pct)`. RLS enabled and forced, no
grants, no policies (service role only), like the other retail tables.

### `consignment_lines.discount_pct`

`numeric(5,2) not null default 0`, CHECK `discount_pct >= 0 and
discount_pct < 100`. Existing rows become 0. A trigger-free invariant: only
sale lines may carry a non-zero rate; `consignment_save_challan` and
`consignment_save_return` never write it, and `consignment_issue` refuses a
non-sale doc with a non-zero line (defensive, `BAD_LINE`).

`LINE_COLUMNS` and `ConsignmentLine` gain `discount_pct: number`
(`toDoc` coerces it with `Number()` like `share_pct`).

## SQL functions

All `SECURITY INVOKER`, `set search_path = ''`, service role only, and all
take the existing per-shop advisory lock
(`hashtext('consignment:' || retailer_id)`).

- **`consignment_add_rate(p_retailer_id, p_period, p_rate_pct, p_actor)`**
  - `NOT_FOUND` (shop), `BAD_PERIOD` (same rule as `consignment_save_sale`:
    valid `YYYY-MM`, not after the current IST month), `BAD_RATE`
    (null, ≤ 0, ≥ 100, more than two decimals).
  - `ALREADY_ISSUED` when that month's sale is issued.
  - `TOO_MANY_RATES` when the month already has 4 rates (keeps the sheet
    readable).
  - Adding an existing rate is a no-op (`on conflict do nothing`).
- **`consignment_remove_rate(p_retailer_id, p_period, p_rate_pct)`**
  - `ALREADY_ISSUED` when that month's sale is issued.
  - `RATE_IN_USE` while the month's draft sale has a line at that rate.
  - Removing a rate that is not there is a no-op.
- **`consignment_save_sale`**: `p_lines` items become
  `{variant_slug, quantity, discount_pct}`; a missing `discount_pct` means 0.
  Before filling, any non-zero rate not in `retailer_discount_rates` for
  `(retailer, period)` raises `RATE_NOT_APPROVED:<rate>`.
- **`consignment_fill_from_batches`**: groups by `(variant_slug,
  discount_pct)`. The held check is per variant across all rates (the existing
  `NOT_HELD:<held>:<label>` with the variant total), then each
  `(variant, rate)` group draws on batches oldest first and inserts lines with
  its `discount_pct`. Return lines pass no rate and get 0.
- **`consignment_issue` (sale)**: re-checks every non-zero line rate against
  the month's rates (`RATE_NOT_APPROVED:<rate>`), then sets
  `unit_price_paise = round(mrp_paise × (100 − discount_pct) × share_pct / 10000)::integer`.
  The ₹2,500 check (`ABOVE_LOW_RATE`) runs on that price, unchanged.

Pricing example: MRP ₹923, 10% off, share 75% →
`round(92300 × 90 × 75 / 10000) = 62303` paise = ₹623.03.

`lib/retail/rpc-errors.ts` maps the new codes:
`RATE_NOT_APPROVED` → 409 "<rate>% isn't an approved discount for this month",
`RATE_IN_USE` → 409 "The draft has sales at <rate>% off. Change the draft first",
`TOO_MANY_RATES` → 409 "A month can have at most 4 discount rates",
`BAD_RATE` → 400 "Discount must be above 0% and below 100%".

## Pricing in TypeScript (`lib/retail/pricing.ts`)

- `unitPricePaise(mrpPaise, sharePct, discountPct = 0)` =
  `Math.round(mrpPaise × (100 − discountPct) × sharePct / 10000)`, mirroring
  the SQL (both round half away from zero for positive values).
- `PricedSaleLine` gains `discountPct`; `priceSaleLines` keys merged lines on
  product, size, MRP, rate and price, and falls back to the line's rate for
  drafts.
- `docTotalPaise` uses the line's rate in its draft fallback.
- `formatRate(pct)` → `"10"`, `"12.5"` (no trailing zeros); used by the sheet,
  panel and PDF.

## Sales sheet (template v2)

- `TEMPLATE_ID = "cozyberries-retail-sales-v2"`. A v1 file is refused as the
  wrong file ("Please use the sheet downloaded for …").
- Columns: `Code (do not edit)`, `Product`, `Size`, `MRP`, `You hold`,
  `Sold at full MRP`, then `Sold at <r>% off` for each approved rate in
  ascending order.
- The About sheet adds a `Discounts` row ("10%, 20%" or "None") and the
  how-to-fill text explains the columns.
- `buildSalesSheet` and `parseSalesSheet` take `rates: number[]`.
  Upload compares the heading row with the columns built from the month's
  rates **as they are now**; a mismatch gives
  "The discount rates for <month> changed after this sheet was downloaded.
  Download it again."
- Each sold cell is parsed as today (blank, or a whole number ≥ 0). The
  "sold more than held" check uses the row's total across all rate columns
  (summed across duplicate rows of the same code, as today).
- Output lines: `{variant_slug, quantity, discount_pct}`, one per non-zero
  `(variant, rate)`.

## API

- `POST /api/admin/retail/[id]/rates` `{ period, rate_pct }` → 201;
  `DELETE /api/admin/retail/[id]/rates?period=YYYY-MM&rate=10` → 200.
  Both `requireAdmin()` first, `isUuid`, zod-validated, errors through
  `retailRpcError`.
- `GET /api/admin/retail/[id]` (`loadRetailerDetail`) adds
  `discountRates: { period: string; rate_pct: number }[]` for the shop.
- `GET|POST /api/admin/retail/[id]/sheet` read the month's rates and pass them
  to the builder and parser.
- `POST /api/admin/retail/[id]/docs` (manual sale entry) accepts
  `discount_pct` on each line (zod: optional, `≥ 0 and < 100`, default 0).

## Admin UI (`components/admin/retail/SalesPanel.tsx`)

- Above "Download sheet", a **Discounts for <month>** row: one chip per rate
  ("10% off ×"), a small % input with **Add**. Hidden (read-only list) once the
  month's invoice is issued. Errors show in the existing alert.
- The manual-entry form gets one quantity input per column (full MRP plus each
  rate) for every product.
- The draft preview line reads
  "Product (Size) × 2 · MRP ₹923.00 · 10% off · ₹623.03 each"
  (the "off" part is omitted at rate 0).

## Invoice PDF and register

- `buildRetailInvoice` lines carry `discountPct`. The PDF line table gains a
  narrow **Disc.** column ("10%" or "—") between MRP and Rate.
- The footer text "Supply on sale-or-return basis at 75% of MRP" becomes
  "Supply on sale-or-return basis at 75% of the selling price (MRP less any
  approved discount)".
- The GST sales register, amount owed and holdings read `unit_price_paise` of
  issued lines and need no logic change.

## Testing

- **Vitest**
  - `pricing`: `unitPricePaise(92300, 75, 10) === 62303`; rate 0 unchanged;
    lines at different rates stay separate when merged.
  - `sheet`: columns per rates; v1 file refused; headings mismatch message;
    held check across columns; output lines per rate; bad cell in a rate
    column reports the right row.
  - `rpc-errors`: the four new codes.
  - Routes: rates POST/DELETE (admin gate, validation, RPC errors), sheet
    GET/POST pass rates, docs POST passes `discount_pct`.
  - `SalesPanel`: add/remove chip calls, per-rate manual inputs, preview text.
  - `documents`/`pdf`: Disc. column and footer text.
- **`npm run db:test-retail`** (rolled back): add/remove rate rules
  (`BAD_RATE`, `TOO_MANY_RATES`, `ALREADY_ISSUED`, `RATE_IN_USE`); save with
  an unapproved rate → `RATE_NOT_APPROVED`; FIFO across two rates of one
  variant with the held total enforced; issue price 62303 for the example;
  `ABOVE_LOW_RATE` judged on the discounted price; existing lines default 0.
- `npm run db:lint` and `npm run db:probe` (probe asserts `anon` and
  `authenticated` hold nothing on `retailer_discount_rates`).

## Files

- `supabase/migrations/20261009120000_retail_discount_rates.sql`
- `scripts/sql/test-retail.sql`, `scripts/sql/security-probe.sql`
- `lib/retail/` — `types`, `queries`, `pricing`, `sheet`, `documents`, `pdf`,
  `rpc-errors`, `requests`, `api-types`
- `app/api/admin/retail/[id]/rates/route.ts` (new), `[id]/sheet`, `[id]/docs`
- `components/admin/retail/SalesPanel.tsx`
- `CLAUDE.md` (Retail consignment section), the 2026-10-08 retail spec
  (pointer to this one)
