import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getBusinessGstin } from "@/lib/config/gstin";
import { buildChallan, buildRetailInvoice, retailPdfFilename } from "@/lib/retail/documents";
import { renderChallanPdf, renderRetailInvoicePdf } from "@/lib/retail/pdf";
import { fetchChallanNumbers, fetchDoc, fetchRetailer } from "@/lib/retail/queries";
import { isUuid } from "@/lib/retail/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ docId: string }> };
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/** The challan or shop invoice as a PDF, built fresh per request. Never cached: it carries the shop's GSTIN and address. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { docId } = await params;
  if (!isUuid(docId)) return notFound();

  let gstin: string;
  try {
    gstin = getBusinessGstin();
  } catch (e) {
    console.error("[retail] BUSINESS_GSTIN misconfigured:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The GSTIN is not configured" }, { status: 500 });
  }

  try {
    const admin = createAdminSupabaseClient();
    const doc = await fetchDoc(admin, docId);
    if (!doc || doc.kind === "return") return notFound();
    const retailer = await fetchRetailer(admin, doc.retailer_id);
    if (!retailer) return notFound();

    const pdf =
      doc.kind === "sale"
        ? await renderRetailInvoicePdf(
            buildRetailInvoice({
              doc,
              retailer,
              gstin,
              challanNumbers: await fetchChallanNumbers(admin, doc.consignment_lines.map((l) => l.batch_line_id).filter((x): x is string => Boolean(x))),
            }),
          )
        : await renderChallanPdf(buildChallan({ doc, retailer, gstin }));

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${retailPdfFilename(doc)}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    console.error("[retail] pdf failed:", e);
    return NextResponse.json({ error: "Couldn't make the PDF" }, { status: 500 });
  }
}
