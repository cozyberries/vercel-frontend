# Retail consignment (sale-or-return to shops) — design

**Date:** 2026-10-08
**Status:** approved 2026-10-08; plan at `docs/superpowers/plans/2026-10-08-retail-consignment.md`
**Branch:** `feature/retail-consignment`

## Problem

Cozyberries is going to place part of its stock in other retail shops. The
shop keeps the goods on its shelf, sells them at the printed MRP, and keeps
25% of MRP. Every month end it reports what sold and pays Cozyberries the
other 75%. Unsold stock comes back.

Nothing in the app can record this. Stock has one number per variant
(`product_variants.stock_quantity`), invoices are built only from customer
orders (`CB/yy-yy/NNNN`, B2C), and the GST sales register knows only B2CS,
B2CL and HSN for B2C.

## Commercial and GST model (owner decisions, 2026-10-08)

To be confirmed with the CA before the first shop is signed; the design
does not depend on anything the CA is likely to change except where noted.

- **Sale-or-return, not agency.** Goods go to the shop under a delivery
  challan; ownership stays with Cozyberries until the shop sells. There is no
  commission invoice from the shop. (The agency model would make the shop
  invoice 25% commission + 18% GST and register compulsorily; rejected.)
- **Cozyberries raises the invoice.** Once a month, one tax invoice to the
  shop for the units it sold that month. The shop bills its own customers.
- **Every shop is GST-registered.** Invoices are B2B (GSTR-1 table 4A) and
  carry the shop's GSTIN. The shop claims the GST as input credit.
- **75% of MRP includes GST.** On a ₹1,000 MRP piece the invoice is ₹750.00
  (₹714.29 taxable + ₹35.71 GST at 5%). The shop pays ₹750.
- **MRP is locked at dispatch** (the price on the tag), not the catalogue
  price on the day of sale.
- **Section 31(7):** goods sent on sale-or-return must be invoiced when sold
  or six months after removal, whichever is earlier. Batches are therefore
  dated and aged.
- **Separate number series:** challans `CBC/yy-yy/NNNN`, shop invoices
  `CBR/yy-yy/NNNN`. GST allows multiple series; both appear in GSTR-1
  "Documents issued". `CB/…` is untouched.

## Goal

An admin can, from a phone:

1. Add a shop (GSTIN, address, contact, email, share %).
2. Send stock to it on a challan, which takes the units out of the online
   stock, and download the challan PDF.
3. At month end, download a pre-filled sales sheet (`.xlsx`) for that shop,
   send it to the shop, upload it back once filled, check it, and issue the
   invoice for Cozyberries' share. Download the invoice PDF and email it.
4. Take unsold stock back, which returns it to online stock.
5. Record payments and see what each shop owes and holds.
6. Get the shop invoices in the monthly GST sales register and its `.xlsx`.

## Non-goals

- Shop logins or a shop portal. Admins enter everything.
- Shop-specific sheet formats or fuzzy name matching. Only our template.
- Credit notes, e-way bills, sending email from the app.
- Shop sales in the sales dashboard (`/admin`) or its Stall vs Online split.
- Automatic invoicing at the six-month mark (the app warns; the admin acts).

## Data model

All tables are **admin/internal tier**: RLS enabled and forced, no grants, no
policies, `service_role` only. Every write goes through `SECURITY DEFINER`
functions with `SET search_path = ''`, `REVOKE ALL … FROM anon,
authenticated`, called by `/api/admin/retail/*` after `requireAdmin()`.

### `retailers`

| column | notes |
|---|---|
| `id` uuid pk | |
| `legal_name` text not null | as on the GST certificate |
| `trade_name` text | |
| `gstin` text not null unique | format + checksum checked in TS and a CHECK on format |
| `state_code` text not null | generated from `left(gstin, 2)` |
| `address` text not null | |
| `contact_name`, `phone`, `email` text | `email` shown beside the PDF buttons |
| `our_share_pct` numeric(5,2) not null default 75 | 0 < x < 100 |
| `active` boolean not null default true | inactive: no new challans |
| `created_at`, `updated_at` timestamptz | |

### `consignment_docs`

One row per document.

| column | notes |
|---|---|
| `id` uuid pk | |
| `retailer_id` uuid fk → retailers, on delete restrict | |
| `kind` text | `challan` \| `sale` \| `return` |
| `status` text | `draft` \| `issued` \| `cancelled` |
| `number` text unique | null until issued; `CBC/…` (challan), `CBR/…` (sale); returns use `RET/…` internally |
| `doc_date` date not null | challan/return: the date sent/received; sale: last day of `period` |
| `period` text | `YYYY-MM`, sales only (CHECK) |
| `share_pct` numeric(5,2) | sales only, copied from the retailer at issue |
| `issued_at`, `cancelled_at` timestamptz, `created_by` uuid | |

Partial unique index: one `sale` per `(retailer_id, period)` where
`status <> 'cancelled'`.

### `consignment_lines`

| column | notes |
|---|---|
| `id` uuid pk | |
| `doc_id` uuid fk → consignment_docs, on delete cascade | |
| `variant_id` fk → product_variants, on delete restrict | |
| `product_name`, `size` text not null | copied at creation |
| `quantity` integer > 0 | |
| `mrp_paise` integer > 0 | challan lines: the tag MRP. Sale/return lines: copied from their batch |
| `batch_line_id` uuid fk → consignment_lines | null on challan lines; required on sale and return lines, and must belong to an issued challan of the same retailer |
| `unit_price_paise` integer | sale lines only: `round(mrp_paise × share_pct / 100)` |

**A batch** is an issued challan line. **Held** for a batch =
`quantity − Σ issued sale lines − Σ issued return lines` pointing at it. It is
always computed, never stored. A view `retailer_batch_balances` (service role
only) exposes `batch_line_id, retailer_id, variant_id, mrp_paise, sent_on,
held`.

### `retailer_payments`

`id`, `retailer_id`, `doc_id` (optional, an issued sale), `amount_paise > 0`,
`paid_on` date, `method` (`upi` \| `bank` \| `cash`), `reference`,
`created_by`, `created_at`. **Owed** = Σ issued sale totals − Σ payments.

### `consignment_counters`

`(series text, financial_year text)` primary key, `last_seq`. Same
gap-free pattern as `invoice_counters`, which stays as is.

### Functions (service role only)

All take a per-retailer advisory lock and run in one transaction.

- `consignment_issue(doc_id)`
  - **challan:** refuses if the retailer is inactive or any variant's
    `stock_quantity` < quantity; decrements stock; assigns `CBC/…`.
  - **sale:** re-checks every line against the batch balance (refuses with
    the offending line); copies `share_pct`; computes `unit_price_paise`;
    assigns `CBR/…`.
  - **return:** re-checks balances; increments stock; assigns `RET/…`.
- `consignment_cancel(doc_id)`
  - draft: deletes it.
  - issued challan: only while no issued sale or return draws on its lines;
    adds the stock back.
  - issued return: only while our `stock_quantity` still covers it; takes
    the stock out again.
  - issued sale: only until the 10th of the month after `period` (IST),
    i.e. before GSTR-1 is due on the 11th; keeps the number, sets
    `cancelled`.
- `consignment_allocate(retailer_id, variant_id, quantity)` returns the
  batch split, **oldest batch first** (`sent_on`, then line id). Used by
  the draft builders so a sale or return of "variant × qty" becomes lines
  per batch.

Stock changes on `product_variants` fire the existing catalog trigger, so
online stock updates in about 10 s.

## Sales sheet (upload and download)

- `GET /api/admin/retail/[id]/sheet?month=YYYY-MM` returns an `.xlsx`
  (`write-excel-file`): one row per variant the shop holds, columns
  **Code** (variant slug), **Product**, **Size**, **MRP**, **You hold**,
  **Sold this month** (blank). A hidden `meta` sheet carries the retailer id,
  month and a version. Filename `Cozyberries-<trade name>-<YYYY-MM>.xlsx`.
- `POST /api/admin/retail/[id]/sheet` (multipart, ≤ 1 MB) reads it with
  `read-excel-file` (already a dependency) through a pure parser
  `parseSalesSheet(rows, expected)`:
  - rejects a file whose `meta` is missing, or names another shop or month,
    or whose header row differs: "Please use the sheet downloaded for
    <shop>, <month>".
  - sums **Sold** per code (several rows per code are allowed).
  - row errors: unknown code, a quantity that is text, fractional or negative, MRP changed, sold > held.
  - all-blank sold column = a "nothing sold" month.
- If valid, it replaces the period's draft sale (or creates one) with lines
  from `consignment_allocate`. If that period already has an issued sale,
  the upload is refused. The file is not stored.

## Screens

The Retail entry goes in the admin shell's top tab bar only; the phone bottom
bar (`grid-cols-5`) is unchanged. Built from `components/admin/kit/*`.

### `/admin/retail`

A card per shop: units held, MRP value held, owed, last period reported,
oldest batch age (amber ≥ 5 months, red ≥ 6). A banner lists shops with no
issued sale for last month. "Add shop" opens a form (state code is shown from
the GSTIN).

### `/admin/retail/[id]`

Header: legal name, GSTIN, share %, owed, email. Actions:

- **Send stock:** pick product + size, quantity (own stock shown), MRP
  pre-filled from the variant price and editable. Draft → **Issue challan**.
- **Monthly sales:** choose month → **Download sheet** / **Upload sheet**.
  The draft shows each line's batch, MRP, unit price, and totals (MRP value,
  our share, taxable, CGST+SGST or IGST). Quantities are editable by hand.
  Row errors from an upload are listed above it. **Issue invoice**.
- **Take back:** list of held sizes with a "returning" stepper. Draft →
  **Issue return**.
- **Record payment:** amount, date, method, reference, optional invoice.

Tabs (`SegmentedTabs`): **Stock** (each held size, expandable to batches with
MRP, sent date and age), **Documents**, **Payments**.

Each issued challan and invoice has **Download PDF** and **Share** (Web Share
API with the PDF file attached; falls back to download).

## PDFs

`@react-pdf/renderer`, alongside `lib/invoice/pdf.tsx`.

- **Delivery challan:** "Delivery challan — supply on sale-or-return basis",
  number, date, consignee (shop legal name, GSTIN, address), lines (HSN 6111,
  product, size, quantity, MRP, value at MRP), total quantity and MRP value,
  "Not a tax invoice".
- **Tax invoice (B2B):** seller block as today; buyer legal name, GSTIN,
  address, place of supply = shop state; lines (HSN 6111, product, size, qty,
  MRP, rate = unit price, amount); taxable value and tax split from
  `computeGst` with `taxModeFor(home 29, shop state)`; amount in words; note
  "Supply on sale-or-return basis against challans CBC/…, CBC/…". No MRP
  discount row.

`GET /api/admin/retail/docs/[docId]/pdf`: `requireAdmin()`, `private,
no-store`, `noindex`.

A pure `buildRetailInvoice()` in `lib/retail/` produces an
`InvoiceDocument`-compatible shape where possible so the totals logic is
shared, not copied.

## GST sales register

`/admin/sales-register` and its `.xlsx` include issued and cancelled shop
invoices dated in the month (IST):

- **B2B** sheet (new): recipient GSTIN, receiver name, invoice number, date,
  invoice value, place of supply, reverse charge `N`, invoice type `Regular`,
  rate 5, taxable value, IGST/CGST/SGST. Cancelled invoices are listed with
  zero amounts, like B2C.
- **HSN summary**: split into B2B and B2C rows (GSTR-1 table 12).
- **Documents issued**: rows for `CBR/…` (invoices) and `CBC/…` (delivery
  challans) with from, to, total, cancelled, net.
- **Summary**: store sales (B2C), shop sales (B2B), combined.
- Preview page: a "Shops (B2B)" block below B2CS.

A pure `retail-register` module adds these; `sales-register` stays the
single assembler.

## Edge cases

- **Upload twice:** replaces the draft; refused after the invoice is issued.
- **Stale draft:** `consignment_issue` re-checks inside the lock and names
  the line that no longer fits.
- **Six-month rule:** batches flagged at ≥ 5 months (amber) and ≥ 6 (red,
  counted on the shops list). The admin returns or invoices them.
- **Product changes:** names, sizes and MRP are copied on lines; variants with
  consignment lines cannot be deleted.
- **Inactive shop:** no new challans; sales, returns and payments still work.
- **Series:** `CBC`, `CBR` and `RET` restart each financial year.
- **Rounding:** unit price rounded to the paisa once; GST worked out of the
  line totals once, as in `computeGst`.
- **Cancelling a shop invoice after the 10th of the next month:** refused;
  the screen says a credit note is needed and to ask the CA.

## Testing

- **vitest (pure):** batch allocation (oldest first, spill across batches,
  shortfall); `parseSalesSheet` (each rejection and row error, summed
  duplicate codes, nothing-sold); unit price and GST intra/inter-state;
  GSTIN format + checksum; aging bands; B2B register rows, HSN B2B/B2C split,
  documents-issued rows; challan/invoice PDF builders.
- **vitest (routes/pages):** every `/api/admin/retail/*` route returns 401/403
  without an admin; upload replaces a draft and is refused after issue; PDF
  headers `private, no-store`; page guard; sheet download filename.
- **SQL (`npm run db:test-retail`, rolled back):** challan issue decrements
  stock and refuses a shortfall; sale cannot overdraw a batch; return
  increments stock; cancel rules; gap-free numbering with FY rollover; one
  open sale per shop and month; `anon` and `authenticated` hold no privilege
  on any new table or function.
- **Gates:** `npm run db:lint`, `npm run db:probe` before merging the
  migration.

## Files (expected)

- `supabase/migrations/2026100812xxxx_retail_consignment.sql`,
  `scripts/sql/test-retail.sql`, `package.json` (`db:test-retail`)
- `lib/retail/` — `gstin`, `allocate`, `pricing`, `sheet` (parse + build),
  `aging`, `invoice` (build), `challan` (build), `pdf.tsx`, `queries`
- `lib/gst/` — `retail-register` + changes to `sales-register`,
  `register-summaries`, `register-xlsx`, `register-orders`
- `app/api/admin/retail/**`, `app/admin/retail/**`
- `components/admin/AdminShell.tsx` (tab), `components/admin/retail/*`
- `CLAUDE.md` — a "Retail consignment" section and the new routes

## Implementation notes (2026-10-08)

Deliberate deviations from the design above:

- Functions are `SECURITY INVOKER` (not definer) and granted to `service_role` only, matching `stall_refill_*`; `gst_financial_year` is granted to `service_role` for them.
- The shop/month marker is a visible "About" sheet (the xlsx writer cannot hide sheets); the MRP column is informational and not checked on upload.
- FIFO allocation lives only in SQL (`consignment_fill_from_batches`), and a sale can only draw on batches sent by its month's last day.
- B2B cancellation is as at now (no "Cancelled earlier" for shop invoices).
- Payments can be deleted (`DELETE /api/admin/retail/payments/[id]`) to fix typos.
- A sale's invoice date is recomputed at issue as `least(last day of period, today IST)`, so a draft saved mid-month and issued after month end is dated the month's last day.
- The shop invoice PDF has a "Rate (incl. GST)" column and an "Amount" column (GST-inclusive line total); draft documents are headed "DRAFT — NOT A TAX INVOICE" / "DRAFT — NOT A DELIVERY CHALLAN".
- Retail list reads page past PostgREST's 1,000-row cap.
- `PATCH /api/admin/retail/[id]` replaces the whole shop record; the form always sends every field.
