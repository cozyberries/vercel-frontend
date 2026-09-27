import { NextRequest, NextResponse } from "next/server";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/services/effective-user";
import { collectedAt, parsePickupTab, PICKUP_SEARCH_STATUSES, PICKUP_TAB_STATUSES, startOfIstDay } from "@/lib/orders/pickup";
import { getIndianPhoneDigits } from "@/lib/utils/validation";
import { billUrl } from "@/lib/invoice/bill-link";

const SELECT =
  "id, order_number, status, total_amount, customer_name, customer_phone, invoice_number, created_at, updated_at, " +
  "order_items(name, size, color, quantity, price), payments(payment_method, status)";

type Row = {
  id: string;
  updated_at: string;
  order_status_events?: { to_status: string; created_at: string }[] | null;
};

/** Admin-gated: getUser() + isAdmin() before any service-role query. */
export async function GET(request: NextRequest) {
  try {
    const sessionClient = await createServerSupabaseClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdmin(user as unknown as SupabaseUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tab = parsePickupTab(searchParams.get("tab"));
    if (!tab) {
      return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
    }
    const q = (searchParams.get("q") ?? "").trim();
    const collectedToday = !q && tab === "collected";
    const todayStart = startOfIstDay(new Date());

    const admin = createAdminSupabaseClient();
    let query = admin
      .from("orders")
      .select(collectedToday ? `${SELECT}, order_status_events(to_status, created_at)` : SELECT)
      .eq("fulfilment_method", "pickup");

    if (q) {
      const digits = q.replace(/\D/g, "");
      // "98765 43210" / "+91 98765…" is a phone; anything with letters ("ORD-2026…") is an order number.
      const looksLikePhone = /^[+\d\s-]+$/.test(q) && digits.length >= 4;
      query = query.in("status", PICKUP_SEARCH_STATUSES);
      query = looksLikePhone
        ? query.ilike("customer_phone", `%${digits.length > 10 ? getIndianPhoneDigits(digits) : digits}%`)
        : query.ilike("order_number", `%${q}%`);
    } else {
      query = query.in("status", PICKUP_TAB_STATUSES[tab]);
      if (collectedToday) {
        // Collecting stamps updated_at, so every order handed over today is in here;
        // the collectedAt() filter below drops ones collected earlier and only edited today.
        query = query.gte("updated_at", todayStart.toISOString());
      }
    }

    // The awaiting-✅ count rides along with every tab so staff see it without opening that tab.
    const [{ data, error }, awaiting] = await Promise.all([
      query.order("created_at", { ascending: true }).limit(100),
      admin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("fulfilment_method", "pickup")
        .in("status", PICKUP_TAB_STATUSES.awaiting),
    ]);
    if (error) {
      console.error("[pickup-orders] list failed:", error);
      return NextResponse.json({ error: "Failed to load pickup orders" }, { status: 500 });
    }
    if (awaiting.error) {
      console.error("[pickup-orders] awaiting count failed:", awaiting.error);
    }
    const awaitingCount = awaiting.error ? null : awaiting.count ?? 0;
    let rows = (data ?? []) as unknown as Row[];
    if (collectedToday) {
      rows = rows
        .filter((row) => new Date(collectedAt(row)) >= todayStart)
        .map((row) => {
          const out = { ...row };
          delete out.order_status_events;
          return out;
        });
    }
    let orders;
    try {
      // Signed public bill link per order, built here because the secret is server-only.
      orders = rows.map((row) => ({ ...row, bill_url: billUrl(row.id) }));
    } catch (configError) {
      console.error("[pickup-orders] INVOICE_LINK_SECRET misconfigured:", configError instanceof Error ? configError.message : configError);
      orders = rows.map((row) => ({ ...row, bill_url: null }));
    }
    return NextResponse.json({ orders, awaiting_count: awaitingCount });
  } catch (error) {
    console.error("[pickup-orders] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
