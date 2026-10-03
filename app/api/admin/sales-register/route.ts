import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { loadSalesRegister } from "@/lib/gst/register-orders";
import { NO_STORE, readRegisterRequest } from "@/lib/gst/register-route";

export const dynamic = "force-dynamic";

/** One month's GST sales register as JSON, for the /admin/sales-register preview. Live read, no cache. */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const req = readRegisterRequest(request, new Date());
  if (!req.ok) return req.response;

  try {
    const register = await loadSalesRegister(createAdminSupabaseClient(), req);
    return NextResponse.json({ register }, { headers: NO_STORE });
  } catch (e) {
    console.error("[sales-register]", e);
    return NextResponse.json({ error: "Couldn't load the sales register" }, { status: 500, headers: NO_STORE });
  }
}
