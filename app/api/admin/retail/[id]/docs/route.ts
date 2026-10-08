import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { isUuid, parseDocSave } from "@/lib/retail/requests";
import { retailRpcError } from "@/lib/retail/rpc-errors";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Saves a draft challan, return or monthly sale. The actor is the verified session. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = parseDocSave(await request.json().catch(() => null), new Date());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const v = parsed.value;
  const admin = createAdminSupabaseClient();
  const { data, error } =
    v.kind === "sale"
      ? await admin.rpc("consignment_save_sale", { p_retailer_id: id, p_period: v.period, p_lines: v.lines, p_actor: gate.user.id })
      : await admin.rpc(v.kind === "challan" ? "consignment_save_challan" : "consignment_save_return", {
          p_retailer_id: id, p_doc_date: v.doc_date, p_lines: v.lines, p_actor: gate.user.id, p_doc_id: v.doc_id,
        });
  if (error) {
    const mapped = retailRpcError(error.message);
    if (mapped.status === 500) console.error("[retail] save failed:", error);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
  return NextResponse.json({ doc_id: data }, { status: 201 });
}
