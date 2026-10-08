import { NextResponse, type NextRequest } from "next/server";
import readExcelFile from "read-excel-file/node";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { XLSX_CONTENT_TYPE } from "@/lib/gst/register-xlsx";
import { currentPeriod, isPeriod } from "@/lib/retail/dates";
import { loadRetailerDetail, shopName } from "@/lib/retail/queries";
import { isUuid } from "@/lib/retail/requests";
import { retailRpcError } from "@/lib/retail/rpc-errors";
import { buildSalesSheet, parseSalesSheet, salesSheetFileName, type ParsedSheet } from "@/lib/retail/sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_BYTES = 1024 * 1024;

function validMonth(value: unknown, now: Date): value is string {
  return isPeriod(value) && value <= currentPeriod(now);
}

/** The month's sales sheet, pre-filled with what the shop holds. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  const now = new Date();
  const month = request.nextUrl.searchParams.get("month");
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!validMonth(month, now)) return NextResponse.json({ error: "Pick a month up to this one" }, { status: 400 });

  try {
    const detail = await loadRetailerDetail(createAdminSupabaseClient(), id, now);
    if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const name = shopName(detail.retailer);
    const file = await buildSalesSheet({ shop: { id, name }, month, holdings: detail.holdings });
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${salesSheetFileName(name, month)}"`,
        ...NO_STORE,
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    console.error("[retail] sheet download failed:", e);
    return NextResponse.json({ error: "Couldn't make the sheet" }, { status: 500 });
  }
}

/** A filled sheet becomes the month's draft sale. Nothing is saved while any row is wrong. The file is not stored. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;
  const now = new Date();
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const month = form?.get("month");
  const file = form?.get("file");
  if (!validMonth(month, now)) return NextResponse.json({ error: "Pick a month up to this one" }, { status: 400 });
  if (!(file instanceof Blob)) return NextResponse.json({ error: "Choose the filled .xlsx file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 1 MB" }, { status: 413 });

  let sheets: ParsedSheet[];
  try {
    sheets = (await readExcelFile(Buffer.from(await file.arrayBuffer()))) as ParsedSheet[];
  } catch {
    return NextResponse.json({ error: "That file isn't a readable .xlsx" }, { status: 400 });
  }

  try {
    const admin = createAdminSupabaseClient();
    const detail = await loadRetailerDetail(admin, id, now);
    if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = parseSalesSheet(sheets, { shop: { id, name: shopName(detail.retailer) }, month, holdings: detail.holdings });
    if (!parsed.ok) {
      return parsed.rowErrors
        ? NextResponse.json({ error: "Fix these rows in the sheet and upload it again", rowErrors: parsed.rowErrors }, { status: 422 })
        : NextResponse.json({ error: parsed.fileError }, { status: 400 });
    }
    const { data, error } = await admin.rpc("consignment_save_sale", { p_retailer_id: id, p_period: month, p_lines: parsed.lines, p_actor: gate.user.id });
    if (error) {
      const mapped = retailRpcError(error.message);
      if (mapped.status === 500) console.error("[retail] sheet save failed:", error);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }
    return NextResponse.json({ doc_id: data }, { status: 201 });
  } catch (e) {
    console.error("[retail] sheet upload failed:", e);
    return NextResponse.json({ error: "Couldn't read the sheet" }, { status: 500 });
  }
}
