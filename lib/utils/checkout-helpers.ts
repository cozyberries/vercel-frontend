import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminOverride,
  OrderItemInput,
  OrderSummary,
  ShippingAddress,
} from "@/lib/types/order";
import {
  DELIVERY_CHARGE_INR,
  FREE_DELIVERY_THRESHOLD,
} from "@/lib/constants";

// ─── Address Helpers ──────────────────────────────────────────────────────────

export interface FetchedAddresses {
  shippingAddress: ShippingAddress & { phone?: string };
  billingAddress: ShippingAddress & { phone?: string };
  /** Raw DB row for shipping (includes phone, etc.) */
  shippingRow: Record<string, any>;
}

/**
 * Validates and fetches shipping (and optional billing) addresses for the
 * authenticated user. Returns a typed error string on failure.
 */
export async function validateAndFetchAddresses(
  supabase: SupabaseClient,
  userId: string,
  shippingAddressId: string,
  billingAddressId?: string
): Promise<{ data: FetchedAddresses } | { error: string }> {
  const { data: shippingRow, error: shippingError } = await supabase
    .from("user_addresses")
    .select("*")
    .eq("id", shippingAddressId)
    .eq("user_id", userId)
    .single();

  if (shippingError || !shippingRow) {
    return { error: "Invalid shipping address" };
  }

  let billingRow = shippingRow;
  if (billingAddressId && billingAddressId !== shippingAddressId) {
    const { data: billingAddr, error: billingError } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("id", billingAddressId)
      .eq("user_id", userId)
      .single();

    if (billingError || !billingAddr) {
      return { error: "Invalid billing address" };
    }
    billingRow = billingAddr;
  }

  const toAddress = (row: Record<string, any>): ShippingAddress & { phone?: string } => ({
    full_name: row.full_name,
    address_line_1: row.address_line_1,
    area: row.area,
    city: row.city,
    state: row.state,
    postal_code: row.postal_code,
    country: row.country,
    phone: row.phone,
    address_type: row.address_type,
    label: row.label,
  });

  return {
    data: {
      shippingAddress: toAddress(shippingRow),
      billingAddress: toAddress(billingRow),
      shippingRow,
    },
  };
}

// ─── Price Validation ─────────────────────────────────────────────────────────

export interface PriceChangedItem {
  id: string;
  name: string;
  size?: string;
  color?: string;
  old_price: number;
  new_price: number;
}

export type PriceValidationError = {
  message: string;
  code: "price_changed" | "product_not_found" | "invalid_price" | "fetch_error";
  changed_items?: PriceChangedItem[];
};

/**
 * Server-side price validation. Fetches product and variant prices from the DB,
 * then rejects any item whose submitted price doesn't match the authoritative price.
 *
 * For price mismatches, returns the correct per-variant price so the client can
 * update the cart and retry without requiring a manual page refresh.
 *
 * Returns `null` on success or a `PriceValidationError` describing the issue.
 */
export async function validateItemPrices(
  supabase: SupabaseClient,
  items: OrderItemInput[]
): Promise<PriceValidationError | null> {
  const productSlugs = [...new Set(items.map((item) => item.id))];

  const [productsResult, variantsResult] = await Promise.all([
    supabase
      .from("products")
      .select("slug, price")
      .in("slug", productSlugs),
    supabase
      .from("product_variants")
      .select("product_slug, price, size_slug, color_slug")
      .in("product_slug", productSlugs),
  ]);

  if (productsResult.error) {
    console.error("Error fetching product prices:", productsResult.error);
    return { message: "Failed to validate product prices", code: "fetch_error" };
  }

  if (variantsResult.error) {
    console.error("Error fetching variant prices:", variantsResult.error);
    return { message: "Failed to validate product prices", code: "fetch_error" };
  }

  const products = productsResult.data ?? [];
  const variants = variantsResult.data ?? [];

  // Map product slug → set of valid prices (base + all variants)
  const validPriceMap = new Map<string, Set<number>>();
  // Map "product_slug|size_slug|color_slug" → price for per-variant correct price lookup
  const variantPriceMap = new Map<string, number>();
  // Map product slug → base price
  const basePriceMap = new Map<string, number>();

  for (const product of products) {
    const price = Number(product.price);
    validPriceMap.set(product.slug, new Set([price]));
    basePriceMap.set(product.slug, price);
  }

  for (const variant of variants) {
    if (variant.price == null) continue;
    const price = Number(variant.price);
    const set = validPriceMap.get(variant.product_slug) ?? new Set<number>();
    set.add(price);
    validPriceMap.set(variant.product_slug, set);
    const key = `${variant.product_slug}|${(variant.size_slug ?? "").toLowerCase()}|${(variant.color_slug ?? "").toLowerCase()}`;
    variantPriceMap.set(key, price);
  }

  const changedItems: PriceChangedItem[] = [];

  for (const item of items) {
    const validPrices = validPriceMap.get(item.id);
    if (!validPrices) {
      return { message: `Product not found: ${item.id}`, code: "product_not_found" };
    }

    const itemPrice = Number(item.price);
    if (!Number.isFinite(itemPrice)) {
      return { message: `Invalid price for product ${item.id}`, code: "invalid_price" };
    }

    const priceKey = Math.round(itemPrice);
    if (!validPrices.has(priceKey)) {
      // Resolve the authoritative price for this specific variant
      const sizeKey = (item.size ?? "").toLowerCase();
      const colorKey = (item.color ?? "").toLowerCase();
      const variantKey = `${item.id}|${sizeKey}|${colorKey}`;
      const correctPrice =
        variantPriceMap.get(variantKey) ?? basePriceMap.get(item.id);

      changedItems.push({
        id: item.id,
        name: item.name,
        size: item.size,
        color: item.color,
        old_price: itemPrice,
        new_price: correctPrice ?? itemPrice,
      });
    }
  }

  if (changedItems.length > 0) {
    return {
      message: "One or more item prices have changed since you added them to your cart.",
      code: "price_changed",
      changed_items: changedItems,
    };
  }

  return null;
}

// ─── Order Summary ────────────────────────────────────────────────────────────

function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const FREE_DELIVERY_THRESHOLD_PAISE = Math.round(FREE_DELIVERY_THRESHOLD * 100);
const DELIVERY_CHARGE_PAISE = Math.round(DELIVERY_CHARGE_INR * 100);

export function calculateOrderSummary(items: OrderItemInput[]): OrderSummary {
  if (items.length === 0) {
    return {
      subtotal: 0,
      delivery_charge: 0,
      tax_amount: 0,
      total_amount: 0,
      currency: "INR",
    };
  }

  const subtotal_paise = items.reduce(
    (sum, item) => sum + rupeesToPaise(item.price) * item.quantity,
    0
  );

  const delivery_charge_paise =
    subtotal_paise < FREE_DELIVERY_THRESHOLD_PAISE ? DELIVERY_CHARGE_PAISE : 0;

  const total_paise = subtotal_paise + delivery_charge_paise;

  return {
    subtotal: round2(subtotal_paise / 100),
    delivery_charge: round2(delivery_charge_paise / 100),
    tax_amount: 0,
    total_amount: round2(total_paise / 100),
    currency: "INR",
  };
}

// ─── Admin Override ───────────────────────────────────────────────────────────

export const ADMIN_OVERRIDE_DISCOUNT_CODE = "ADMIN_OVERRIDE";
export const ADMIN_OVERRIDE_NOTE_MIN = 3;
export const ADMIN_OVERRIDE_NOTE_MAX = 500;

export interface ApplyAdminOverrideInput {
  override: AdminOverride;
  subtotal: number;
  actingAdminEmail?: string | null;
  existingNotes?: string | null;
}

export interface ApplyAdminOverrideSuccess {
  ok: true;
  discountCode: typeof ADMIN_OVERRIDE_DISCOUNT_CODE;
  discountAmount: number;
  notes: string;
}

export interface ApplyAdminOverrideFailure {
  ok: false;
  error: string;
}

export type ApplyAdminOverrideResult =
  | ApplyAdminOverrideSuccess
  | ApplyAdminOverrideFailure;

/**
 * Pure validator / applier for the admin price-override at checkout.
 *
 * - Clamps `override.discount_amount` to `[0, subtotal]` and floors it so the
 *   server always persists integer rupees.
 * - Requires `override.note` (trimmed) to be 3..500 chars.
 * - Prefixes `orders.notes` with `[ADMIN OVERRIDE by <email>]: <note>` so the
 *   audit trail is preserved alongside any existing customer note.
 *
 * NO side effects — safe to unit-test and to call from any route handler.
 */
export function applyAdminOverride(
  input: ApplyAdminOverrideInput
): ApplyAdminOverrideResult {
  const { override, subtotal, actingAdminEmail, existingNotes } = input;

  const rawAmount = Number(override?.discount_amount);
  if (!Number.isFinite(rawAmount)) {
    return { ok: false, error: "Invalid override discount amount" };
  }

  const safeSubtotal = Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0;
  const discountAmount = Math.max(
    0,
    Math.min(safeSubtotal, Math.floor(rawAmount))
  );

  const trimmedNote = (override?.note ?? "").trim();
  if (trimmedNote.length < ADMIN_OVERRIDE_NOTE_MIN) {
    return {
      ok: false,
      error: `Override reason must be at least ${ADMIN_OVERRIDE_NOTE_MIN} characters`,
    };
  }
  if (trimmedNote.length > ADMIN_OVERRIDE_NOTE_MAX) {
    return {
      ok: false,
      error: `Override reason must be at most ${ADMIN_OVERRIDE_NOTE_MAX} characters`,
    };
  }

  // Collapse any embedded CR/LF sequences so the caller can't forge a second
  // audit-looking line by smuggling a newline into the note.
  const sanitizedNote = trimmedNote.replace(/[\r\n]+/g, " ");

  const adminEmail =
    typeof actingAdminEmail === "string" && actingAdminEmail.trim().length > 0
      ? actingAdminEmail.trim()
      : "unknown";

  // Whitespace-only existing notes are treated as absent so the persisted
  // value is clean regardless of whether the caller pre-trims.
  const existing =
    typeof existingNotes === "string" ? existingNotes.trim() : "";

  const prefix = `[ADMIN OVERRIDE by ${adminEmail}]: ${sanitizedNote}`;
  const notes = existing.length > 0 ? `${prefix}\n${existing}` : prefix;

  return {
    ok: true,
    discountCode: ADMIN_OVERRIDE_DISCOUNT_CODE,
    discountAmount,
    notes,
  };
}

// ─── Session Expiry ───────────────────────────────────────────────────────────

/** Checkout sessions expire after 30 minutes. */
const SESSION_EXPIRY_MS = 30 * 60 * 1000;

export function isSessionExpired(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > SESSION_EXPIRY_MS;
}
