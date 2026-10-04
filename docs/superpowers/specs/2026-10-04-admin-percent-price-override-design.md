# Admin percentage price override — design

**Date:** 2026-10-04
**Status:** approved 2026-10-04; plan at `docs/superpowers/plans/2026-10-04-admin-percent-price-override.md`
**Branch:** `feature/admin-percent-override` (worktree `../vercel-frontend-worktrees/admin-percent-override`)

## Problem

When staff place an order for a customer in shadow mode (impersonation), the
amber "Admin tools" box at checkout offers one override: a flat discount in
rupees (`admin_override: { discount_amount, note }`). Staff cannot:

- give a percentage discount without working out the rupee amount by hand, or
- charge more than the catalogue price for a sale (an event, the stall, or a
  negotiated price).

## Goal

In shadow mode, staff can lower an order by a percentage or raise it by a
percentage. A raise increases **each product's unit price** by that
percentage, so the bill, the GST invoice and Telegram show the higher prices.
The server works out every rupee figure; the client sends only the mode, the
percentage and a reason.

## Decisions (approved 2026-10-04)

| Decision | Choice |
|---|---|
| What a raise is for | A higher price for this sale (event, stall, negotiated). The bill shows higher item prices, not an extra charge line. |
| Approach | A: a decrease is an order-level discount, as today; an increase re-prices every line. No migration. |
| Rejected | B (re-price lines in both directions: the bill loses its "Discount" line). C (a signed order-level adjustment column: needs a migration and a surcharge-aware GST invoice, and leaves item prices unchanged). |
| Modes | Discount ₹ (unchanged), Discount %, Increase %. One at a time. |
| Percent range | 0.1 to 100, at most one decimal place. 100% off makes the goods free (same ceiling as the ₹ field); +100% caps typos. |
| Rounding | Increase: each unit price rounded to the nearest rupee. Discount: the rupee amount rounded to the nearest rupee, capped at the subtotal. Totals stay whole rupees, which the UPI `am` field needs. |
| Scope of a raise | This order only. Catalogue prices and product pages do not change. |

Worked example, +10%:

| Item | Catalogue | +10% exact | Charged |
|---|---|---|---|
| Muslin frock × 2 | ₹899 | ₹988.90 | ₹989 each |
| Pyjama × 1 | ₹649 | ₹713.90 | ₹714 |
| Subtotal | ₹2,447 | ₹2,691.70 | ₹2,692 |

## Section 1 — What staff see at checkout

The amber "Admin tools — Shadow mode" box (`app/checkout/page.tsx`, shown
only while `impersonation.active`) keeps its "Apply custom discount override"
checkbox. When checked, it shows:

- A three-way choice: **Discount ₹** (default, today's behaviour),
  **Discount %**, **Increase %**. Switching mode clears the number field.
- One number field whose label follows the mode: "Discount amount (₹)",
  "Discount (%)", "Increase (%)". Percent modes use `step=0.1`, `min=0.1`,
  `max=100`.
- The required reason field, unchanged (3–500 characters).

Validation messages under the field:

- ₹ mode: unchanged ("Amount must be a non-negative integer no greater than the subtotal (₹N).").
- % modes: "Enter a percentage from 0.1 to 100, with at most one decimal."

Preview in the order summary, computed by the same function the server uses:

- **Discount ₹ / Discount %:** a "Discount (ADMIN_OVERRIDE) −₹X" row. Today
  the summary hides the discount row while an override is active, because
  the row needs an `offerCode` and the page passes `null` during an override
  (`offerCode={overrideActive ? null : …}`). That gap is fixed: the override
  passes `ADMIN_OVERRIDE` as the code.
- **Increase %:** the item rows show the raised unit totals, Subtotal is the
  raised total, and under it a muted line "Includes admin price +10% (+₹X)",
  where X = raised subtotal − catalogue subtotal. The "Total MRP" and
  "Discount on MRP" rows are hidden, because the cart prices are not what
  will be charged.

Delivery is computed on the adjusted goods total, as it is for discounts
today (`deliveryChargeFor(discountedSubtotal, …)`). A raise can cross the
free-delivery threshold.

Coupons stay ignored while an override is active. Unchecking the box clears
the mode, number and reason, as today.

## Section 2 — Request, shared calculation and stored data

### Request

`admin_override` becomes a union (`lib/types/order.ts`):

```ts
type AdminOverride =
  | { mode?: "amount"; discount_amount: number; note: string } // today's shape; no mode = amount
  | { mode: "percent_off"; percent: number; note: string }
  | { mode: "percent_up"; percent: number; note: string };
```

The client always sends the cart lines at their **catalogue** prices plus the
override. It never sends raised prices; `validateItemPrices` would reject them.

### Shared calculation

A new pure, client-safe module `lib/utils/admin-override.ts` holds the
override logic. `applyAdminOverride` and its constants move there from
`lib/utils/checkout-helpers.ts`, whose callers and tests are updated.

```ts
applyAdminOverride({ override, items, actingAdminEmail, existingNotes })
  → { ok: true, items, discountCode, discountAmount, notes }
  | { ok: false, error }
```

- It takes the order's **items**, not just the subtotal, so it can re-price
  them. It returns new item objects and never mutates its input.
- `amount`: behaviour unchanged (clamp to `[0, subtotal]`, floor). Items
  returned unchanged. Code `ADMIN_OVERRIDE`.
- `percent_off`: `discountAmount = min(subtotal, round(subtotal × p / 100))`,
  computed in tenths as below. Items unchanged. Code `ADMIN_OVERRIDE`.
- `percent_up`: each item's `price` becomes
  `Math.round(price × (1000 + t) / 1000)`, where `t = Math.round(p × 10)` is
  the percentage in tenths (an integer after validation). Ties round up. The
  plain `Math.round(price × (100 + p) / 100)` gets ties wrong: ₹250 at +28.2%
  is exactly ₹320.50, but floating point yields 320.49999999999994 and rounds
  down to ₹320. A sweep of prices ₹1–3,000 against every tenth from 0.1 to
  100 found 198 such errors with the plain form and none with tenths.
  `discountAmount = 0`. Code `ADMIN_PRICE_UP`. The same tenths form is used
  for `percent_off`: `Math.round(subtotal × t / 1000)`.
- Percent validation: finite, `0.1 ≤ p ≤ 100`, at most one decimal place.
  Otherwise `{ ok: false, error: "Override percent must be from 0.1 to 100, with at most one decimal" }`.
  An unknown `mode` returns `{ ok: false, error: "Unknown override mode" }`.
- Reason validation and CR/LF stripping: unchanged.
- Notes: `[ADMIN OVERRIDE by <email>]: <reason>` for ₹ mode, unchanged.
  Percent modes add the change in brackets:
  `[ADMIN OVERRIDE by <email>]: (−10% discount) <reason>` and
  `[ADMIN OVERRIDE by <email>]: (+10% prices) <reason>`.
- Also exported: `ADMIN_PRICE_UP_CODE = "ADMIN_PRICE_UP"` and
  `isPriceRaised(order: { discount_code?: string | null })`.

The checkout page calls the same function for its preview, so the screen and
the stored order cannot disagree. Its local copies of the note limits
(`ADMIN_OVERRIDE_NOTE_MIN_LEN` / `_MAX_LEN`) are replaced by the shared
constants.

### `/api/orders` (POST)

The order of steps matters:

1. `admin_override` outside shadow mode → 403 (unchanged).
2. `validateItemPrices(client, items)` checks the catalogue prices (unchanged).
3. `resolveOrderVariants(client, items)` (unchanged).
4. If an override is present, `applyAdminOverride({ override, items, … })`.
   A failure returns 400 with its error. Otherwise `pricedItems` is the
   returned items; without an override `pricedItems = items`.
5. `calculateOrderSummary(pricedItems)`, so `subtotal = Σ price × quantity`
   of the stored lines. The paid-status `ITEMS_MISMATCH` check in
   `orders_on_status_change()` keeps passing.
6. The coupon path runs only without an override (unchanged).
7. `order_items` rows are built from `pricedItems`, so `order_items.price` is
   the raised unit price.
8. The impersonation audit `metadata` gains `override_mode`
   (`amount` | `percent_off` | `percent_up`) and `override_percent` (number,
   or `null` for ₹ mode), next to the existing `override_applied`.

### What is stored (no migration)

| Mode | `discount_code` | `discount_amount` | `order_items.price` | `notes` |
|---|---|---|---|---|
| ₹ discount | `ADMIN_OVERRIDE` | rupees | catalogue | `[ADMIN OVERRIDE by …]: reason` |
| % discount | `ADMIN_OVERRIDE` | rounded rupees | catalogue | `… (−10% discount) reason` |
| % increase | `ADMIN_PRICE_UP` | 0 | raised | `… (+10% prices) reason` |

`orders.discount_amount >= 0` (`chk_orders_discount_amount_non_negative`)
holds in every mode.

### Downstream, unchanged code

- GST invoice and PDF bill (`lib/invoice/*`): tax is computed on the stored
  line prices, so a raise is taxed at the raised price. The discount row
  shows only when the discount is above 0, so a raised order shows none.
- Sales dashboard: Sales (Σ `total_amount`) and product/category value
  (Σ `price × quantity`) both include the raise.
- UPI QR, "Received cash", stall refills, stock: read `total_amount` or
  units, unaffected.

## Section 3 — Displays, Telegram, errors and tests

### Customer order pages

`isPriceRaised(order)` drives two changes:

- `/orders/[id]`: `MrpSummaryRows` is not rendered for a raised order. The
  discount row already needs `discount_amount > 0`, so none appears.
- `/orders`: the card's "saved on MRP" figure comes from a new helper
  `orderMrpSavings(order)` in `lib/utils/discount.ts`, which returns 0 for a
  raised order and `mrpTotals(order.items, order.created_at).mrpSavings`
  otherwise. The page has no test file, so the rule lives in a helper that
  can be unit-tested.

Without this, a ₹899 item raised to ₹989 would show an MRP of ₹1,099
(`mrpFor(989)`) and a saving the customer never got. Orders discounted by %
look the same as today's ₹ overrides.

### Telegram

`buildNewOrderText` and `notifyOrderPlaced` (`lib/services/telegram.ts`)
print `🏷️ Discount (<code>): −₹<amount>` whenever a code is set, so a raised
order would read "Discount (ADMIN_PRICE_UP): −₹0". Change:

- The discount line prints only when `discountAmount > 0`.
- When `discountCode === ADMIN_PRICE_UP_CODE`, print `📈 Prices raised by admin`
  instead, so the owner knows before tapping ✅.

### Errors

- Client: invalid fields block "Place order" with the existing toast "Fix the
  admin override fields first".
- Server: 400 with the calculation's error message; 403 outside shadow mode.
  Nothing is written on a 400.

### Tests (vitest; Playwright skipped for now)

`lib/utils/admin-override.test.ts`:

- `percent_up`: per-unit rounding (899 → 989, 649 → 714 at +10%), quantities
  respected, the tie case ₹250 at +28.2% → ₹321, 0.1% and 100% bounds, input
  not mutated.
- `percent_off`: rounding to the nearest rupee, 100% equals the subtotal.
- Percent rejected: 0, 100.1, −5, 12.55, `NaN`, a string, missing.
- Unknown mode rejected; no `mode` treated as ₹ amount (today's tests carried
  over).
- Notes format for each mode; CR/LF stripping unchanged.
- `isPriceRaised`.

`app/api/orders/route.test.ts`:

- `percent_up` inserts raised `order_items.price`, `subtotal` equal to
  Σ price × quantity, `discount_code = 'ADMIN_PRICE_UP'`, `discount_amount = 0`,
  and a total built from the raised subtotal.
- `percent_off` inserts the rounded amount with `ADMIN_OVERRIDE`.
- Catalogue prices are validated before the raise (the price check receives
  the unraised items).
- An invalid percent returns 400 and inserts nothing.
- The existing 403 outside shadow mode still fires.
- Audit metadata carries `override_mode` and `override_percent`.

`app/checkout/page.test.tsx`: mode switching clears the field; % discount
preview shows "Discount (ADMIN_OVERRIDE)"; increase preview shows raised
lines, subtotal and the "Includes admin price" line, and hides the MRP rows;
the request body carries `mode` and `percent`.

`app/orders/[id]/page.test.tsx`: no MRP rows for `ADMIN_PRICE_UP`; unchanged
for other orders.

`lib/utils/discount.test.ts`: `orderMrpSavings` returns 0 for
`ADMIN_PRICE_UP` and the `mrpTotals` saving otherwise (including the
before-`shownSince` case).

`lib/services/telegram.test.ts`: no "−₹0" discount line; the 📈 line for a
raised order; the discount line unchanged when the amount is above 0.

## Out of scope

- Showing the override (mode, percent, reason) in admin pages. Admin pages
  do not show `orders.notes` today; the note and the audit log keep it.
- A flat ₹ increase, or combining a discount with an increase.
- Changing prices on an order after it is placed.
- Changing catalogue prices.

## Files

| File | Change |
|---|---|
| `lib/utils/admin-override.ts` | New: `applyAdminOverride` (moved and extended), constants, `isPriceRaised`. |
| `lib/utils/admin-override.test.ts` | New; absorbs the `applyAdminOverride` cases from `checkout-helpers.test.ts`. |
| `lib/utils/checkout-helpers.ts` / `.test.ts` | Remove the moved code and tests. |
| `lib/types/order.ts` | `AdminOverride` union. |
| `app/api/orders/route.ts` / `.test.ts` | Re-price before the summary; insert priced items; audit metadata. |
| `app/checkout/page.tsx` / `.test.tsx` | Mode choice, shared calculation for the preview, discount row during override, MRP rows hidden on increase. |
| `app/orders/[id]/page.tsx` / `page.test.tsx` | Skip `MrpSummaryRows` for raised orders. |
| `lib/utils/discount.ts` / `.test.ts` | New `orderMrpSavings(order)`. |
| `app/orders/page.tsx` | Card uses `orderMrpSavings(order)`. |
| `lib/services/telegram.ts` / `.test.ts` | Discount line only above ₹0; 📈 line for raised orders. |
| `CLAUDE.md` | Short paragraph on the override modes and `ADMIN_PRICE_UP`. |
