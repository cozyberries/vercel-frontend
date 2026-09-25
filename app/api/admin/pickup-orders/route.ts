import { NextRequest, NextResponse } from "next/server";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/services/effective-user";
import { parsePickupTab, PICKUP_SEARCH_STATUSES, PICKUP_TAB_STATUSES, startOfIstDay } from "@/lib/orders/pickup";
import { getIndianPhoneDigits } from "@/lib/utils/validation";

const SELECT =
  "id, order_number, status, total_amount, customer_name, customer_phone, invoice_number, created_at, updated_at, " +
  "order_items(name, size, color, quantity), payments(payment_method, status)";

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

    let query = createAdminSupabaseClient()
      .from("orders")
      .select(SELECT)
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
      if (tab === "collected") {
        query = query.gte("updated_at", startOfIstDay(new Date()).toISOString());
      }
    }

    const { data, error } = await query.order("created_at", { ascending: true }).limit(100);
    if (error) {
      console.error("[pickup-orders] list failed:", error);
      return NextResponse.json({ error: "Failed to load pickup orders" }, { status: 500 });
    }
    return NextResponse.json({ orders: data ?? [] });
  } catch (error) {
    console.error("[pickup-orders] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
