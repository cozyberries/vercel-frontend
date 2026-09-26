import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getBusinessGstin } from "@/lib/config/gstin";
import { verifyBillSignature } from "@/lib/invoice/bill-link";
import { buildInvoice, type InvoiceOrderRow } from "@/lib/invoice/build-invoice";
import { renderInvoicePdf } from "@/lib/invoice/pdf";
import { invoicePdfFilename } from "@/lib/invoice/pdf-filename";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orderId: string; sig: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A wrong signature, a malformed id and a missing order all look the same, so
// the route never confirms whether an order id exists.
const notFound = () =>
  new NextResponse("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });

/**
 * Public bill PDF behind a signed link (see lib/invoice/bill-link.ts). The
 * service role is used only after the HMAC over this exact order id verifies,
 * and it reads that one order. Generated fresh on every open so a cancelled
 * order shows as cancelled; never cached anywhere because it carries PII.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { orderId, sig } = await params;
  if (!UUID.test(orderId)) return notFound();

  let valid: boolean;
  try {
    valid = verifyBillSignature(orderId, sig);
  } catch (configError) {
    console.error("[bill] INVOICE_LINK_SECRET misconfigured:", configError instanceof Error ? configError.message : configError);
    return NextResponse.json({ error: "Bills are temporarily unavailable" }, { status: 500 });
  }
  if (!valid) return notFound();

  try {
    const { data: order, error } = await createAdminSupabaseClient()
      .from("orders")
      .select("*, order_items(name, size, color, price, quantity), payments(payment_method, status)")
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      console.error("[bill] order lookup failed:", error);
      return NextResponse.json({ error: "Failed to load bill" }, { status: 500 });
    }
    if (!order) return notFound();

    let gstin: string;
    try {
      gstin = getBusinessGstin();
    } catch (configError) {
      console.error("[bill] BUSINESS_GSTIN misconfigured:", configError instanceof Error ? configError.message : configError);
      return NextResponse.json({ error: "Bills are temporarily unavailable" }, { status: 500 });
    }

    const doc = buildInvoice({
      order: { ...order, order_items: order.order_items ?? [], payments: order.payments ?? [] } as InvoiceOrderRow,
      gstin,
      homeStateCode: gstin.slice(0, 2),
    });
    const pdf = await renderInvoicePdf(doc);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoicePdfFilename(doc)}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("[bill] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
