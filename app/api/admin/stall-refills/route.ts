import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { getSnapshot } from "@/lib/catalog/cache";
import type { ListCard } from "@/lib/catalog/types";
import {
  actedByName,
  buildRefillDay,
  parseRefillAction,
  refillDays,
  refillRpcError,
  type RefillDbRow,
  type RefillsResponse,
} from "@/lib/orders/stall-refills";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Today's and yesterday's sold lines. Admin-gated before any service-role query. */
export async function GET() {
  try {
    const gate = await requireAdmin();
    if (gate.response) return gate.response;

    const now = new Date();
    const days = refillDays(now);
    const admin = createAdminSupabaseClient();
    const [{ data, error }, products] = await Promise.all([
      admin.rpc("stall_refill_lines", { p_since: days.yesterday }),
      // Names and photos only: without the snapshot, lines fall back to the order item's name.
      getSnapshot()
        .then(({ snapshot }) => snapshot.products)
        .catch((err): ListCard[] => {
          console.error("[stall-refills] catalog snapshot unavailable:", err);
          return [];
        }),
    ]);
    if (error) {
      console.error("[stall-refills] lines failed:", error);
      return NextResponse.json({ error: "Failed to load refills" }, { status: 500 });
    }

    const rows = (data ?? []) as RefillDbRow[];
    const body: RefillsResponse = {
      today: buildRefillDay(rows, products, days.today),
      yesterday: buildRefillDay(rows, products, days.yesterday),
      generated_at: now.toISOString(),
    };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (error) {
    console.error("[stall-refills] GET failed:", error);
    return NextResponse.json({ error: "Failed to load refills" }, { status: 500 });
  }
}

/** Records Refilled / No stock left. The actor is always the verified session, never the body. */
export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin();
    if (gate.response) return gate.response;

    const body = await request.json().catch(() => null);
    const parsed = parseRefillAction(body, new Date());
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, code: parsed.code }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("stall_refill_record", {
      p_sale_date: parsed.value.sale_date,
      p_variant_slug: parsed.value.variant_slug,
      p_action: parsed.value.action,
      p_quantity: parsed.value.quantity,
      p_acted_by: gate.user.id,
      p_acted_by_name: actedByName(gate.user),
    });
    if (error) {
      const mapped = refillRpcError(error.message);
      if (mapped.status === 500) console.error("[stall-refills] record failed:", error);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }
    return NextResponse.json({ refill: data }, { status: 201 });
  } catch (error) {
    console.error("[stall-refills] POST failed:", error);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}
