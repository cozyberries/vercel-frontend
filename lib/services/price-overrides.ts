import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminOverrideMode, PriceOverrideRecord, PriceRaise } from "@/lib/types/order";
import { priceRaiseFrom } from "@/lib/utils/admin-override";

// order_price_overrides is admin/internal tier: only a service-role client can
// read it. Never call these with a customer's session client, and never import
// this module from customer-facing code.

const COLUMNS = "order_id, mode, percent, amount, catalogue_subtotal, reason, admin_id, admin_email, created_at";

const toNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

function toRecord(row: Record<string, unknown>): PriceOverrideRecord {
  return {
    order_id: String(row.order_id),
    mode: row.mode as AdminOverrideMode,
    percent: toNumber(row.percent),
    amount: toNumber(row.amount),
    catalogue_subtotal: toNumber(row.catalogue_subtotal),
    reason: (row.reason as string | null | undefined) ?? null,
    admin_id: (row.admin_id as string | null | undefined) ?? null,
    admin_email: (row.admin_email as string | null | undefined) ?? null,
    created_at: String(row.created_at),
  };
}

/**
 * Override records for these orders, keyed by order id. A failed lookup is
 * logged and gives an empty map, so admin pages and Telegram degrade instead
 * of failing.
 */
export async function fetchPriceOverrides(
  client: SupabaseClient,
  orderIds: string[]
): Promise<Map<string, PriceOverrideRecord>> {
  const records = new Map<string, PriceOverrideRecord>();
  if (orderIds.length === 0) return records;
  try {
    const { data, error } = await client.from("order_price_overrides").select(COLUMNS).in("order_id", orderIds);
    if (error) {
      console.error("[price-overrides] lookup failed:", error);
      return records;
    }
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const record = toRecord(row);
      records.set(record.order_id, record);
    }
  } catch (error) {
    console.error("[price-overrides] lookup threw:", error);
  }
  return records;
}

export { priceRaiseFrom } from "@/lib/utils/admin-override";

/** The 📈 data for one order; null when there is none or the lookup failed. */
export async function fetchPriceRaise(client: SupabaseClient, orderId: string): Promise<PriceRaise | null> {
  const records = await fetchPriceOverrides(client, [orderId]);
  return priceRaiseFrom(records.get(orderId));
}
