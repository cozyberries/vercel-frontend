import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchActiveVariants } from "@/lib/admin/stock-variants";
import type { RetailerDetail, RetailerListResponse, VariantOption } from "./api-types";
import { istToday, recentPeriods } from "./dates";
import { holdingsFrom, retailerSummary } from "./holdings";
import type { BatchBalance, ConsignmentDoc, Retailer, RetailerPayment } from "./types";

/** Server-only reads with the service-role client. Callers gate on requireAdmin() first. */
export const RETAILER_COLUMNS = "id, legal_name, trade_name, gstin, state_code, address, contact_name, phone, email, our_share_pct, active, created_at";
export const LINE_COLUMNS = "id, doc_id, variant_slug, product_name, size, quantity, mrp_paise, batch_line_id, unit_price_paise";
export const DOC_COLUMNS = `id, retailer_id, kind, status, number, doc_date, period, share_pct, note, created_at, issued_at, cancelled_at, consignment_lines(${LINE_COLUMNS})`;
export const BALANCE_COLUMNS = "batch_line_id, retailer_id, variant_slug, product_name, size, mrp_paise, sent_on, challan_number, sent, held";
export const PAYMENT_COLUMNS = "id, retailer_id, doc_id, amount_paise, paid_on, method, reference, created_at";

type Result = { data: unknown; error: { message: string } | null };

const PAGE = 1000; // PostgREST caps a response at 1,000 rows

/** Reads every row, a page at a time. Each query must have a total order so pages don't skip or repeat. */
async function rows<T>(page: (from: number, to: number) => PromiseLike<Result>): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await page(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) return all;
  }
}

async function one<T>(query: PromiseLike<Result>): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? null) as T | null;
}

// numeric columns can arrive as strings; normalise once here.
const toRetailer = (r: Retailer): Retailer => ({ ...r, our_share_pct: Number(r.our_share_pct) });
const toDoc = (d: ConsignmentDoc): ConsignmentDoc => ({
  ...d,
  share_pct: d.share_pct === null ? null : Number(d.share_pct),
  consignment_lines: [...(d.consignment_lines ?? [])].sort((a, b) => a.product_name.localeCompare(b.product_name) || a.size.localeCompare(b.size) || a.mrp_paise - b.mrp_paise),
});

export function shopName(r: Pick<Retailer, "trade_name" | "legal_name">): string {
  return r.trade_name?.trim() || r.legal_name;
}

export async function fetchRetailer(admin: SupabaseClient, id: string): Promise<Retailer | null> {
  const r = await one<Retailer>(admin.from("retailers").select(RETAILER_COLUMNS).eq("id", id).maybeSingle());
  return r ? toRetailer(r) : null;
}

export async function fetchDoc(admin: SupabaseClient, docId: string): Promise<ConsignmentDoc | null> {
  const d = await one<ConsignmentDoc>(admin.from("consignment_docs").select(DOC_COLUMNS).eq("id", docId).maybeSingle());
  return d ? toDoc(d) : null;
}

/** Challan numbers behind a sale's batch lines, for the invoice note. */
export async function fetchChallanNumbers(admin: SupabaseClient, batchLineIds: string[]): Promise<string[]> {
  if (batchLineIds.length === 0) return [];
  const list = await rows<{ challan_number: string }>((f, t) =>
    admin.from("retailer_batch_balances").select("challan_number").in("batch_line_id", [...new Set(batchLineIds)]).order("batch_line_id", { ascending: true }).range(f, t),
  );
  return [...new Set(list.map((r) => r.challan_number))].sort();
}

export async function loadRetailerList(admin: SupabaseClient, now: Date): Promise<RetailerListResponse> {
  const [retailers, balances, sales, payments] = await Promise.all([
    rows<Retailer>((f, t) => admin.from("retailers").select(RETAILER_COLUMNS).order("legal_name", { ascending: true }).order("id", { ascending: true }).range(f, t)),
    rows<BatchBalance>((f, t) => admin.from("retailer_batch_balances").select(BALANCE_COLUMNS).order("batch_line_id", { ascending: true }).range(f, t)),
    rows<ConsignmentDoc>((f, t) => admin.from("consignment_docs").select(DOC_COLUMNS).eq("kind", "sale").eq("status", "issued").order("id", { ascending: true }).range(f, t)),
    rows<RetailerPayment>((f, t) => admin.from("retailer_payments").select(PAYMENT_COLUMNS).order("id", { ascending: true }).range(f, t)),
  ]);
  const today = istToday(now);
  const lastPeriod = recentPeriods(now, 2)[1];
  const lastPeriodEnd = `${lastPeriod}-31`;
  const items = retailers.map(toRetailer).map((retailer) => {
    const own = <T extends { retailer_id: string }>(list: T[]) => list.filter((x) => x.retailer_id === retailer.id);
    return {
      retailer,
      summary: retailerSummary({ retailer, balances: own(balances), docs: own(sales).map(toDoc), payments: own(payments), today }),
    };
  });
  const missingLastPeriod = items
    .filter(({ retailer }) =>
      retailer.active &&
      balances.some((b) => b.retailer_id === retailer.id && b.sent_on <= lastPeriodEnd) &&
      !sales.some((d) => d.retailer_id === retailer.id && d.period === lastPeriod),
    )
    .map(({ retailer }) => shopName(retailer));
  return { items, lastPeriod, missingLastPeriod, today };
}

export async function loadRetailerDetail(admin: SupabaseClient, id: string, now: Date): Promise<RetailerDetail | null> {
  const retailer = await fetchRetailer(admin, id);
  if (!retailer) return null;
  const [balances, docs, payments] = await Promise.all([
    rows<BatchBalance>((f, t) => admin.from("retailer_batch_balances").select(BALANCE_COLUMNS).eq("retailer_id", id).order("batch_line_id", { ascending: true }).range(f, t)),
    rows<ConsignmentDoc>((f, t) =>
      admin.from("consignment_docs").select(DOC_COLUMNS).eq("retailer_id", id)
        .order("doc_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: true }).range(f, t),
    ),
    rows<RetailerPayment>((f, t) => admin.from("retailer_payments").select(PAYMENT_COLUMNS).eq("retailer_id", id).order("paid_on", { ascending: false }).order("id", { ascending: true }).range(f, t)),
  ]);
  const today = istToday(now);
  const allDocs = docs.map(toDoc);
  return {
    retailer,
    summary: retailerSummary({ retailer, balances, docs: allDocs, payments, today }),
    holdings: holdingsFrom(balances, today),
    docs: allDocs,
    payments,
    today,
  };
}

/** Sizes of active products with stock on hand, for "Send stock". */
export async function loadVariantOptions(admin: SupabaseClient): Promise<VariantOption[]> {
  const variants = await fetchActiveVariants(admin);
  return variants
    .filter((v) => (v.stock_quantity ?? 0) > 0 && v.products)
    .map((v) => ({
      slug: v.slug,
      productName: v.products!.name,
      size: v.sizes?.name ?? v.size_slug ?? "",
      pricePaise: Math.round(Number(v.price ?? 0) * 100),
      stock: v.stock_quantity ?? 0,
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName) || a.size.localeCompare(b.size));
}
