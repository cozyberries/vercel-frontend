import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { isUuid, parseRateInput } from "@/lib/retail/requests";
import { retailRpcError } from "@/lib/retail/rpc-errors";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

function failed(error: { message: string }) {
  const mapped = retailRpcError(error.message);
  if (mapped.status === 500) console.error("[retail] rate change failed:", error);
  return NextResponse.json({ error: mapped.error }, { status: mapped.status });
}

/** Approves a discount rate for one shop and month (agreement clause 3.5). The actor is the verified session. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = parseRateInput(await request.json().catch(() => null), new Date());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { error } = await createAdminSupabaseClient().rpc("consignment_add_rate", {
    p_retailer_id: id, p_period: parsed.value.period, p_rate_pct: parsed.value.rate_pct, p_actor: gate.user.id,
  });
  if (error) return failed(error);
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Withdraws a rate, unless the month is issued or its draft has sales at that rate. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const q = request.nextUrl.searchParams;
  const rate = q.get("rate")?.trim();
  const parsed = parseRateInput({ period: q.get("period"), rate_pct: rate ? Number(rate) : undefined }, new Date());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { error } = await createAdminSupabaseClient().rpc("consignment_remove_rate", {
    p_retailer_id: id, p_period: parsed.value.period, p_rate_pct: parsed.value.rate_pct,
  });
  if (error) return failed(error);
  return NextResponse.json({ ok: true });
}
