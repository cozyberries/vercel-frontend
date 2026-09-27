import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { refillRpcError } from "@/lib/orders/stall-refills";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Undo one tick. Admin-gated before any service-role query; scoped to the tick id acted on. */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const gate = await requireAdmin();
    if (gate.response) return gate.response;

    const { id } = await params;
    if (!UUID.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("stall_refill_undo", { p_id: id });
    if (error) {
      const mapped = refillRpcError(error.message);
      if (mapped.status === 500) console.error("[stall-refills] undo failed:", error);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }
    return NextResponse.json({ refill: data });
  } catch (error) {
    console.error("[stall-refills] DELETE failed:", error);
    return NextResponse.json({ error: "Could not undo" }, { status: 500 });
  }
}
