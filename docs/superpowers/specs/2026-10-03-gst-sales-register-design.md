# GST sales register — design

**Date:** 2026-10-03
**Status:** draft for review
**Branch:** `feature/gst-sales-register`

## Problem

Cozyberries has been GST-registered since September 2026 (GSTIN in
`BUSINESS_GSTIN`). Every month the owner has to send the CA a sales register
so the CA can file GSTR-1 and GSTR-3B. Nothing in the app produces one: the
admin dashboard reports sales by payment day for business trends, not invoice
by invoice with the tax split, and the CA would have to rebuild it from the
individual invoice PDFs.

Live data on 2026-10-03:

- Paid orders get a GST invoice number (`CB/26-27/0001`, …) and an
  `invoice_date` from `orders_on_status_change` the moment they become paid.
  `invoice_counters` for 26-27 stands at 24.
- September 2026: invoices `0001`–`0016`, all stall pickups, ₹26,167.00. Two
  delivered online orders paid on 1 Sep (₹279.00 and ₹1,874.00) have **no
  invoice number**, because numbering started on 25 Sep.
- October so far: invoices `0017`–`0024`, ₹16,275.00.
- No customer has a GSTIN, so every store sale is B2C. Every sale so far is
  intra-state (Karnataka, code 29). No invoiced order has been cancelled yet.
- Fifteen older paid orders (Feb–Jul 2026) also lack invoice numbers. They
  predate GST registration and stay as receipts.

## Goal

An admin page that previews a month's sales register with its aggregates and
downloads it as a GSTR-1-ready Excel file on demand, built from the same
integer-paise GST maths as the invoice PDFs so the two can never disagree.

## Decisions (approved 2026-10-03)

| Decision | Choice |
|---|---|
| File | One `.xlsx`, GSTR-1 ready: Summary, Invoices, B2CS, B2CL, HSN summary, Documents issued, Cancelled earlier. No item-wise sheet. |
| Scope | Store sales only (stall + online). The monthly Cellstrat consulting invoice (B2B, SAC 998314, 18%) is billed outside the app and stays out of the register; the owner sends it to the CA separately. |
| Missing invoice numbers | Backfill: paid orders from 1 Sep 2026 without a number get the next numbers in the series (`0025`, `0026`), dated with their payment time. Earlier orders stay as receipts. |
| Registration start | `GST_REGISTERED_FROM = "2026-09"`. No register exists before that month. |
| Cancellations | As at month end. A month's register never changes after the month closes; a later cancellation appears in the month it happened as a minus figure. |
| Approach | Server builds both the preview (JSON) and the file (`.xlsx`) from one pure module. Live read, no cache. |
| Excel library | `write-excel-file` (MIT, maintained June 2026, one dependency). Not `xlsx` (npm copy frozen at 0.18.5 with known advisories), not `exceljs` (21 MB, last release 2024). |

## Section 1 — The Excel file

File name `cozyberries-sales-register-2026-09.xlsx`. For the current,
unfinished month: `cozyberries-sales-register-2026-10-upto-03.xlsx`.

Formats: amounts are numbers in rupees, two decimals (`#,##0.00`); dates are
real date cells shown as `dd-mm-yyyy`, built from the IST calendar day
(`Date.UTC(y, m - 1, d)`) so no timezone shift can move a day. Each sheet has
a bold header row frozen at the top.

### Summary

Label / value pairs:

- Business: legal name, GSTIN, state.
- Period: `01-09-2026 to 30-09-2026`; for the current month `01-10-2026 to
  03-10-2026 (month not finished)`.
- Generated at (IST).
- Invoices issued, cancelled, net issued.
- This month's invoices (valid only): taxable value, CGST, SGST, IGST, total
  tax, invoice value.
- Stall vs Online: invoice count and invoice value each.
- Less: earlier months' invoices cancelled this month (taxable, tax, value).
- **Net for the month**: taxable value, CGST, SGST, IGST, invoice value.
  These are the figures for GSTR-3B 3.1(a).
- Warnings, if any (see Section 2).

### Invoices

One row per invoice whose `invoice_date` falls in the month, ordered by
invoice number:

`Invoice no. · Invoice date · Order no. · Channel (Stall/Online) · Customer
name · Place of supply (29-Karnataka) · Supply (Intra/Inter) · Rate % ·
Taxable value · CGST · SGST · IGST · Invoice value · Discount · Shipping ·
Payment method · Status`

- Valid invoices: Status `Valid`.
- An invoice cancelled or refunded in the same month keeps its row with every
  amount set to **0** and Status `Cancelled 12-09-2026 (was ₹1,234.00)`.
- A last **Total** row holds static sums (no formulas), equal to the Summary's
  "this month's invoices" figures.

### B2CS (GSTR-1 table 7)

One row per place of supply and rate, for every B2C invoice not in B2CL:

`Type (OE) · Place of supply · Rate % · Taxable value (this month) · Less:
cancelled earlier · Net taxable value · IGST · CGST · SGST · Cess`

Tax columns are net. `OE` means sold directly, not through an e-commerce
operator: cozyberries.in is the business's own site. Cess is always 0.

### B2CL (GSTR-1 table 5)

Inter-state invoices with invoice value **above ₹1,00,000.00**, one row each:
invoice no., date, place of supply, invoice value, rate, taxable value, IGST,
cess. An intra-state invoice is never B2CL. With none, the sheet holds a
single row `None this month`. B2CL invoices are left out of B2CS. A B2CL
invoice cancelled in a later month is listed in Cancelled earlier but not
netted into B2CS; the CA amends table 5 for it.

### HSN summary (GSTR-1 table 12, B2C)

`HSN (6111) · Description (Babies' garments and clothing accessories, knitted
or crocheted) · UQC (PCS-PIECES) · Total quantity · Rate % · Taxable value ·
IGST · CGST · SGST · Cess · Total value`

Covers every valid invoice (B2CS and B2CL), net of earlier months'
cancellations. Shipping lines add to the values but
not to the quantity (they are not pieces). One row today; the code groups by
HSN and rate so a second HSN would add a row.

### Documents issued (GSTR-1 table 13)

Nature of document `Invoices for outward supply`, one row per run of
consecutive numbers issued this month:

`Sr. no. from · Sr. no. to · Total number · Cancelled · Net issued`

September: `CB/26-27/0001`–`0016` and `CB/26-27/0025`–`0026`. Runs are
consecutive by the numeric part within one series (`CB/26-27/`). Cancelled
counts only invoices cancelled within the month.

### Cancelled earlier

Invoices dated in an earlier month and cancelled or refunded in this month:

`Invoice no. · Invoice date · Cancelled on · Place of supply · Rate % ·
Taxable value · CGST · SGST · IGST · Invoice value`

Amounts are negative. With none, a single row `None this month`.

### Not covered (stated for the CA)

- No credit notes are generated. A later cancellation shows only here; the
  CA decides how to report it.
- The 5% rate is the hard-coded `GST_RATE_PERCENT`. Garments above ₹2,500 a
  piece are taxed at 18%; nothing sold today is near that.
- No B2B invoices, no GSTR-1 JSON for the offline tool, no e-invoicing
  (turnover is far below the threshold).

## Section 2 — Data, database and code

### Which orders a month reads

Month M runs from 00:00 IST on its first day to 00:00 IST on the next
month's first day (`[start, end)`).

1. **Invoices of M:** `invoice_number is not null` and `invoice_date` in
   `[start, end)`. Such an invoice is *cancelled in M* when
   `invoice_voided_at < end`; otherwise it is valid as at month end, even if
   it was cancelled later.
2. **Cancelled earlier:** `invoice_date < start` and `invoice_voided_at` in
   `[start, end)`.
3. **Missing numbers (warning only):** paid status, `invoice_number is null`,
   `coalesce(stock_committed_at, created_at)` in `[start, end)`.

For the current month, `end` is the start of next month, so "as at month end"
means "as at now".

Selected columns: `id, order_number, created_at, status, fulfilment_method,
customer_name, shipping_address, place_of_supply, invoice_number,
invoice_date, invoice_voided_at, subtotal, discount_amount, delivery_charge,
total_amount`, plus `order_items(name, size, color, price, quantity)` and
`payments(payment_method, status)`. Phone and email are never selected.

Reads use the service-role client after `requireAdmin()`, which is the
existing admin-gated shape in CLAUDE.md. CLAUDE.md's route list gains
`sales-register`.

### Migration `20261003120000_gst_sales_register.sql`

The owner applies it, as with earlier migrations, **before** the code
deploys (the routes select `invoice_voided_at`).

1. `alter table public.orders add column if not exists invoice_voided_at
   timestamptz;`
2. `orders_on_status_change` (redefined from its latest version in
   `20260925020000_pickup_items_integrity.sql`, otherwise unchanged):
   - entering a paid status: `new.invoice_voided_at := null` (a reinstated
     order keeps its number and original `invoice_date`);
   - leaving a paid status with `new.invoice_number is not null`:
     `new.invoice_voided_at := now()`.
3. `guard_client_order_write`: the INSERT check also rejects
   `new.invoice_voided_at is not null`. The UPDATE path already rejects any
   change outside `status`, `notes`, `updated_at`, so it needs no change.
4. `public.backfill_invoice_numbers(p_from timestamptz) returns int`
   (plain function, `set search_path = ''`, `revoke all … from public, anon,
   authenticated`). For each order in a paid status with
   `invoice_number is null` and paid time `>= p_from`, in paid-time order
   (ties by `order_number`): take the next number from `invoice_counters` for
   `gst_financial_year(paid_time)`, set `invoice_number` and
   `invoice_date = paid_time`. Paid time = the earliest completed payment's
   `coalesce(completed_at, updated_at, created_at)`, else
   `coalesce(stock_committed_at, created_at)`. Returns how many it numbered.
   Running it again numbers nothing. It is a function, not an inline block,
   so the SQL tests can call it on fixture rows.
5. `select public.backfill_invoice_numbers('2026-09-01 00:00+05:30');`
   Today that numbers `ORD-20260901-155216-00109` → `CB/26-27/0025` and
   `ORD-20260901-160238-00110` → `CB/26-27/0026`, both dated 1 Sep.
6. Any invoiced order already in `cancelled`/`refunded` with
   `invoice_voided_at is null` gets the latest `order_status_events.created_at`
   into that status, else `updated_at`. Today there are none; this covers a
   cancellation made between now and the migration.

### Config

`lib/config/business.ts` gains `GST_REGISTERED_FROM = "2026-09"`,
`B2CL_LIMIT_PAISE = 100_000_00`, the HSN description and UQC.

### Code units

| Unit | Job |
|---|---|
| `lib/gst/register-month.ts` | Parse and validate `YYYY-MM`; IST `[start, end)` for a month; months available (`GST_REGISTERED_FROM` → current IST month); default month (the last completed one, or the current one when that is the registration month); whether a month is unfinished. |
| `lib/gst/sales-register.ts` | **Pure.** `buildSalesRegister({ month, orders, cancelledEarlier, missingNumbers, gstin, now })` → `SalesRegister`. Runs each order through the existing `buildInvoice()`, then classifies, groups and totals in integer paise. |
| `lib/gst/register-xlsx.ts` | `SalesRegister` → the seven sheets via `write-excel-file/node` → `Buffer`. |
| `GET /api/admin/sales-register?month=` | `requireAdmin()`, validate month, three reads, `buildSalesRegister`, JSON. |
| `GET /api/admin/sales-register/download?month=` | Same, then `register-xlsx`, sent as an attachment. |
| `app/admin/sales-register/` | Page + client component (Section 3). |

`SalesRegister` (amounts in paise):

```ts
{
  month: string; period: { from: string; to: string; unfinished: boolean };
  seller: { legalName: string; gstin: string; stateCode: string };
  invoices: RegisterInvoice[];          // status: valid | cancelled (+ cancelledOn, originalValue)
  cancelledEarlier: RegisterInvoice[];
  b2cs: B2csRow[]; b2cl: RegisterInvoice[]; hsn: HsnRow[];
  documents: { from: string; to: string; total: number; cancelled: number }[];
  totals: { month: Totals; cancelledEarlier: Totals; net: Totals;
            issued: number; cancelled: number;
            byChannel: { stall: { count: number; valuePaise: number };
                         online: { count: number; valuePaise: number } } };
  warnings: string[];
}
```

Place of supply comes from `buildInvoice()`: the stored `place_of_supply`,
else the address state (delivery orders placed before it was stored). Stall
orders store `29`.

### Warnings

Shown on the page banner and the Summary sheet; none blocks the download.

- Paid orders in the month with no invoice number (order numbers listed).
- A delivery invoice whose place of supply cannot be resolved (shown as `—`
  and taxed as IGST by the invoice rules): "check the address".
- An invoice whose computed total differs from `orders.total_amount`.
- An invoiced order in `cancelled`/`refunded` with no `invoice_voided_at`;
  it is treated as cancelled in its own month.

### Accepted limitation

If an order is cancelled in one month and reinstated in a later month, the
earlier month's "Cancelled earlier" line disappears on a re-download, because
`invoice_voided_at` holds only the latest cancellation. This is rare and
needs a manual note to the CA if it ever happens.

### Why the dashboard and the register can differ

The sales dashboard counts a sale on `coalesce(stock_committed_at,
created_at)`, includes pre-registration receipts, and drops an order as soon
as it is cancelled. The register counts invoices by `invoice_date` and keeps
an invoice in its month when it is cancelled in a later month. New orders get
`stock_committed_at` and `invoice_date` in the same trigger run, so for
September 2026 onwards the two agree on sales value until a cancellation
crosses a month boundary.

## Section 3 — The page

New page `/admin/sales-register` with a **Sales register** tab in the sidebar
list after Stock. It is not in the phone bottom bar (full at five, and the
page is used about once a month).

```
Sales register                       [⬇ Excel]
[Sep 2026] [Oct 2026 · so far]
⚠ banner only when warnings exist
[Invoice value ₹28,320.00]  [Invoices 18 · 0 cancelled]
[Taxable ≈ ₹26,971]         [Tax ≈ ₹1,349  CGST · SGST · IGST]
Stall ████████████████░ Online
By place of supply (B2CS)      table
HSN summary                    table
Invoice numbers used           0001–0016 · 0025–0026
Invoices                       list
Cancelled from earlier months  list, only when present
```

Built from the kit: `PageHeader`, `FilterChips` (months, value kept in
`?month=`), `StatTile`, `SegmentBar` (Stall `#c4703f`, Online `#2f7fc0`, the
dashboard's colours), `ChartTable`, `ListCard`, `ErrorBanner`, `EmptyState`,
`LoadingList`. One block per row at every width.

- **Default month:** the last completed month (on 3 Oct: September).
  `?month=` outside the available months falls back to the default.
- **Unfinished month:** the chip reads "Oct 2026 · so far" and a note under
  the Download button says the month is not finished.
- **Invoices list:** invoice no. and date, customer, Stall/Online, invoice
  value, tax. Cancelled rows are greyed and show the cancellation note. All
  rows, no paging (about 30 a month).
- **Download:** `fetch` the download route, save the blob under the
  `Content-Disposition` filename via an object URL, then revoke it. The button
  shows a spinner while it runs and the app's toast on failure; the preview
  stays as it is.
- **Data:** TanStack Query, the same pattern as `/admin/stock`. A failed
  refresh keeps the last data on screen with the error banner.
- **Empty month:** the empty state, and Download still works (a nil month
  still has to be filed; the file holds zero totals and "None this month"
  rows).

## Section 4 — Errors, security, testing

### Errors

- Bad `?month=` (format or range): 400 `{ error }`.
- Missing `BUSINESS_GSTIN`: 500 with a clear message from both routes;
  never a file with a blank GSTIN.
- Database error: 500 `{ error }`; the page shows `ErrorBanner`.

### Security

- Both routes call `requireAdmin()` before creating the service-role client;
  a test proves a 403 never creates one.
- `?month=` must match `^\d{4}-(0[1-9]|1[0-2])$` and lie between
  `GST_REGISTERED_FROM` and the current IST month.
- Download headers: `Content-Type:
  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
  `Content-Disposition: attachment; filename="…"`,
  `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`.
- Customer names are written as string cells; a name like `=HYPERLINK(…)` is
  stored as text and never evaluated.
- `/api/admin/*` is already network-only in the service worker.

### Tests (vitest unless noted; every rule has a case)

- `register-month`: 30 Sep 23:59 IST → September, 1 Oct 00:01 IST →
  October; invalid strings, months before September 2026 and future months
  rejected; available months and default month on 3 Oct, on the registration
  month, and on 1 Jan (year rollover).
- `sales-register`:
  - month totals equal the sum of `buildInvoice()` totals, to the paisa;
  - cancelled in month → zero amounts, status note, counted as cancelled;
  - cancelled after month end → valid in its month;
  - cancelled earlier → negative in Cancelled earlier, B2CS net and HSN net;
  - document runs: `0001–0016` and `0025–0026`; a cancelled number stays in
    its run;
  - B2CL boundary: inter-state ₹1,00,000.00 → B2CS, ₹1,00,000.01 → B2CL;
    intra-state above the limit → B2CS;
  - HSN quantity leaves out shipping; a discount spread over lines;
  - Stall/Online split;
  - each warning;
  - an empty month.
- `register-xlsx`: read back with `read-excel-file` (dev dependency): seven
  sheet names in order, header rows, Invoices total row equals Summary,
  dates are date cells on the right day, a formula-like name is text.
- Routes: 403 without admin (no service-role client created), 400 bad month,
  JSON shape, download headers and both filename forms.
- Page (jsdom): default month, month chips and `?month=`, unfinished-month
  note, warnings banner, empty state, failed refresh keeps last data,
  Download spinner and error toast.
- `nav.test.ts`: the new tab, sidebar only.
- **SQL** `npm run db:test-sales-register` (new
  `scripts/db-test-sales-register.mjs`, rolled back, same pattern as
  `db:test-pickup`): trigger sets `invoice_voided_at` on paid → cancelled and
  paid → refunded for an invoiced order, leaves it null for an uninvoiced
  one, clears it on reinstatement and keeps the number; a customer session
  cannot insert or update it; `backfill_invoice_numbers` numbers fixture
  orders in paid-time order with the right dates and returns 0 on a second
  run.
- `npm run db:lint` and `npm run db:probe` before merging.

### Rollout

1. Owner applies the migration, then runs `npm run db:test-sales-register`,
   `db:lint`, `db:probe`.
2. Merge to `develop` and `main`, deploy.
3. Live check: September shows 18 invoices, ₹28,320.00 invoice value (16
   Stall ₹26,167.00, 2 Online ₹2,153.00), runs `0001–0016` and `0025–0026`,
   matching a read-only SQL sum over September's invoices.
4. Tell the CA that `CB/26-27/0025` and `0026` were numbered on the
   migration date for sales paid on 1 Sep 2026, which is why they sit after
   `0016` in the series.

### Docs

CLAUDE.md gains a "GST sales register" section: what each sheet is, the
as-at-month-end rule, `invoice_voided_at`, the backfill function, the
reinstatement limitation, and the new route in the admin-gated list.
