import { NextRequest, NextResponse } from "next/server";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/services/effective-user";
import { allowedFromStatuses, parsePickupAction, PICKUP_TARGET_STATUS } from "@/lib/orders/pickup";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Admin-gated: getUser() + isAdmin() before any service-role query. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
    const action = parsePickupAction(body?.action);
    if (!action) {
      return NextResponse.json({ error: "action must be 'ready' or 'collected'" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { data: current } = await admin
      .from("orders")
      .select("status")
      .eq("id", id)
      .eq("fulfilment_method", "pickup")
      .maybeSingle();
    if (!current) {
      return NextResponse.json({ error: "Pickup order not found" }, { status: 404 });
    }
    if (!allowedFromStatuses(action).includes(current.status)) {
      return NextResponse.json(
        { error: `Order is ${current.status.replace(/_/g, " ")}; it cannot be marked ${action}` },
        { status: 409 }
      );
    }

    const target = PICKUP_TARGET_STATUS[action];
    const { data: updated, error } = await admin
      .from("orders")
      .update({ status: target })
      .eq("id", id)
      .eq("fulfilment_method", "pickup")
      .eq("status", current.status)
      .select("id, status, order_number, customer_phone, invoice_number");
    if (error) {
      console.error("[pickup-orders] update failed:", error);
      return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
    }
    if (!updated?.length) {
      return NextResponse.json({ error: "Order changed meanwhile — refresh and try again" }, { status: 409 });
    }

    const { error: eventError } = await admin.from("order_status_events").insert({
      order_id: id,
      from_status: current.status,
      to_status: target,
      actor_admin_id: user.id,
    });
    if (eventError) {
      console.error("[pickup-orders] audit insert failed:", { eventError, orderId: id });
    }

    return NextResponse.json({ order: updated[0] });
  } catch (error) {
    console.error("[pickup-orders] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
