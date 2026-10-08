import type { SupabaseClient } from "@supabase/supabase-js";
import { PAID_ORDER_STATUSES } from "@/lib/admin/sales-metrics";
import { DOC_COLUMNS } from "@/lib/retail/queries";
import { monthBounds, monthKey } from "./register-month";
import type { ChallanRow, RetailRegisterRow } from "./retail-register";
import { buildSalesRegister, type MissingNumberRow, type RegisterOrderRow } from "./sales-register";
import type { SalesRegister } from "./register-types";

/** Every column the register needs. Customer phone and email are deliberately absent, and so is the whole shipping_address JSON (it carries the phone): only its state and name are selected. */
export const REGISTER_COLUMNS =
  "id, order_number, created_at, status, fulfilment_method, customer_name, ship_state:shipping_address->>state, ship_name:shipping_address->>full_name, place_of_supply, " +
  "invoice_number, invoice_date, invoice_voided_at, subtotal, discount_amount, delivery_charge, total_amount, " +
  "order_items(name, size, color, price, quantity), payments(payment_method, status)";

type RawRegisterRow = Omit<RegisterOrderRow, "shipping_address"> & { ship_state: string | null; ship_name: string | null };

/** Rebuilds the only two shipping_address fields the register uses (state for the place of supply, full_name as the buyer fallback). */
export function toRegisterRow({ ship_state, ship_name, ...row }: RawRegisterRow): RegisterOrderRow {
  return { ...row, shipping_address: ship_state == null && ship_name == null ? null : { state: ship_state, full_name: ship_name } } as RegisterOrderRow;
}

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
  return readAll<RawRegisterRow>((from, to) =>
    admin
      .from("orders")
      .select(REGISTER_COLUMNS)
      .not("invoice_number", "is", null)
      .gte("invoice_date", start.toISOString())
      .lt("invoice_date", end.toISOString())
      .order("invoice_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  ).then((rows) => rows.map(toRegisterRow));
}

/** Invoices dated before start and voided in [start, end). */
export function fetchCancelledEarlier(admin: SupabaseClient, start: Date, end: Date): Promise<RegisterOrderRow[]> {
  return readAll<RawRegisterRow>((from, to) =>
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
  ).then((rows) => rows.map(toRegisterRow));
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

/** [first day of month, first day of next month) as YYYY-MM-DD, for date columns. */
function monthDays(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${monthKey(y, m)}-01` };
}

/** The shop fields an invoice needs. Phone and email are deliberately absent (same rule as REGISTER_COLUMNS). */
export const REGISTER_RETAILER_COLUMNS = "id, legal_name, trade_name, gstin, state_code, address, contact_name, our_share_pct, active, created_at";

/** Shop invoices (issued or cancelled) dated in the month. */
export function fetchMonthRetailInvoices(admin: SupabaseClient, month: string): Promise<RetailRegisterRow[]> {
  const { from, to } = monthDays(month);
  return readAll<RetailRegisterRow>((start, end) =>
    admin
      .from("consignment_docs")
      .select(`${DOC_COLUMNS}, retailers(${REGISTER_RETAILER_COLUMNS})`)
      .eq("kind", "sale")
      .not("number", "is", null)
      .in("status", ["issued", "cancelled"])
      .gte("doc_date", from)
      .lt("doc_date", to)
      .order("number", { ascending: true })
      .range(start, end),
  ).then((rows) => rows.map((r) => ({ ...r, share_pct: r.share_pct === null ? null : Number(r.share_pct), retailers: { ...r.retailers, phone: null, email: null, our_share_pct: Number(r.retailers.our_share_pct) } })));
}

/** Challan numbers issued in the month, for GSTR-1 table 13. */
export function fetchMonthChallans(admin: SupabaseClient, month: string): Promise<ChallanRow[]> {
  const { from, to } = monthDays(month);
  return readAll<ChallanRow>((start, end) =>
    admin
      .from("consignment_docs")
      .select("number, status")
      .eq("kind", "challan")
      .not("number", "is", null)
      .gte("doc_date", from)
      .lt("doc_date", to)
      .order("number", { ascending: true })
      .range(start, end),
  );
}

/** The month's register, read live. */
export async function loadSalesRegister(
  admin: SupabaseClient,
  { month, gstin, now }: { month: string; gstin: string; now: Date },
): Promise<SalesRegister> {
  const { start, end } = monthBounds(month);
  const [orders, cancelledEarlier, missingNumbers, invoices, challans] = await Promise.all([
    fetchMonthInvoices(admin, start, end),
    fetchCancelledEarlier(admin, start, end),
    fetchMissingNumbers(admin, start, end),
    fetchMonthRetailInvoices(admin, month),
    fetchMonthChallans(admin, month),
  ]);
  return buildSalesRegister({ month, orders, cancelledEarlier, missingNumbers, gstin, now, retail: { invoices, challans } });
}
