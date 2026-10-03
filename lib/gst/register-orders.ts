import type { SupabaseClient } from "@supabase/supabase-js";
import { PAID_ORDER_STATUSES } from "@/lib/admin/sales-metrics";
import { monthBounds } from "./register-month";
import { buildSalesRegister, type MissingNumberRow, type RegisterOrderRow } from "./sales-register";
import type { SalesRegister } from "./register-types";

/** Every column the register needs. Customer phone and email are deliberately absent. */
export const REGISTER_COLUMNS =
  "id, order_number, created_at, status, fulfilment_method, customer_name, shipping_address, place_of_supply, " +
  "invoice_number, invoice_date, invoice_voided_at, subtotal, discount_amount, delivery_charge, total_amount, " +
  "order_items(name, size, color, price, quantity), payments(payment_method, status)";

const PAGE = 1000;

type PageResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Reads every page: PostgREST caps one response at 1,000 rows. */
async function readAll<T>(page: (from: number, to: number) => PageResult): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await page(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

/** Invoices dated in [start, end). Service-role client; callers gate on requireAdmin() first. */
export function fetchMonthInvoices(admin: SupabaseClient, start: Date, end: Date): Promise<RegisterOrderRow[]> {
  return readAll<RegisterOrderRow>((from, to) =>
    admin
      .from("orders")
      .select(REGISTER_COLUMNS)
      .not("invoice_number", "is", null)
      .gte("invoice_date", start.toISOString())
      .lt("invoice_date", end.toISOString())
      .order("invoice_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/** Invoices dated before start and voided in [start, end). */
export function fetchCancelledEarlier(admin: SupabaseClient, start: Date, end: Date): Promise<RegisterOrderRow[]> {
  return readAll<RegisterOrderRow>((from, to) =>
    admin
      .from("orders")
      .select(REGISTER_COLUMNS)
      .not("invoice_number", "is", null)
      .lt("invoice_date", start.toISOString())
      .gte("invoice_voided_at", start.toISOString())
      .lt("invoice_voided_at", end.toISOString())
      .order("invoice_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/** Paid orders whose sale date (stock_committed_at, else created_at) is in [start, end) but that have no invoice number. */
export function fetchMissingNumbers(admin: SupabaseClient, start: Date, end: Date): Promise<MissingNumberRow[]> {
  const s = start.toISOString();
  const e = end.toISOString();
  return readAll<MissingNumberRow>((from, to) =>
    admin
      .from("orders")
      .select("order_number")
      .is("invoice_number", null)
      .in("status", [...PAID_ORDER_STATUSES])
      .or(`and(stock_committed_at.gte.${s},stock_committed_at.lt.${e}),and(stock_committed_at.is.null,created_at.gte.${s},created_at.lt.${e})`)
      .order("created_at", { ascending: true })
      .range(from, to),
  );
}

/** The month's register, read live. */
export async function loadSalesRegister(
  admin: SupabaseClient,
  { month, gstin, now }: { month: string; gstin: string; now: Date },
): Promise<SalesRegister> {
  const { start, end } = monthBounds(month);
  const [orders, cancelledEarlier, missingNumbers] = await Promise.all([
    fetchMonthInvoices(admin, start, end),
    fetchCancelledEarlier(admin, start, end),
    fetchMissingNumbers(admin, start, end),
  ]);
  return buildSalesRegister({ month, orders, cancelledEarlier, missingNumbers, gstin, now });
}
