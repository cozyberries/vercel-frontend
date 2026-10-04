# Admin percentage price override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In shadow-mode checkout, staff can discount an order by a percentage or raise every unit price by a percentage, alongside today's flat ₹ discount.

**Architecture:** A new pure, client-safe module `lib/utils/admin-override.ts` prices an override for both the checkout preview and `POST /api/orders`. A discount is stored as today (`ADMIN_OVERRIDE`, rupee `discount_amount`). An increase re-prices `order_items.price`, makes `subtotal` their sum, and marks the order `discount_code = ADMIN_PRICE_UP` with `discount_amount = 0`. No migration. Customer pages hide the MRP saving on raised orders, and Telegram flags them.

**Tech Stack:** Next.js 15 App Router, TypeScript, React 19 client components, Vitest 4 + Testing Library (jsdom), Supabase (no schema change).

**Spec:** `docs/superpowers/specs/2026-10-04-admin-percent-price-override-design.md`

## Global Constraints

- Work only in the worktree `/Users/abdul.azeez/Personal/cozyberries/vercel-frontend-worktrees/admin-percent-override` on branch `feature/admin-percent-override`. Never `git checkout` anything in the main checkout `/Users/abdul.azeez/Personal/cozyberries/vercel-frontend`.
- Shadow mode only: `admin_override` without `actingAdminId` → 403 (unchanged).
- Modes: `amount` (no `mode` field also means amount), `percent_off`, `percent_up`. One at a time.
- Percent: a JSON number from 0.1 to 100 with at most one decimal. Server error text, verbatim: `Override percent must be from 0.1 to 100, with at most one decimal`. Client error text, verbatim: `Enter a percentage from 0.1 to 100, with at most one decimal.`
- Rounding: work in tenths `t = Math.round(p × 10)`. Raise: `Math.round(price × (1000 + t) / 1000)` per unit. Discount: `Math.min(subtotal, Math.round(subtotal × t / 1000))`.
- Codes: `ADMIN_OVERRIDE` for both discount modes; `ADMIN_PRICE_UP` for a raise, always with `discount_amount = 0`.
- Notes: `[ADMIN OVERRIDE by <email>]: <reason>` (₹), `[ADMIN OVERRIDE by <email>]: (−<p>% discount) <reason>`, `[ADMIN OVERRIDE by <email>]: (+<p>% prices) <reason>`. The minus is U+2212 `−`. Reason 3–500 characters after trim, CR/LF collapsed to a space.
- The client sends cart lines at **catalogue** prices; the server re-prices only after `validateItemPrices` and `resolveOrderVariants`.
- Copy, verbatim: preview line `Includes admin price +<p>% (+₹<X>)`; Telegram line `📈 Prices raised by admin`.
- Never show an MRP or MRP saving for an `ADMIN_PRICE_UP` order.
- Tests: Vitest only (Playwright is skipped for now by the owner's preference). Every rule below gets an automated test.
- TypeScript baseline on this commit: `npx tsc --noEmit -p .` reports **24** errors, all in files this plan does not touch (`app/sitemap.ts`, `app/api/*/options/route.ts`, `lib/services/products-server.ts`, a few tests). The count must stay 24.

## Review Focus

1. **A raise that crosses the ₹1,999 free-delivery threshold** (₹1,900 at +10% → ₹2,090): delivery must be free in the preview and on the stored order. → Task 2 test "a raise that crosses the free-delivery threshold makes delivery free"; Task 3 test "+100% on ₹1,000 makes delivery free in the preview".
2. **A coupon sent with a raise** (the Early Bird offer running): the coupon must be ignored, never applied on top of raised prices. → Task 2 test "ignores a coupon sent with a raise".
3. **Several lines with quantity > 1 on a raised order**: the stored `subtotal` must equal Σ stored price × quantity, worked out by the real `calculateOrderSummary`. Otherwise the ✅ confirmation fails with `ITEMS_MISMATCH`. → Task 2 test "percent_up stores raised unit prices…" (uses the actual `calculateOrderSummary`).
4. **A decimal percentage such as 12.5**: every display reads "12.5", never "12.50" or "13". → Task 1 notes tests; Task 3 test "shows a decimal raise as typed".
5. **An out-of-range value typed by staff** (150 for Increase %): the error shows, Place Order stays disabled even with a reason, and nothing is sent. → Task 3 test "blocks an out-of-range percentage".

---

### Task 1: Shared override module (and move `applyAdminOverride` out of checkout-helpers)

**Files:**
- Create: `lib/utils/admin-override.ts`
- Create: `lib/utils/admin-override.test.ts` (absorbs the cases in `lib/utils/checkout-helpers.test.ts`)
- Delete: `lib/utils/checkout-helpers.test.ts`
- Modify: `lib/types/order.ts:162-168` (`AdminOverride` becomes a union)
- Modify: `lib/utils/checkout-helpers.ts:1-11` (import) and `:246-339` (remove the Admin Override section)
- Modify: `app/api/orders/route.ts:5-10` (import) and `:156-161` (call)
- Modify: `app/api/orders/route.test.ts` (stop mocking `applyAdminOverride`)

**Interfaces:**
- Produces (from `@/lib/types/order`):
  ```ts
  export type AdminOverrideMode = "amount" | "percent_off" | "percent_up";
  export type AdminOverride =
    | { mode?: "amount"; discount_amount: number; note: string }
    | { mode: "percent_off" | "percent_up"; percent: number; note: string };
  ```
- Produces (from `@/lib/utils/admin-override`):
  ```ts
  export const ADMIN_OVERRIDE_DISCOUNT_CODE = "ADMIN_OVERRIDE";
  export const ADMIN_PRICE_UP_CODE = "ADMIN_PRICE_UP";
  export const ADMIN_OVERRIDE_NOTE_MIN = 3;
  export const ADMIN_OVERRIDE_NOTE_MAX = 500;
  export const ADMIN_OVERRIDE_PERCENT_ERROR: string;
  export interface PricedLine { price: number; quantity: number }
  export function linesSubtotal(items: PricedLine[]): number;
  export function parseOverridePercent(value: unknown): number | null; // tenths
  export function raisePrice(price: number, tenths: number): number;
  export function priceAdminOverride<T extends PricedLine>(override: AdminOverride, items: T[]): AdminOverridePricing<T>;
  export function overrideNoteError(note: unknown): string | null;
  export function applyAdminOverride<T extends PricedLine>(input: ApplyAdminOverrideInput<T>): ApplyAdminOverrideResult<T>;
  export function isPriceRaised(order: { discount_code?: string | null }): boolean;
  // AdminOverridePricing<T> ok branch: { ok: true; mode: AdminOverrideMode; percent: number | null; items: T[]; discountCode: "ADMIN_OVERRIDE" | "ADMIN_PRICE_UP"; discountAmount: number }
  // ApplyAdminOverrideSuccess<T> = that ok branch & { notes: string }
  ```

- [ ] **Step 1: Set up the worktree and commit the docs**

```bash
cd /Users/abdul.azeez/Personal/cozyberries/vercel-frontend-worktrees/admin-percent-override
npm ci
ln -s ../../vercel-frontend/.env.local .env.local
git status --short   # expect only the two docs below as untracked (.env.local is gitignored)
git add docs/superpowers/specs/2026-10-04-admin-percent-price-override-design.md docs/superpowers/plans/2026-10-04-admin-percent-price-override.md
git commit -m "docs: admin percentage price override spec and plan"
```

- [ ] **Step 2: Write the failing tests**

Create `lib/utils/admin-override.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AdminOverride } from "@/lib/types/order";
import {
  ADMIN_OVERRIDE_DISCOUNT_CODE,
  ADMIN_OVERRIDE_NOTE_MAX,
  ADMIN_OVERRIDE_NOTE_MIN,
  ADMIN_OVERRIDE_PERCENT_ERROR,
  ADMIN_PRICE_UP_CODE,
  applyAdminOverride,
  isPriceRaised,
  linesSubtotal,
  parseOverridePercent,
  priceAdminOverride,
  raisePrice,
} from "./admin-override";

const admin = "admin@example.com";
/** A single line worth `amount` rupees. */
const worth = (amount: number) => [{ price: amount, quantity: 1 }];

describe("applyAdminOverride — ₹ amount (behaviour carried over from checkout-helpers)", () => {
  it("returns clamped + floored discount and prefixed notes on happy path", () => {
    const items = worth(1000);
    const result = applyAdminOverride({
      override: { discount_amount: 250, note: "Wholesale customer" },
      items,
      actingAdminEmail: admin,
      existingNotes: "Leave at door",
    });

    expect(result).toEqual({
      ok: true,
      mode: "amount",
      percent: null,
      items,
      discountCode: ADMIN_OVERRIDE_DISCOUNT_CODE,
      discountAmount: 250,
      notes: "[ADMIN OVERRIDE by admin@example.com]: Wholesale customer\nLeave at door",
    });
  });

  it("clamps a negative discount to 0", () => {
    const result = applyAdminOverride({
      override: { discount_amount: -42, note: "phone order" },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.discountAmount).toBe(0);
  });

  it("clamps a discount larger than subtotal to the subtotal", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 9999, note: "freebie for tester" },
      items: worth(500),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.discountAmount).toBe(500);
  });

  it("floors a non-integer discount", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 123.9, note: "phone order" },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.discountAmount).toBe(123);
  });

  it("rejects a discount amount that is not a number", () => {
    const override = { discount_amount: "lots", note: "phone order" } as unknown as AdminOverride;
    expect(applyAdminOverride({ override, items: worth(1000), actingAdminEmail: admin })).toEqual({
      ok: false,
      error: "Invalid override discount amount",
    });
  });

  it("rejects notes shorter than 3 characters after trim", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "  ok  " },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least 3/);
  });

  it("rejects notes longer than 500 characters", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "x".repeat(ADMIN_OVERRIDE_NOTE_MAX + 1) },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at most 500/);
  });

  it("preserves existing notes by prefixing the override line", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "wholesale" },
      items: worth(1000),
      actingAdminEmail: admin,
      existingNotes: "Call before delivery",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notes).toBe("[ADMIN OVERRIDE by admin@example.com]: wholesale\nCall before delivery");
    }
  });

  it("emits a single-line note when there are no existing customer notes", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "wholesale" },
      items: worth(1000),
      actingAdminEmail: admin,
      existingNotes: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notes).toBe("[ADMIN OVERRIDE by admin@example.com]: wholesale");
      expect(result.notes).not.toContain("\n");
    }
  });

  it("accepts discount_amount of exactly 0 (lower boundary)", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 0, note: "goodwill refund" },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.discountAmount).toBe(0);
  });

  it("accepts discount_amount exactly equal to subtotal (upper boundary)", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 1000, note: "full comp" },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.discountAmount).toBe(1000);
  });

  it("accepts a note of exactly MIN length (3) after trim", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 10, note: "x".repeat(ADMIN_OVERRIDE_NOTE_MIN) },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a note of exactly MAX length (500) after trim", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 10, note: "x".repeat(ADMIN_OVERRIDE_NOTE_MAX) },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
  });

  it("collapses embedded CR/LF in the note to a single space", () => {
    const crafted = "wholesale\n[ADMIN OVERRIDE by attacker@example.com]: freebie";
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: crafted },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notes).toBe(
        `[ADMIN OVERRIDE by ${admin}]: wholesale [ADMIN OVERRIDE by attacker@example.com]: freebie`
      );
      expect(result.notes.includes("\n")).toBe(false);
    }
  });

  it("handles \\r\\n sequences and keeps only the single separator newline", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "line one\r\nline two" },
      items: worth(1000),
      actingAdminEmail: admin,
      existingNotes: "call before delivery",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notes.match(/\n/g)?.length).toBe(1);
      expect(result.notes).toBe(`[ADMIN OVERRIDE by ${admin}]: line one line two\ncall before delivery`);
    }
  });

  it("treats whitespace-only existing notes as absent", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "wholesale" },
      items: worth(1000),
      actingAdminEmail: admin,
      existingNotes: "   \n  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notes).toBe("[ADMIN OVERRIDE by admin@example.com]: wholesale");
      expect(result.notes).not.toContain("\n");
    }
  });

  it("substitutes 'unknown' when actingAdminEmail is missing", () => {
    const result = applyAdminOverride({
      override: { discount_amount: 100, note: "wholesale" },
      items: worth(1000),
      actingAdminEmail: "",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.notes).toBe("[ADMIN OVERRIDE by unknown]: wholesale");
  });
});

describe("parseOverridePercent", () => {
  it.each([
    [0.1, 1],
    [10, 100],
    [12.5, 125],
    [28.2, 282],
    [100, 1000],
  ])("reads %s%% as %s tenths", (input, tenths) => {
    expect(parseOverridePercent(input)).toBe(tenths);
  });

  it.each([0, 0.05, 100.1, -5, 12.55, Number.NaN, Number.POSITIVE_INFINITY, "10", null, undefined])(
    "rejects %s",
    (input) => {
      expect(parseOverridePercent(input)).toBeNull();
    }
  );
});

describe("raisePrice", () => {
  it("rounds each unit price to the nearest rupee", () => {
    expect(raisePrice(899, 100)).toBe(989);
    expect(raisePrice(649, 100)).toBe(714);
  });

  it("rounds an exact half up, which the plain floating-point formula gets wrong", () => {
    // ₹250 at +28.2% is exactly ₹320.50; the plain formula lands just below it.
    expect((250 * (100 + 28.2)) / 100).toBeLessThan(320.5);
    expect(raisePrice(250, 282)).toBe(321);
  });

  it("doubles a price at the 100% cap", () => {
    expect(raisePrice(899, 1000)).toBe(1798);
  });
});

describe("priceAdminOverride — percentages", () => {
  const lines = [
    { id: "p1", price: 899, quantity: 2 },
    { id: "p2", price: 649, quantity: 1 },
  ];

  it("percent_up raises every unit price and keeps quantities and other fields", () => {
    const result = priceAdminOverride({ mode: "percent_up", percent: 10, note: "x" }, lines);
    expect(result).toEqual({
      ok: true,
      mode: "percent_up",
      percent: 10,
      items: [
        { id: "p1", price: 989, quantity: 2 },
        { id: "p2", price: 714, quantity: 1 },
      ],
      discountCode: ADMIN_PRICE_UP_CODE,
      discountAmount: 0,
    });
    if (result.ok) expect(linesSubtotal(result.items)).toBe(2692);
  });

  it("percent_up leaves the lines it was given unchanged", () => {
    priceAdminOverride({ mode: "percent_up", percent: 10, note: "x" }, lines);
    expect(lines.map((l) => l.price)).toEqual([899, 649]);
  });

  it("percent_off rounds the discount to the nearest rupee and keeps catalogue prices", () => {
    // 12.5% of ₹2,447 is ₹305.875.
    expect(priceAdminOverride({ mode: "percent_off", percent: 12.5, note: "x" }, lines)).toEqual({
      ok: true,
      mode: "percent_off",
      percent: 12.5,
      items: lines,
      discountCode: ADMIN_OVERRIDE_DISCOUNT_CODE,
      discountAmount: 306,
    });
  });

  it("percent_off at 100% takes off the whole subtotal", () => {
    const result = priceAdminOverride({ mode: "percent_off", percent: 100, note: "x" }, lines);
    expect(result.ok && result.discountAmount).toBe(2447);
  });

  it.each([0, 100.1, -5, 12.55, Number.NaN])("rejects a percent of %s", (percent) => {
    expect(priceAdminOverride({ mode: "percent_up", percent, note: "x" }, lines)).toEqual({
      ok: false,
      error: ADMIN_OVERRIDE_PERCENT_ERROR,
    });
  });

  it("rejects a percent sent as a string or left out", () => {
    const asString = { mode: "percent_off", percent: "10", note: "x" } as unknown as AdminOverride;
    const missing = { mode: "percent_off", note: "x" } as unknown as AdminOverride;
    expect(priceAdminOverride(asString, lines).ok).toBe(false);
    expect(priceAdminOverride(missing, lines).ok).toBe(false);
  });

  it("rejects an unknown mode", () => {
    const override = { mode: "percent_sideways", percent: 10, note: "x" } as unknown as AdminOverride;
    expect(priceAdminOverride(override, lines)).toEqual({ ok: false, error: "Unknown override mode" });
  });

  it("treats an explicit amount mode like a request with no mode", () => {
    const result = priceAdminOverride({ mode: "amount", discount_amount: 100, note: "x" }, lines);
    expect(result.ok && result.discountAmount).toBe(100);
  });
});

describe("applyAdminOverride — percentage notes", () => {
  it("records a decimal discount percentage before the reason", () => {
    const result = applyAdminOverride({
      override: { mode: "percent_off", percent: 12.5, note: "Friend of the shop" },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok && result.notes).toBe(
      "[ADMIN OVERRIDE by admin@example.com]: (−12.5% discount) Friend of the shop"
    );
  });

  it("records a price increase before the reason, above any customer note", () => {
    const result = applyAdminOverride({
      override: { mode: "percent_up", percent: 10, note: "Event price" },
      items: worth(1000),
      actingAdminEmail: admin,
      existingNotes: "Gift wrap please",
    });
    expect(result.ok && result.notes).toBe(
      "[ADMIN OVERRIDE by admin@example.com]: (+10% prices) Event price\nGift wrap please"
    );
  });

  it("checks the percentage before the reason", () => {
    const result = applyAdminOverride({
      override: { mode: "percent_up", percent: 0, note: "" },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result).toEqual({ ok: false, error: ADMIN_OVERRIDE_PERCENT_ERROR });
  });

  it("still requires a reason in the percentage modes", () => {
    const result = applyAdminOverride({
      override: { mode: "percent_up", percent: 10, note: " " },
      items: worth(1000),
      actingAdminEmail: admin,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least 3/);
  });
});

describe("isPriceRaised", () => {
  it("is true only for the ADMIN_PRICE_UP marker", () => {
    expect(isPriceRaised({ discount_code: "ADMIN_PRICE_UP" })).toBe(true);
    expect(isPriceRaised({ discount_code: "ADMIN_OVERRIDE" })).toBe(false);
    expect(isPriceRaised({ discount_code: null })).toBe(false);
    expect(isPriceRaised({})).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/utils/admin-override.test.ts`
Expected: FAIL — `Failed to resolve import "./admin-override"`.

- [ ] **Step 4: Make `AdminOverride` a union**

In `lib/types/order.ts`, replace lines 162-168:

```ts
/** Admin-only price override applied at checkout during shadow mode. */
export interface AdminOverride {
  /** Rupees. Server clamps to [0, subtotal] and floors to an integer. */
  discount_amount: number;
  /** Required reason — trimmed length must be 3..500. */
  note: string;
}
```

with:

```ts
export type AdminOverrideMode = "amount" | "percent_off" | "percent_up";

/** Admin-only price override applied at checkout during shadow mode. */
export type AdminOverride =
  | {
      /** Absent on requests sent before the percentage modes existed. */
      mode?: "amount";
      /** Rupees. Server clamps to [0, subtotal] and floors to an integer. */
      discount_amount: number;
      /** Required reason — trimmed length must be 3..500. */
      note: string;
    }
  | {
      /** percent_off lowers the goods total; percent_up raises every unit price. */
      mode: "percent_off" | "percent_up";
      /** 0.1..100, at most one decimal place. */
      percent: number;
      /** Required reason — trimmed length must be 3..500. */
      note: string;
    };
```

- [ ] **Step 5: Write the module**

Create `lib/utils/admin-override.ts`:

```ts
import type { AdminOverride, AdminOverrideMode } from "@/lib/types/order";

// Pure and client-safe: the checkout preview and POST /api/orders both price an
// admin override through this module, so the screen and the stored order agree.

export const ADMIN_OVERRIDE_DISCOUNT_CODE = "ADMIN_OVERRIDE";
/** discount_code marking an order whose unit prices an admin raised (discount_amount is 0). */
export const ADMIN_PRICE_UP_CODE = "ADMIN_PRICE_UP";
export const ADMIN_OVERRIDE_NOTE_MIN = 3;
export const ADMIN_OVERRIDE_NOTE_MAX = 500;
export const ADMIN_OVERRIDE_PERCENT_ERROR =
  "Override percent must be from 0.1 to 100, with at most one decimal";

type AdminOverrideCode = typeof ADMIN_OVERRIDE_DISCOUNT_CODE | typeof ADMIN_PRICE_UP_CODE;

/** The fields pricing needs from a cart line or an order line. */
export interface PricedLine {
  price: number;
  quantity: number;
}

export type AdminOverridePricing<T extends PricedLine> =
  | {
      ok: true;
      mode: AdminOverrideMode;
      /** null in the ₹ amount mode. */
      percent: number | null;
      /** The lines to store: raised for percent_up, the input lines otherwise. */
      items: T[];
      discountCode: AdminOverrideCode;
      discountAmount: number;
    }
  | { ok: false; error: string };

export type ApplyAdminOverrideSuccess<T extends PricedLine> = Extract<
  AdminOverridePricing<T>,
  { ok: true }
> & { notes: string };

export type ApplyAdminOverrideResult<T extends PricedLine> =
  | ApplyAdminOverrideSuccess<T>
  | { ok: false; error: string };

export interface ApplyAdminOverrideInput<T extends PricedLine> {
  override: AdminOverride;
  items: T[];
  actingAdminEmail?: string | null;
  existingNotes?: string | null;
}

/** Σ price × quantity, summed in paise like calculateOrderSummary. */
export function linesSubtotal(items: PricedLine[]): number {
  const paise = items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0);
  return paise / 100;
}

/**
 * A percentage in tenths (12.5 → 125), or null unless it is a number from 0.1
 * to 100 with at most one decimal place.
 */
export function parseOverridePercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const tenths = Math.round(value * 10);
  if (Math.abs(value * 10 - tenths) > 1e-9) return null;
  if (tenths < 1 || tenths > 1000) return null;
  return tenths;
}

/**
 * A unit price raised by `tenths` tenths of a percent, rounded to the nearest
 * rupee with ties up. Kept in integers until the one division: the plain
 * price × (100 + p) / 100 rounds ₹250 at +28.2% (exactly ₹320.50) down to ₹320.
 */
export function raisePrice(price: number, tenths: number): number {
  return Math.round((price * (1000 + tenths)) / 1000);
}

/** Validates the amount or percentage and works out the lines to store and the discount. */
export function priceAdminOverride<T extends PricedLine>(
  override: AdminOverride,
  items: T[]
): AdminOverridePricing<T> {
  const subtotal = linesSubtotal(items);
  // Typed from AdminOverride, but the request body is untrusted JSON: an
  // unknown mode still reaches the "Unknown override mode" branch at runtime.
  const mode = override?.mode ?? "amount";

  if (mode === "amount") {
    const rawAmount = Number((override as { discount_amount?: unknown } | undefined)?.discount_amount);
    if (!Number.isFinite(rawAmount)) {
      return { ok: false, error: "Invalid override discount amount" };
    }
    const discountAmount = Math.max(0, Math.min(subtotal, Math.floor(rawAmount)));
    return { ok: true, mode, percent: null, items, discountCode: ADMIN_OVERRIDE_DISCOUNT_CODE, discountAmount };
  }

  if (mode !== "percent_off" && mode !== "percent_up") {
    return { ok: false, error: "Unknown override mode" };
  }

  const tenths = parseOverridePercent((override as { percent?: unknown }).percent);
  if (tenths === null) return { ok: false, error: ADMIN_OVERRIDE_PERCENT_ERROR };
  const percent = tenths / 10;

  if (mode === "percent_off") {
    const discountAmount = Math.min(subtotal, Math.round((subtotal * tenths) / 1000));
    return { ok: true, mode, percent, items, discountCode: ADMIN_OVERRIDE_DISCOUNT_CODE, discountAmount };
  }

  return {
    ok: true,
    mode,
    percent,
    items: items.map((item) => ({ ...item, price: raisePrice(item.price, tenths) })),
    discountCode: ADMIN_PRICE_UP_CODE,
    discountAmount: 0,
  };
}

/** The reason's error message, or null when it is 3–500 characters after trimming. */
export function overrideNoteError(note: unknown): string | null {
  const trimmed = typeof note === "string" ? note.trim() : "";
  if (trimmed.length < ADMIN_OVERRIDE_NOTE_MIN) {
    return `Override reason must be at least ${ADMIN_OVERRIDE_NOTE_MIN} characters`;
  }
  if (trimmed.length > ADMIN_OVERRIDE_NOTE_MAX) {
    return `Override reason must be at most ${ADMIN_OVERRIDE_NOTE_MAX} characters`;
  }
  return null;
}

/**
 * Pure validator / applier for the admin price override at checkout.
 *
 * - Prices the override with priceAdminOverride (checked before the reason).
 * - Requires the reason (trimmed) to be 3..500 chars.
 * - Prefixes `orders.notes` with `[ADMIN OVERRIDE by <email>]: <reason>`, with
 *   "(−10% discount) " or "(+10% prices) " before the reason in the percentage
 *   modes, so the audit trail sits alongside any existing customer note.
 *
 * NO side effects — safe to unit-test and to call from any route handler.
 */
export function applyAdminOverride<T extends PricedLine>(
  input: ApplyAdminOverrideInput<T>
): ApplyAdminOverrideResult<T> {
  const { override, items, actingAdminEmail, existingNotes } = input;

  const pricing = priceAdminOverride(override, items);
  if (!pricing.ok) return pricing;

  const noteError = overrideNoteError(override?.note);
  if (noteError) return { ok: false, error: noteError };

  // Collapse any embedded CR/LF sequences so the caller can't forge a second
  // audit-looking line by smuggling a newline into the note.
  const sanitizedNote = override.note.trim().replace(/[\r\n]+/g, " ");

  const adminEmail =
    typeof actingAdminEmail === "string" && actingAdminEmail.trim().length > 0
      ? actingAdminEmail.trim()
      : "unknown";

  // Whitespace-only existing notes are treated as absent so the persisted
  // value is clean regardless of whether the caller pre-trims.
  const existing = typeof existingNotes === "string" ? existingNotes.trim() : "";

  const change =
    pricing.mode === "percent_off"
      ? `(−${pricing.percent}% discount) `
      : pricing.mode === "percent_up"
        ? `(+${pricing.percent}% prices) `
        : "";
  const prefix = `[ADMIN OVERRIDE by ${adminEmail}]: ${change}${sanitizedNote}`;
  const notes = existing.length > 0 ? `${prefix}\n${existing}` : prefix;

  return { ...pricing, notes };
}

/** True when an admin raised this order's unit prices (its MRP would be inflated). */
export function isPriceRaised(order: { discount_code?: string | null }): boolean {
  return order.discount_code === ADMIN_PRICE_UP_CODE;
}
```

- [ ] **Step 6: Run the module tests to verify they pass**

Run: `npx vitest run lib/utils/admin-override.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 7: Remove the old copy from checkout-helpers**

In `lib/utils/checkout-helpers.ts`:
- In the type import at the top, delete the line `  AdminOverride,` (keep `OrderItemInput`, `OrderSummary`, `ShippingAddress`).
- Delete the whole `// ─── Admin Override ───` section: from the line `// ─── Admin Override ───────…` through the closing `}` of `applyAdminOverride` (old lines 246-339), leaving `// ─── Session Expiry ───` directly after `calculateOrderSummary`.

Then delete the old test file (its cases now live in `admin-override.test.ts`):

```bash
git rm lib/utils/checkout-helpers.test.ts
```

- [ ] **Step 8: Point the route at the new module**

In `app/api/orders/route.ts`, replace:

```ts
import {
  validateAndFetchAddresses,
  validateItemPrices,
  calculateOrderSummary,
  applyAdminOverride,
} from "@/lib/utils/checkout-helpers";
```

with:

```ts
import {
  validateAndFetchAddresses,
  validateItemPrices,
  calculateOrderSummary,
} from "@/lib/utils/checkout-helpers";
import { applyAdminOverride } from "@/lib/utils/admin-override";
```

and in the `applyAdminOverride({ … })` call replace `subtotal: orderSummary.subtotal,` with `items,`.

- [ ] **Step 9: Let the route tests use the real override**

In `app/api/orders/route.test.ts`:
- Remove `applyAdminOverrideMock,` from the destructured names at the top and `applyAdminOverrideMock: vi.fn(),` from the object returned by `vi.hoisted`.
- In `vi.mock('@/lib/utils/checkout-helpers', …)` remove the line `applyAdminOverride: applyAdminOverrideMock,`.
- Replace the test `'applies admin_override: ignores coupon, uses helper output, passes override metadata to audit'` with:

```ts
  it('applies admin_override: ignores coupon, stores the discount and audit note, flags the audit event', async () => {
    getEffectiveUserMock.mockResolvedValue({
      ok: true,
      userId: TARGET_ID,
      actingAdminId: ADMIN_ID,
      client: clientMock,
      sessionUser: { id: ADMIN_ID, email: 'admin@example.com' },
      effectiveUser: { id: TARGET_ID, email: 'target@example.com' },
    });

    const res = await POST(makeRequest({
      items: [{ id: 'p1', name: 'Prod', price: 1000, quantity: 1 }],
      shipping_address_id: 'addr-1',
      coupon_code: 'IGNORED',
      admin_override: { discount_amount: 250, note: 'phone-order' },
    }));
    expect(res.status).toBe(200);
    expect(validateAndApplyOfferMock).not.toHaveBeenCalled();

    const inserted = (insertOrdersMock.mock.calls[0] as any[])[0];
    expect(inserted.discount_code).toBe('ADMIN_OVERRIDE');
    expect(inserted.discount_amount).toBe(250);
    expect(inserted.notes).toBe('[ADMIN OVERRIDE by admin@example.com]: phone-order');

    expect(logImpersonationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: ADMIN_ID,
        event_type: 'order_placed',
        metadata: expect.objectContaining({ override_applied: true }),
      })
    );
  });
```

- In `'returns 403 when admin_override is sent outside shadow mode'`, delete the line `expect(applyAdminOverrideMock).not.toHaveBeenCalled();` (the `insertOrdersMock` assertion stays).

- [ ] **Step 10: Run the affected tests and the type check**

Run: `npx vitest run lib/utils/admin-override.test.ts app/api/orders/route.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`
Expected: `24`.

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "admin-override|checkout-helpers|api/orders/route|types/order"`
Expected: no output.

- [ ] **Step 11: Commit**

```bash
git add lib/utils/admin-override.ts lib/utils/admin-override.test.ts lib/utils/checkout-helpers.ts lib/types/order.ts app/api/orders/route.ts app/api/orders/route.test.ts
git commit -m "feat(checkout): shared admin override pricing with percent off and percent up"
```

---

### Task 2: `/api/orders` stores percentage overrides

**Files:**
- Modify: `app/api/orders/route.ts:144-188` (override before the summary), `:224-234` (item rows), `:275-278` (audit metadata), `:316` and `:326` (Telegram items, response items)
- Test: `app/api/orders/route.test.ts`

**Interfaces:**
- Consumes: `applyAdminOverride`, `ApplyAdminOverrideSuccess` from `@/lib/utils/admin-override` (Task 1); `OrderItemInput` from `@/lib/types/order`.
- Produces: stored order shape per the spec table: `percent_up` → raised `order_items.price`, `subtotal = Σ price × quantity`, `discount_code 'ADMIN_PRICE_UP'`, `discount_amount 0`; audit metadata `{ override_applied, override_mode, override_percent }`.

- [ ] **Step 1: Write the failing tests**

In `app/api/orders/route.test.ts`, add this block inside `describe('POST /api/orders', …)`, after the `'returns 403 when admin_override is sent outside shadow mode'` test:

```ts
  describe('admin override by percentage', () => {
    const lines = [
      { id: 'p1', name: 'Muslin frock', price: 899, quantity: 2 },
      { id: 'p2', name: 'Pyjama', price: 649, quantity: 1 },
    ];

    beforeEach(async () => {
      // The real summary, so the stored subtotal is the sum of the stored lines.
      const actual = await vi.importActual<typeof import('@/lib/utils/checkout-helpers')>(
        '@/lib/utils/checkout-helpers'
      );
      calculateOrderSummaryMock.mockImplementation(actual.calculateOrderSummary);
      resolveOrderVariantsMock.mockResolvedValue({ ok: true, skus: ['p1-v', 'p2-v'] });
      getEffectiveUserMock.mockResolvedValue({
        ok: true,
        userId: TARGET_ID,
        actingAdminId: ADMIN_ID,
        client: clientMock,
        sessionUser: { id: ADMIN_ID, email: 'admin@example.com' },
        effectiveUser: { id: TARGET_ID, email: 'target@example.com' },
      });
    });

    it('percent_up stores raised unit prices and a subtotal equal to their sum', async () => {
      const res = await POST(makeRequest({
        items: lines,
        shipping_address_id: 'addr-1',
        admin_override: { mode: 'percent_up', percent: 10, note: 'Event price' },
      }));
      expect(res.status).toBe(200);

      const stored = (insertItemsMock.mock.calls[0] as any[])[0];
      expect(stored.map((l: any) => [l.product_id, l.price, l.quantity, l.sku])).toEqual([
        ['p1', 989, 2, 'p1-v'],
        ['p2', 714, 1, 'p2-v'],
      ]);
      const storedSum = stored.reduce((s: number, l: any) => s + l.price * l.quantity, 0);

      const inserted = (insertOrdersMock.mock.calls[0] as any[])[0];
      expect(inserted).toMatchObject({
        subtotal: storedSum,
        discount_code: 'ADMIN_PRICE_UP',
        discount_amount: 0,
        delivery_charge: 0,
        total_amount: 2692,
        notes: '[ADMIN OVERRIDE by admin@example.com]: (+10% prices) Event price',
      });
      expect(storedSum).toBe(2692);

      expect(notifyNewOrderMock).toHaveBeenCalledWith(
        expect.objectContaining({ discountCode: 'ADMIN_PRICE_UP', discountAmount: 0, subtotal: 2692 }),
        expect.anything()
      );
      const body = await res.json();
      expect(body.order.items.map((i: any) => i.price)).toEqual([989, 714]);
    });

    it('checks the catalogue prices the client sent, not the raised ones', async () => {
      await POST(makeRequest({
        items: lines,
        shipping_address_id: 'addr-1',
        admin_override: { mode: 'percent_up', percent: 10, note: 'Event price' },
      }));
      expect(validateItemPricesMock).toHaveBeenCalledWith(clientMock, lines);
    });

    it('a raise that crosses the free-delivery threshold makes delivery free', async () => {
      // ₹1,900 pays ₹90 delivery; raised 10% to ₹2,090 it passes ₹1,999.
      const res = await POST(makeRequest({
        items: [{ id: 'p1', name: 'Gift set', price: 1900, quantity: 1 }],
        shipping_address_id: 'addr-1',
        admin_override: { mode: 'percent_up', percent: 10, note: 'Event price' },
      }));
      expect(res.status).toBe(200);
      const inserted = (insertOrdersMock.mock.calls[0] as any[])[0];
      expect(inserted).toMatchObject({ subtotal: 2090, delivery_charge: 0, total_amount: 2090 });
    });

    it('ignores a coupon sent with a raise', async () => {
      const res = await POST(makeRequest({
        items: lines,
        shipping_address_id: 'addr-1',
        coupon_code: 'EARLY5',
        admin_override: { mode: 'percent_up', percent: 10, note: 'Event price' },
      }));
      expect(res.status).toBe(200);
      expect(validateAndApplyOfferMock).not.toHaveBeenCalled();
      const inserted = (insertOrdersMock.mock.calls[0] as any[])[0];
      expect(inserted).toMatchObject({ discount_code: 'ADMIN_PRICE_UP', discount_amount: 0 });
    });

    it('percent_off stores the rounded discount with ADMIN_OVERRIDE and catalogue prices', async () => {
      const res = await POST(makeRequest({
        items: lines,
        shipping_address_id: 'addr-1',
        admin_override: { mode: 'percent_off', percent: 12.5, note: 'Friend of the shop' },
      }));
      expect(res.status).toBe(200);

      const stored = (insertItemsMock.mock.calls[0] as any[])[0];
      expect(stored.map((l: any) => l.price)).toEqual([899, 649]);
      const inserted = (insertOrdersMock.mock.calls[0] as any[])[0];
      // 12.5% of ₹2,447 = ₹305.875 → ₹306; ₹2,141 is over ₹1,999, so delivery is free.
      expect(inserted).toMatchObject({
        subtotal: 2447,
        discount_code: 'ADMIN_OVERRIDE',
        discount_amount: 306,
        delivery_charge: 0,
        total_amount: 2141,
        notes: '[ADMIN OVERRIDE by admin@example.com]: (−12.5% discount) Friend of the shop',
      });
    });

    it('rejects an out-of-range percent with 400 and writes nothing', async () => {
      const res = await POST(makeRequest({
        items: lines,
        shipping_address_id: 'addr-1',
        admin_override: { mode: 'percent_up', percent: 150, note: 'Event price' },
      }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(
        'Override percent must be from 0.1 to 100, with at most one decimal'
      );
      expect(insertOrdersMock).not.toHaveBeenCalled();
      expect(insertItemsMock).not.toHaveBeenCalled();
    });

    it('records the override mode and percent in the impersonation audit', async () => {
      await POST(makeRequest({
        items: lines,
        shipping_address_id: 'addr-1',
        admin_override: { mode: 'percent_up', percent: 10, note: 'Event price' },
      }));
      expect(logImpersonationEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            override_applied: true,
            override_mode: 'percent_up',
            override_percent: 10,
          }),
        })
      );
    });

    it('records the ₹ mode with no percent', async () => {
      await POST(makeRequest({
        items: lines,
        shipping_address_id: 'addr-1',
        admin_override: { discount_amount: 100, note: 'phone-order' },
      }));
      expect(logImpersonationEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ override_mode: 'amount', override_percent: null }),
        })
      );
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/api/orders/route.test.ts -t "admin override by percentage"`
Expected: FAIL — `'percent_up stores raised unit prices…'` gets prices `[899, 649]` instead of `[989, 714]`; the audit tests miss `override_mode`. (`'rejects an out-of-range percent…'` and `'percent_off…'` may already pass, since Task 1's module runs inside the route.)

- [ ] **Step 3: Price the override before the summary**

In `app/api/orders/route.ts`:

Change the type import on line 3 to add `OrderItemInput`:

```ts
import type { CreateOrderRequest, OrderCreate, OrderItemInput, OrderStatus, ShippingAddress } from "@/lib/types/order";
```

Change the admin-override import to:

```ts
import { applyAdminOverride, type ApplyAdminOverrideSuccess } from "@/lib/utils/admin-override";
```

Replace the block from `const orderSummary = calculateOrderSummary(items);` through the closing `}` of the `else if (coupon_code) { … }` branch (old lines 144-184) with:

```ts
    const trimmedCustomerNotes = notes?.trim();
    const normalizedCustomerNotes =
      trimmedCustomerNotes && trimmedCustomerNotes.length > 0
        ? trimmedCustomerNotes
        : null;

    // An override can re-price the lines (percent_up), so it runs before the
    // summary: subtotal must equal Σ price × quantity of the stored lines, or
    // the paid-status ITEMS_MISMATCH check refuses the order. The prices it
    // starts from are the catalogue prices validateItemPrices just checked.
    let appliedOverride: ApplyAdminOverrideSuccess<OrderItemInput> | null = null;
    if (admin_override && actingAdminId) {
      const overrideResult = applyAdminOverride({
        override: admin_override,
        items,
        actingAdminEmail: sessionUser.email ?? null,
        existingNotes: normalizedCustomerNotes,
      });

      if (!overrideResult.ok) {
        return NextResponse.json(
          { error: overrideResult.error },
          { status: 400 }
        );
      }
      appliedOverride = overrideResult;
    }
    const pricedItems = appliedOverride ? appliedOverride.items : items;

    const orderSummary = calculateOrderSummary(pricedItems);

    let discountCode: string | null = null;
    let discountAmount = 0;
    let orderNotes: string | null = normalizedCustomerNotes;

    if (appliedOverride) {
      discountCode = appliedOverride.discountCode;
      discountAmount = appliedOverride.discountAmount;
      orderNotes = appliedOverride.notes;
      // coupon_code is intentionally ignored when admin_override is applied.
    } else if (coupon_code) {
      const offerResult = validateAndApplyOffer(coupon_code, orderSummary.subtotal);
      if (!offerResult.ok) {
        return NextResponse.json(
          { error: "invalid_coupon", message: offerResult.error },
          { status: 422 }
        );
      }
      discountCode = offerResult.data.discountCode;
      discountAmount = offerResult.data.discountAmount;
    }
```

- [ ] **Step 4: Store, announce and return the priced lines**

Still in `app/api/orders/route.ts`:
- `const itemRows = items.map((item, index) => ({` → `const itemRows = pricedItems.map((item, index) => ({`
- In the `logImpersonationEvent` metadata, replace `override_applied: Boolean(admin_override),` with:

```ts
            override_applied: Boolean(appliedOverride),
            override_mode: appliedOverride?.mode ?? null,
            override_percent: appliedOverride?.percent ?? null,
```

- In `notifyNewOrder`, `items: items.map((i) => ({ name: i.name, quantity: i.quantity, size: i.size ?? null })),` → `items: pricedItems.map((i) => ({ name: i.name, quantity: i.quantity, size: i.size ?? null })),`
- In the response, `items: mapOrderItemInputs(items),` → `items: mapOrderItemInputs(pricedItems),`

Leave `deliveryChargeFor(discountedSubtotal, fulfilment, items.length)` as it is (a line count, unchanged by pricing).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run app/api/orders/route.test.ts`
Expected: PASS (the whole file, including the existing stall-pickup and rollback tests).

Run: `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`
Expected: `24`.

- [ ] **Step 6: Commit**

```bash
git add app/api/orders/route.ts app/api/orders/route.test.ts
git commit -m "feat(orders): store percentage admin overrides; raised lines set the subtotal"
```

---

### Task 3: Checkout — three override modes and a matching preview

**Files:**
- Modify: `app/checkout/page.tsx` (imports, constants, state, totals, request body, admin tools block, both `<OrderSummary>` calls, `OrderSummary` component)
- Test: `app/checkout/page.test.tsx`

**Interfaces:**
- Consumes (from `@/lib/utils/admin-override`): `ADMIN_OVERRIDE_DISCOUNT_CODE`, `ADMIN_OVERRIDE_NOTE_MAX`, `ADMIN_OVERRIDE_NOTE_MIN`, `linesSubtotal`, `overrideNoteError`, `priceAdminOverride`. From `@/lib/types/order`: `AdminOverride`, `AdminOverrideMode`.
- Produces: request body `admin_override` = `{ mode: "amount", discount_amount, note }` or `{ mode: "percent_off" | "percent_up", percent, note }`.

- [ ] **Step 1: Write the failing tests**

In `app/checkout/page.test.tsx`, change the vitest import to:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

and append:

```tsx
describe("checkout — admin price override in shadow mode", () => {
  beforeEach(() => {
    h.auth.impersonation.active = true;
  });
  afterEach(() => {
    h.auth.impersonation.active = false;
    vi.unstubAllGlobals();
  });

  const openOverride = () => {
    openPaymentStep();
    fireEvent.click(screen.getByLabelText("Apply custom discount override"));
  };
  const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it("raises the subtotal, shows the raise under it and hides the MRP rows", () => {
    openOverride();
    expect(screen.getByText("Total MRP")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Increase %"));
    type("Increase (%)", "10");

    expect(screen.getByText("Includes admin price +10% (+₹100)")).toBeInTheDocument();
    expect(screen.getByText("₹1100")).toBeInTheDocument();
    // ₹1,100 is under ₹1,999, so ₹90 delivery: total ₹1,190 (summary and bottom bar).
    expect(screen.getAllByText("₹1190")).toHaveLength(2);
    expect(screen.queryByText("Total MRP")).not.toBeInTheDocument();
  });

  it("shows a decimal raise as typed", () => {
    openOverride();
    fireEvent.click(screen.getByLabelText("Increase %"));
    type("Increase (%)", "12.5");
    expect(screen.getByText("Includes admin price +12.5% (+₹125)")).toBeInTheDocument();
  });

  it("+100% on ₹1,000 makes delivery free in the preview", () => {
    openOverride();
    fireEvent.click(screen.getByLabelText("Increase %"));
    type("Increase (%)", "100");
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getAllByText("₹2000").length).toBeGreaterThan(0);
  });

  it("shows a percentage discount as an ADMIN_OVERRIDE discount row", () => {
    openOverride();
    fireEvent.click(screen.getByLabelText("Discount %"));
    type("Discount (%)", "10");
    expect(screen.getByText("Discount (ADMIN_OVERRIDE)")).toBeInTheDocument();
    expect(screen.getByText("−₹100")).toBeInTheDocument();
    expect(screen.getAllByText("₹990")).toHaveLength(2);
  });

  it("shows a ₹ discount as an ADMIN_OVERRIDE discount row too", () => {
    openOverride();
    type("Discount amount (₹)", "250");
    expect(screen.getByText("Discount (ADMIN_OVERRIDE)")).toBeInTheDocument();
    expect(screen.getByText("−₹250")).toBeInTheDocument();
  });

  it("clears the number when the mode changes", () => {
    openOverride();
    fireEvent.click(screen.getByLabelText("Discount %"));
    type("Discount (%)", "10");
    fireEvent.click(screen.getByLabelText("Increase %"));
    expect(screen.getByLabelText("Increase (%)")).toHaveValue(null);
  });

  it("blocks an out-of-range percentage", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    openOverride();
    fireEvent.click(screen.getByLabelText("Increase %"));
    type("Increase (%)", "150");
    type("Reason (required)", "Event price");

    expect(screen.getByText("Enter a percentage from 0.1 to 100, with at most one decimal.")).toBeInTheDocument();
    const place = screen.getByRole("button", { name: "Place Order" });
    expect(place).toBeDisabled();
    fireEvent.click(place);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends catalogue prices with the mode, percentage and reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ payment_url: "/payment/o1" }) });
    vi.stubGlobal("fetch", fetchMock);
    openOverride();
    fireEvent.click(screen.getByLabelText("Increase %"));
    type("Increase (%)", "10");
    type("Reason (required)", "  Event price ");
    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.items[0].price).toBe(1000);
    expect(body.admin_override).toEqual({ mode: "percent_up", percent: 10, note: "Event price" });
    expect(body).not.toHaveProperty("coupon_code");
  });

  it("sends the ₹ mode with an explicit mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ payment_url: "/payment/o1" }) });
    vi.stubGlobal("fetch", fetchMock);
    openOverride();
    type("Discount amount (₹)", "250");
    type("Reason (required)", "Wholesale");
    fireEvent.click(screen.getByRole("button", { name: "Place Order" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.admin_override).toEqual({ mode: "amount", discount_amount: 250, note: "Wholesale" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/checkout/page.test.tsx`
Expected: the three existing tests PASS; the new ones FAIL (`Unable to find a label with the text of: Increase %`, and the ₹-mode tests fail on the missing `Discount (ADMIN_OVERRIDE)` row and the missing `mode` field).

- [ ] **Step 3: Imports, constants and state**

In `app/checkout/page.tsx`:

Replace `import type { FulfilmentMethod } from "@/lib/types/order";` with:

```ts
import type { AdminOverride, AdminOverrideMode, FulfilmentMethod } from "@/lib/types/order";
import {
  ADMIN_OVERRIDE_DISCOUNT_CODE,
  ADMIN_OVERRIDE_NOTE_MAX,
  ADMIN_OVERRIDE_NOTE_MIN,
  linesSubtotal,
  overrideNoteError,
  priceAdminOverride,
} from "@/lib/utils/admin-override";
```

Replace the two local constants:

```ts
const ADMIN_OVERRIDE_NOTE_MIN_LEN = 3;
const ADMIN_OVERRIDE_NOTE_MAX_LEN = 500;
```

with:

```ts
const OVERRIDE_MODES: { value: AdminOverrideMode; label: string; field: string }[] = [
  { value: "amount", label: "Discount ₹", field: "Discount amount (₹)" },
  { value: "percent_off", label: "Discount %", field: "Discount (%)" },
  { value: "percent_up", label: "Increase %", field: "Increase (%)" },
];
```

Replace the override state:

```ts
  const [adminOverrideEnabled, setAdminOverrideEnabled] = useState(false);
  const [adminOverrideAmount, setAdminOverrideAmount] = useState("");
  const [adminOverrideNote, setAdminOverrideNote] = useState("");
```

with:

```ts
  const [adminOverrideEnabled, setAdminOverrideEnabled] = useState(false);
  const [adminOverrideMode, setAdminOverrideMode] = useState<AdminOverrideMode>("amount");
  const [adminOverrideValue, setAdminOverrideValue] = useState("");
  const [adminOverrideNote, setAdminOverrideNote] = useState("");
```

- [ ] **Step 4: Totals from the shared pricing**

Replace everything from `const overrideActive = impersonation.active && adminOverrideEnabled;` through `const total = discountedSubtotal + deliveryCharge;` (old lines 103-127) with:

```ts
  const overrideActive = impersonation.active && adminOverrideEnabled;
  const activeOverrideMode = OVERRIDE_MODES.find((m) => m.value === adminOverrideMode) ?? OVERRIDE_MODES[0];
  const parsedOverrideValue = (() => {
    const trimmed = adminOverrideValue.trim();
    if (trimmed.length === 0) return NaN;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : NaN;
  })();
  const trimmedOverrideNote = adminOverrideNote.trim();
  const overrideRequest: AdminOverride =
    adminOverrideMode === "amount"
      ? { mode: "amount", discount_amount: parsedOverrideValue, note: trimmedOverrideNote }
      : { mode: adminOverrideMode, percent: parsedOverrideValue, note: trimmedOverrideNote };
  // The same pricing POST /api/orders runs, so the preview matches the stored order.
  const overridePricing = priceAdminOverride(overrideRequest, cart);
  const overrideValueValid =
    adminOverrideMode === "amount"
      ? Number.isInteger(parsedOverrideValue) && parsedOverrideValue >= 0 && parsedOverrideValue <= subtotal
      : overridePricing.ok;
  const overrideNoteValid = overrideNoteError(adminOverrideNote) === null;
  const overrideValid = overrideValueValid && overrideNoteValid;
  const appliedOverride = overrideActive && overrideValueValid && overridePricing.ok ? overridePricing : null;

  const summaryItems = appliedOverride ? appliedOverride.items : cart;
  const goodsSubtotal = appliedOverride ? linesSubtotal(appliedOverride.items) : subtotal;
  const priceRaise =
    appliedOverride?.mode === "percent_up"
      ? { percent: appliedOverride.percent ?? 0, amount: goodsSubtotal - subtotal }
      : null;
  const discountAmount = overrideActive ? appliedOverride?.discountAmount ?? 0 : organicDiscount;
  const discountCode = overrideActive ? ADMIN_OVERRIDE_DISCOUNT_CODE : offer?.code ?? null;
  const discountedSubtotal = Math.max(0, goodsSubtotal - discountAmount);
  const deliveryCharge = deliveryChargeFor(discountedSubtotal, fulfilment, cart.length);
  const readyToContinue = canContinueCheckout({ fulfilment, selectedAddressId });
  const total = discountedSubtotal + deliveryCharge;
```

- [ ] **Step 5: Request body**

In `handlePlaceOrder`, replace:

```ts
          ...(overrideActive
            ? { admin_override: { discount_amount: overrideAmountInt, note: trimmedOverrideNote } }
            : offer
```

with:

```ts
          ...(overrideActive
            ? { admin_override: overrideRequest }
            : offer
```

The `items` sent stay `cart.map(…)` at catalogue prices. Do not send `summaryItems`.

- [ ] **Step 6: Admin tools block**

Replace the whole `{impersonation.active && ( … )}` block (from `{impersonation.active && (` down to the `)}` just before the payment step's `<OrderSummary`) with:

```tsx
            {impersonation.active && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <h3 className="text-sm font-semibold text-amber-900 mb-1">Admin tools — Shadow mode</h3>
                <p className="text-xs text-amber-800 mb-3">
                  Overrides apply only to this order. Customer coupons are ignored when override is active.
                </p>
                <label className="flex items-start gap-2 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={adminOverrideEnabled}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setAdminOverrideEnabled(next);
                      if (!next) {
                        setAdminOverrideMode("amount");
                        setAdminOverrideValue("");
                        setAdminOverrideNote("");
                      }
                    }}
                  />
                  <span className="text-sm text-amber-900">Apply custom discount override</span>
                </label>
                {adminOverrideEnabled && (
                  <div className="space-y-3">
                    <fieldset>
                      <legend className="sr-only">Override type</legend>
                      <div className="flex flex-wrap gap-2">
                        {OVERRIDE_MODES.map((m) => (
                          <label
                            key={m.value}
                            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm text-amber-900 cursor-pointer ${
                              adminOverrideMode === m.value ? "border-amber-500 bg-white font-semibold" : "border-amber-300"
                            }`}
                          >
                            <input
                              type="radio"
                              name="admin-override-mode"
                              value={m.value}
                              checked={adminOverrideMode === m.value}
                              onChange={() => {
                                setAdminOverrideMode(m.value);
                                setAdminOverrideValue("");
                              }}
                            />
                            {m.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div>
                      <Label htmlFor="admin-override-value" className="text-sm text-amber-900">
                        {activeOverrideMode.field}
                      </Label>
                      <Input
                        id="admin-override-value"
                        type="number"
                        inputMode={adminOverrideMode === "amount" ? "numeric" : "decimal"}
                        min={adminOverrideMode === "amount" ? 0 : 0.1}
                        max={adminOverrideMode === "amount" ? subtotal : 100}
                        step={adminOverrideMode === "amount" ? 1 : 0.1}
                        value={adminOverrideValue}
                        onChange={(e) => setAdminOverrideValue(e.target.value)}
                        placeholder={adminOverrideMode === "amount" ? "0" : "10"}
                        className="bg-white"
                      />
                      {!overrideValueValid && adminOverrideValue.length > 0 && (
                        <p className="mt-1 text-xs text-red-600">
                          {adminOverrideMode === "amount"
                            ? `Amount must be a non-negative integer no greater than the subtotal (₹${subtotal.toFixed(0)}).`
                            : "Enter a percentage from 0.1 to 100, with at most one decimal."}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="admin-override-note" className="text-sm text-amber-900">
                        Reason (required)
                      </Label>
                      <Textarea
                        id="admin-override-note"
                        rows={2}
                        value={adminOverrideNote}
                        maxLength={ADMIN_OVERRIDE_NOTE_MAX}
                        onChange={(e) => setAdminOverrideNote(e.target.value)}
                        placeholder="e.g. Wholesale, phone-order negotiated price — min 3 chars"
                        className="bg-white"
                      />
                      {!overrideNoteValid && adminOverrideNote.length > 0 && (
                        <p className="mt-1 text-xs text-red-600">
                          Reason must be {ADMIN_OVERRIDE_NOTE_MIN}–{ADMIN_OVERRIDE_NOTE_MAX} characters.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
```

- [ ] **Step 7: Order summary**

Replace both `<OrderSummary … />` calls. The address step one:

```tsx
            <OrderSummary
              items={summaryItems}
              subtotal={goodsSubtotal}
              discountAmount={discountAmount}
              deliveryCharge={deliveryCharge}
              total={total}
              discountCode={discountCode}
              priceRaise={priceRaise}
              fulfilment={fulfilment}
              showItems
            />
```

The payment step one: the same props with `showItems={false}`.

Replace the `OrderSummary` component's signature and its linen summary box. The new signature:

```tsx
function OrderSummary({
  items,
  subtotal,
  discountAmount,
  deliveryCharge,
  total,
  discountCode,
  priceRaise,
  fulfilment,
  showItems,
}: {
  items: { id: string; name: string; price: number; quantity: number; image?: string; size?: string; color?: string }[];
  subtotal: number;
  discountAmount: number;
  deliveryCharge: number;
  total: number;
  /** The offer code, or ADMIN_OVERRIDE while an admin override is on. */
  discountCode: string | null;
  /** Set while an admin raises the prices: the MRP rows are hidden then. */
  priceRaise: { percent: number; amount: number } | null;
  fulfilment: FulfilmentMethod;
  showItems: boolean;
}) {
```

In its body, change `{cart.map((item) => (` to `{items.map((item) => (`, and replace the start of the linen box, from `<MrpSummaryRows items={cart} />` through the discount row's closing `)}`, with:

```tsx
        {!priceRaise && <MrpSummaryRows items={items} />}
        <div className="flex items-center justify-between text-sm">
          <span className="text-cb-muted-fg">Subtotal</span>
          <span className="font-semibold text-cb-fg">₹{subtotal.toFixed(0)}</span>
        </div>
        {priceRaise && (
          <p className="text-xs text-cb-muted-fg">
            Includes admin price +{priceRaise.percent}% (+₹{priceRaise.amount.toFixed(0)})
          </p>
        )}
        {discountCode && discountAmount > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-cb-muted-fg">Discount ({discountCode})</span>
            <span className="font-semibold text-cb-terracotta">−₹{discountAmount.toFixed(0)}</span>
          </div>
        )}
```

The Delivery and Total rows stay as they are.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run app/checkout/page.test.tsx`
Expected: PASS (all 12).

Run: `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`
Expected: `24`.

Run: `npx eslint app/checkout/page.tsx app/checkout/page.test.tsx`
Expected: no errors. The old names `adminOverrideAmount`, `overrideAmountInt` and `ADMIN_OVERRIDE_NOTE_MIN_LEN` must not appear: `grep -n "overrideAmount\|NOTE_M.._LEN" app/checkout/page.tsx` prints nothing.

- [ ] **Step 9: Commit**

```bash
git add app/checkout/page.tsx app/checkout/page.test.tsx
git commit -m "feat(checkout): admin override by ₹, discount % or increase %, with a matching preview"
```

---

### Task 4: Customer order pages hide the MRP saving on raised orders

**Files:**
- Modify: `lib/utils/discount.ts` (add `orderMrpSavings`)
- Test: `lib/utils/discount.test.ts`
- Modify: `app/orders/page.tsx:33` (import) and `:370` (card)
- Modify: `app/orders/[id]/page.tsx:32` (import) and `:290` (bill)
- Test: `app/orders/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `isPriceRaised` from `@/lib/utils/admin-override` (Task 1).
- Produces: `export function orderMrpSavings(order: { items: { price: number; quantity: number }[]; created_at: string; discount_code?: string | null }): number` in `@/lib/utils/discount`.

- [ ] **Step 1: Write the failing tests**

In `lib/utils/discount.test.ts`, change the import to:

```ts
import { getDiscountedPrice, mrpFor, mrpTotals, orderMrpSavings } from "./discount";
```

and append:

```ts
describe("orderMrpSavings", () => {
  const items = [
    { price: 450, quantity: 2 },
    { price: 599, quantity: 1 },
  ];
  const placed = "2026-10-02T10:00:00+05:30";

  it("reports the MRP saving for an ordinary order", () => {
    expect(orderMrpSavings({ items, created_at: placed, discount_code: null })).toBe(167);
  });

  it("reports no saving when an admin raised the prices", () => {
    expect(orderMrpSavings({ items, created_at: placed, discount_code: "ADMIN_PRICE_UP" })).toBe(0);
  });

  it("keeps the saving for an admin discount", () => {
    expect(orderMrpSavings({ items, created_at: placed, discount_code: "ADMIN_OVERRIDE" })).toBe(167);
  });

  it("reports no saving for an order placed before the MRP was shown", () => {
    expect(orderMrpSavings({ items, created_at: "2026-09-26T18:29:59Z" })).toBe(0);
  });
});
```

In `app/orders/[id]/page.test.tsx`, append:

```tsx
describe("order details — bill", () => {
  it("shows the MRP rows for an ordinary order", async () => {
    render(<OrderDetailsPage />);
    await screen.findByText("Bill details");
    expect(screen.getByText("Total MRP")).toBeInTheDocument();
  });

  it("shows no MRP rows and no discount row when an admin raised the prices", async () => {
    Object.assign(h.order, {
      discount_code: "ADMIN_PRICE_UP",
      discount_amount: 0,
      subtotal: 1100,
      total_amount: 1190,
      items: [{ id: "p1", name: "Frock", price: 1100, quantity: 1, image: "", size: "3-4Y" }],
    });
    render(<OrderDetailsPage />);
    await screen.findByText("Bill details");
    expect(screen.queryByText("Total MRP")).not.toBeInTheDocument();
    expect(screen.queryByText("Discount on MRP")).not.toBeInTheDocument();
    expect(screen.queryByText(/Discount \(ADMIN_PRICE_UP\)/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/utils/discount.test.ts "app/orders/[id]/page.test.tsx"`
Expected: FAIL — `orderMrpSavings is not a function` (or an export error), and the raised-order bill test finds "Total MRP".

- [ ] **Step 3: Add `orderMrpSavings`**

In `lib/utils/discount.ts`, add below the existing `import` line:

```ts
import { isPriceRaised } from '@/lib/utils/admin-override'
```

and append at the end of the file:

```ts
/**
 * The "Saved ₹X on MRP" figure for an order card. None when an admin raised the
 * prices: the MRP worked out from a raised price would be inflated.
 */
export function orderMrpSavings(order: {
  items: { price: number; quantity: number }[]
  created_at: string
  discount_code?: string | null
}): number {
  if (isPriceRaised(order)) return 0
  return mrpTotals(order.items, order.created_at).mrpSavings
}
```

- [ ] **Step 4: Use it on the order pages**

In `app/orders/page.tsx`: change `import { mrpTotals } from "@/lib/utils/discount";` to `import { orderMrpSavings } from "@/lib/utils/discount";` and line 370 `const { mrpSavings } = mrpTotals(order.items, order.created_at);` to:

```tsx
  const mrpSavings = orderMrpSavings(order);
```

In `app/orders/[id]/page.tsx`: add `import { isPriceRaised } from "@/lib/utils/admin-override";` under the `MrpSummaryRows` import, and replace line 290:

```tsx
            <MrpSummaryRows items={order.items} placedAt={order.created_at} />
```

with:

```tsx
            {!isPriceRaised(order) && <MrpSummaryRows items={order.items} placedAt={order.created_at} />}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/utils/discount.test.ts "app/orders/[id]/page.test.tsx"`
Expected: PASS.

Run: `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`
Expected: `24`.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/discount.ts lib/utils/discount.test.ts app/orders/page.tsx "app/orders/[id]/page.tsx" "app/orders/[id]/page.test.tsx"
git commit -m "fix(orders): no MRP saving on orders whose prices an admin raised"
```

---

### Task 5: Telegram flags raised orders and drops "−₹0" discount lines

**Files:**
- Modify: `lib/services/telegram.ts` (`buildNewOrderText` ~line 192, `notifyOrderPlaced` ~line 294, one new helper)
- Test: `lib/services/telegram.test.ts`

**Interfaces:**
- Consumes: `ADMIN_PRICE_UP_CODE` from `@/lib/utils/admin-override` (Task 1).
- Produces: nothing new for other tasks.

- [ ] **Step 1: Write the failing tests**

In `lib/services/telegram.test.ts`, add inside `describe("buildNewOrderText", …)`:

```ts
  it("prints the discount when it is above ₹0", () => {
    const text = buildNewOrderText({ ...base, discountCode: "EARLY5", discountAmount: 52 }, "HEADER", "now");
    expect(text).toContain("🏷️ Discount (EARLY5): −₹52");
  });

  it("prints no discount line for a ₹0 discount", () => {
    const text = buildNewOrderText({ ...base, discountCode: "ADMIN_OVERRIDE", discountAmount: 0 }, "HEADER", "now");
    expect(text).not.toContain("Discount");
  });

  it("tells the owner an admin raised the prices", () => {
    const text = buildNewOrderText({ ...base, discountCode: "ADMIN_PRICE_UP", discountAmount: 0 }, "HEADER", "now");
    expect(text).toContain("📈 Prices raised by admin");
    expect(text).not.toContain("Discount");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/services/telegram.test.ts`
Expected: FAIL — the ₹0 test finds "Discount (ADMIN_OVERRIDE): −₹0", and the raised test finds no "📈" line.

- [ ] **Step 3: One helper for both messages**

`lib/services/telegram.ts` has no imports yet. Add this one after its three header comment lines, above `const BOT_TOKEN = …`, with a blank line on each side:

```ts
import { ADMIN_PRICE_UP_CODE } from "@/lib/utils/admin-override";
```

Add this function just above `export function buildNewOrderText`:

```ts
/** The pricing line for an admin price raise or a discount; empty when there is neither. */
function adjustmentLine(discountCode: string | null, discountAmount: number): string {
  if (discountCode === ADMIN_PRICE_UP_CODE) return "📈 Prices raised by admin\n";
  if (discountCode && discountAmount > 0) {
    return `🏷️ Discount (${escapeHtml(discountCode)}): −₹${discountAmount.toLocaleString("en-IN")}\n`;
  }
  return "";
}
```

In **both** `buildNewOrderText` and `notifyOrderPlaced`, replace:

```ts
  const discountLine = data.discountCode
    ? `🏷️ Discount (${escapeHtml(data.discountCode)}): −₹${data.discountAmount.toLocaleString("en-IN")}\n`
    : "";
```

with:

```ts
  const discountLine = adjustmentLine(data.discountCode, data.discountAmount);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/services/telegram.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/telegram.ts lib/services/telegram.test.ts
git commit -m "fix(telegram): flag admin-raised prices; no discount line for ₹0"
```

---

### Task 6: CLAUDE.md and full verification

**Files:**
- Modify: `CLAUDE.md` (new subsection after `### MRP display (display-only)`)

**Interfaces:**
- Consumes: everything above.
- Produces: documentation only.

- [ ] **Step 1: Document the override**

In `CLAUDE.md`, insert this subsection directly before `### Caching Strategy`:

```markdown
### Admin price override (shadow mode)
- At checkout while impersonating, the amber "Admin tools" box offers Discount ₹, Discount % or Increase % (0.1–100, one decimal) with a required reason. Spec: `docs/superpowers/specs/2026-10-04-admin-percent-price-override-design.md`.
- `lib/utils/admin-override.ts` (pure, client-safe) prices it for both the checkout preview and `POST /api/orders` (`priceAdminOverride` / `applyAdminOverride`), so they never disagree. The client sends catalogue prices plus `admin_override: { mode, percent | discount_amount, note }`; the server re-prices only after `validateItemPrices`.
- Discounts are stored as before (`discount_code = ADMIN_OVERRIDE`, rupee `discount_amount`). An increase raises every `order_items.price` to the nearest rupee (worked in tenths of a percent so ties round up), makes `subtotal` their sum (the paid-status `ITEMS_MISMATCH` check needs that) and marks the order `discount_code = ADMIN_PRICE_UP` with `discount_amount = 0`. No migration.
- `isPriceRaised(order)` hides the MRP rows on `/orders/[id]`, and `orderMrpSavings` drops "Saved on MRP" on `/orders`: an MRP worked out from a raised price would be inflated. Telegram shows "📈 Prices raised by admin" and prints a discount line only above ₹0.
```

- [ ] **Step 2: Full unit suite**

Run: `npm run test:unit`
Expected: PASS, with no failures. If a test outside this plan fails, run it on `origin/develop` in the main checkout (read-only, `npx vitest run <file>`) to see whether it already failed there before touching it.

- [ ] **Step 3: Types and lint**

Run: `npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`
Expected: `24`.

Run: `npm run lint`
Expected: no new errors in the files changed on this branch (`git diff --name-only origin/develop`).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: completes. This catches a client page importing server-only code. `app/checkout/page.tsx` now imports `lib/utils/admin-override.ts`, which must stay free of server imports.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: admin percentage price override in CLAUDE.md"
```
