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
