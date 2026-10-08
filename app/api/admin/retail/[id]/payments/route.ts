import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { PAYMENT_COLUMNS } from "@/lib/retail/queries";
import { isUuid, parsePayment } from "@/lib/retail/requests";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Records money received from a shop, optionally against one of its issued invoices. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = parsePayment(await request.json().catch(() => null), new Date());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const admin = createAdminSupabaseClient();
  if (parsed.value.doc_id) {
    const { data: invoice } = await admin
      .from("consignment_docs")
      .select("id")
      .eq("id", parsed.value.doc_id)
      .eq("retailer_id", id)
      .eq("kind", "sale")
      .eq("status", "issued")
      .maybeSingle();
    if (!invoice) return NextResponse.json({ error: "Pick one of this shop's issued invoices" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("retailer_payments")
    .insert({ ...parsed.value, retailer_id: id, created_by: gate.user.id })
    .select(PAYMENT_COLUMNS)
    .single();
  if (error) {
    console.error("[retail] payment failed:", error);
    return NextResponse.json({ error: "Couldn't save the payment" }, { status: 500 });
  }
  return NextResponse.json({ payment: data }, { status: 201 });
}
