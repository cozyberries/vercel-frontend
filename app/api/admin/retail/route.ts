import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { loadRetailerList, RETAILER_COLUMNS } from "@/lib/retail/queries";
import { parseRetailer } from "@/lib/retail/requests";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

/** Every shop with its stock, money and six-month summary. Live read, no cache. */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  try {
    return NextResponse.json(await loadRetailerList(createAdminSupabaseClient(), new Date()), { headers: NO_STORE });
  } catch (e) {
    console.error("[retail] list failed:", e);
    return NextResponse.json({ error: "Couldn't load the shops" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const parsed = parseRetailer(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await createAdminSupabaseClient().from("retailers").insert(parsed.value).select(RETAILER_COLUMNS).single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "A shop with this GSTIN already exists" }, { status: 409 });
    }
    console.error("[retail] create failed:", error);
    return NextResponse.json({ error: "Couldn't save the shop" }, { status: 500 });
  }
  return NextResponse.json({ retailer: data }, { status: 201 });
}
