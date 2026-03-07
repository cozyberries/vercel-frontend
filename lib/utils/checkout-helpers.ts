import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OrderItemInput,
  OrderSummary,
  ShippingAddress,
} from "@/lib/types/order";
import {
  DELIVERY_CHARGE_INR,
  FREE_DELIVERY_THRESHOLD,
  GST_RATE,
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
    address_line_2: row.address_line_2,
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

/**
 * Server-side price validation. Fetches product base prices and variant prices
 * from the DB, then rejects any item whose submitted price is not in the
 * authoritative set.
 *
 * Returns `null` on success or an error string describing the issue.
 */
export async function validateItemPrices(
  supabase: SupabaseClient,
  items: OrderItemInput[]
): Promise<string | null> {
  const productSlugs = [...new Set(items.map((item) => item.id))];

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("slug, price")
    .in("slug", productSlugs);

  if (productsError) {
    console.error("Error fetching product prices:", productsError);
    return "Failed to validate product prices";
  }

  const { data: variants, error: variantsError } = await supabase
    .from("product_variants")
    .select("product_slug, price")
    .in("product_slug", productSlugs);

  if (variantsError) {
    console.error("Error fetching variant prices:", variantsError);
    return "Failed to validate product prices";
  }

  const validPriceMap = new Map<string, Set<number>>();

  for (const product of products ?? []) {
    validPriceMap.set(product.slug, new Set([Number(product.price)]));
  }
  for (const variant of variants ?? []) {
    const set = validPriceMap.get(variant.product_slug) ?? new Set<number>();
    set.add(Number(variant.price));
    validPriceMap.set(variant.product_slug, set);
  }

  for (const item of items) {
    const validPrices = validPriceMap.get(item.id);
    if (!validPrices) {
      return `Product not found: ${item.id}`;
    }
    if (!validPrices.has(item.price)) {
      return `Invalid price for product ${item.id}`;
    }
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
const GST_PERCENT = Math.round(GST_RATE * 100);

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

  const tax_paise = Math.round((subtotal_paise * GST_PERCENT) / 100);

  const total_paise = subtotal_paise + delivery_charge_paise + tax_paise;

  return {
    subtotal: round2(subtotal_paise / 100),
    delivery_charge: round2(delivery_charge_paise / 100),
    tax_amount: round2(tax_paise / 100),
    total_amount: round2(total_paise / 100),
    currency: "INR",
  };
}

// ─── Session Expiry ───────────────────────────────────────────────────────────

/** Checkout sessions expire after 30 minutes. */
const SESSION_EXPIRY_MS = 30 * 60 * 1000;

export function isSessionExpired(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > SESSION_EXPIRY_MS;
}
