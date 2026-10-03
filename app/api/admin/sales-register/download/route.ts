import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { registerFileName } from "@/lib/gst/register-format";
import { loadSalesRegister } from "@/lib/gst/register-orders";
import { NO_STORE, readRegisterRequest } from "@/lib/gst/register-route";
import { registerXlsx, XLSX_CONTENT_TYPE } from "@/lib/gst/register-xlsx";

export const dynamic = "force-dynamic";

/** One month's GST sales register as a GSTR-1-ready .xlsx attachment. Built fresh per request. */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const req = readRegisterRequest(request, new Date());
  if (!req.ok) return req.response;

  try {
    const register = await loadSalesRegister(createAdminSupabaseClient(), req);
    const file = await registerXlsx(register);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${registerFileName(register.month, register.period)}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    console.error("[sales-register] download", e);
    return NextResponse.json({ error: "Couldn't download the register" }, { status: 500, headers: NO_STORE });
  }
}
