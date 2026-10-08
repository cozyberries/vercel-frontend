import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/retail/requests";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ paymentId: string }> };

/** Removes a mistyped payment. */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { paymentId } = await params;
  if (!isUuid(paymentId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await createAdminSupabaseClient().from("retailer_payments").delete().eq("id", paymentId).select("id");
  if (error) {
    console.error("[retail] payment delete failed:", error);
    return NextResponse.json({ error: "Couldn't delete the payment" }, { status: 500 });
  }
  return (data ?? []).length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
