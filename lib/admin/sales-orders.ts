import type { SupabaseClient } from "@supabase/supabase-js";
import { PAID_ORDER_STATUSES, type SalesOrderRow } from "./sales-metrics";

export const SALES_PAGE_SIZE = 1000;

const COLUMNS =
  "id, total_amount, fulfilment_method, status, created_at, stock_committed_at, order_items(product_id, name, price, quantity)";

/**
 * Paid orders whose sale date (stock_committed_at, else created_at) is on or after `from`, or every
 * paid order when `from` is null. Read in pages because PostgREST caps a response at 1,000 rows.
 * Service-role client, read-only; callers gate on requireAdmin() first.
 */
export async function fetchPaidOrders(admin: SupabaseClient, from: Date | null): Promise<SalesOrderRow[]> {
  const rows: SalesOrderRow[] = [];
  for (let offset = 0; ; offset += SALES_PAGE_SIZE) {
    let query = admin.from("orders").select(COLUMNS).in("status", [...PAID_ORDER_STATUSES]);
    if (from) {
      const at = from.toISOString();
      query = query.or(`stock_committed_at.gte.${at},and(stock_committed_at.is.null,created_at.gte.${at})`);
    }
    const { data, error } = await query
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + SALES_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as SalesOrderRow[];
    rows.push(...page);
    if (page.length < SALES_PAGE_SIZE) return rows;
  }
}
