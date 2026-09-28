import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { billUrl } from "@/lib/invoice/bill-link";

type Row = Record<string, unknown>;

function safeBillUrl(orderId: string): string | null {
  try {
    return billUrl(orderId);
  } catch {
    return null; // INVOICE_LINK_SECRET misconfigured — degrade like /api/admin/pickup-orders
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "50", 10) || 50, 1), 100);
  const offset = Math.max(parseInt(sp.get("offset") || "0", 10) || 0, 0);
  const status = sp.get("status");
  const fulfilment = sp.get("fulfilment");
  const fromDate = sp.get("from_date");
  const toDate = sp.get("to_date");

  const admin = createAdminSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (q: any) => {
    if (status && status !== "all") q = q.eq("status", status);
    if (fulfilment === "delivery" || fulfilment === "pickup") q = q.eq("fulfilment_method", fulfilment);
    if (fromDate) q = q.gte("created_at", fromDate);
    if (toDate) q = q.lte("created_at", `${toDate}T23:59:59.999Z`);
    return q;
  };

  const { count, error: countError } = await applyFilters(
    admin.from("orders").select("id", { count: "exact", head: true })
  );
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const { data: orders, error } = await applyFilters(admin.from("orders").select("*"))
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (orders ?? []) as Row[];
  const ids = rows.map((o) => o.id as string);
  let items: Row[] = [];
  let payments: Row[] = [];
  if (ids.length > 0) {
    const [itemsRes, paymentsRes] = await Promise.all([
      admin.from("order_items").select("*").in("order_id", ids),
      admin.from("payments").select("*").in("order_id", ids).order("created_at", { ascending: false }),
    ]);
    items = (itemsRes.data ?? []) as Row[];
    payments = (paymentsRes.data ?? []) as Row[];
  }

  const byOrder = (list: Row[]) => {
    const m = new Map<string, Row[]>();
    for (const r of list) {
      const k = r.order_id as string;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  };
  const itemMap = byOrder(items);
  const paymentMap = byOrder(payments);

  return NextResponse.json({
    orders: rows.map((o) => ({
      ...o,
      items: itemMap.get(o.id as string) ?? [],
      payments: paymentMap.get(o.id as string) ?? [],
      bill_url: safeBillUrl(o.id as string),
    })),
    total: count ?? 0,
  });
}
