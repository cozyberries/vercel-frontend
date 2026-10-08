import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { isUuid, parseDocAction } from "@/lib/retail/requests";
import { retailRpcError } from "@/lib/retail/rpc-errors";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ docId: string }> };

/** Issue or cancel one document. Stock moves happen inside the function, under a per-shop lock. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { docId } = await params;
  if (!isUuid(docId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = parseDocAction(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const issuing = parsed.value.action === "issue";
  const { data, error } = await createAdminSupabaseClient().rpc(issuing ? "consignment_issue" : "consignment_cancel", { p_doc_id: docId });
  if (error) {
    const mapped = retailRpcError(error.message);
    if (mapped.status === 500) console.error("[retail] action failed:", error);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
  return NextResponse.json(issuing ? { doc: data } : { result: data });
}
