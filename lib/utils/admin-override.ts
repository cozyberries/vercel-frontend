import { GST_LOW_RATE_MAX_UNIT_PRICE } from "@/lib/config/business";
import type { AdminOverride, AdminOverrideMode } from "@/lib/types/order";

// Pure and client-safe: the checkout preview and POST /api/orders both price an
// admin override through this module, so the screen and the stored order agree.

export const ADMIN_OVERRIDE_DISCOUNT_CODE = "ADMIN_OVERRIDE";
export const ADMIN_OVERRIDE_NOTE_MAX = 500;
export const ADMIN_OVERRIDE_PERCENT_ERROR =
  "Override percent must be from 0.1 to 100, with at most one decimal";
export const ADMIN_PRICE_UP_GST_ERROR =
  "A raise can't take any item above ₹2,500 a piece: GST on clothing is 18% above that, and the invoice charges 5%";

/** A raise carries no code: nothing on the customer-readable order may show it. */
type AdminOverrideCode = typeof ADMIN_OVERRIDE_DISCOUNT_CODE | null;

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

export type ApplyAdminOverrideResult<T extends PricedLine> =
  | ApplyAdminOverrideSuccess<T>
  | { ok: false; error: string };

export interface ApplyAdminOverrideInput<T extends PricedLine> {
  override: AdminOverride;
  items: T[];
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

/** Validates the amount or percentage (and, for a raise, the ₹2,500 GST ceiling) and works out the lines to store and the discount. */
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

  const raised = items.map((item) => ({ ...item, price: raisePrice(item.price, tenths) }));
  if (raised.some((item) => item.price > GST_LOW_RATE_MAX_UNIT_PRICE)) {
    return { ok: false, error: ADMIN_PRICE_UP_GST_ERROR };
  }

  return {
    ok: true,
    mode,
    percent,
    items: raised,
    discountCode: null,
    discountAmount: 0,
  };
}

/** The reason is optional: an error message only when it is over 500 characters after trimming. */
export function overrideNoteError(note: unknown): string | null {
  const trimmed = typeof note === "string" ? note.trim() : "";
  if (trimmed.length > ADMIN_OVERRIDE_NOTE_MAX) {
    return `Override reason must be at most ${ADMIN_OVERRIDE_NOTE_MAX} characters`;
  }
  return null;
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
