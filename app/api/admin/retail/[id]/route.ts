import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { loadRetailerDetail, RETAILER_COLUMNS } from "@/lib/retail/queries";
import { isUuid, parseRetailer } from "@/lib/retail/requests";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
type Ctx = { params: Promise<{ id: string }> };
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });

export async function GET(_request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  try {
    const detail = await loadRetailerDetail(createAdminSupabaseClient(), id, new Date());
    return detail ? NextResponse.json({ detail }, { headers: NO_STORE }) : notFound();
  } catch (e) {
    console.error("[retail] detail failed:", e);
    return NextResponse.json({ error: "Couldn't load the shop" }, { status: 500, headers: NO_STORE });
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const parsed = parseRetailer(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await createAdminSupabaseClient()
    .from("retailers")
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(RETAILER_COLUMNS)
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "A shop with this GSTIN already exists" }, { status: 409 });
    }
    console.error("[retail] update failed:", error);
    return NextResponse.json({ error: "Couldn't save the shop" }, { status: 500 });
  }
  return data ? NextResponse.json({ retailer: data }) : notFound();
}
