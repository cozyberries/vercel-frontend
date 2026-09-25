import { NextRequest, NextResponse } from "next/server";
import {
  effectiveUserErrorResponse,
  getEffectiveUser,
} from "@/lib/services/effective-user";
import { getBusinessGstin } from "@/lib/config/gstin";
import { buildInvoice, type InvoiceOrderRow } from "@/lib/invoice/build-invoice";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result, { unauthenticatedMessage: "Authentication required" });
    }
    const { userId, client } = result;
    const { id } = await params;

    const { data: order, error } = await client
      .from("orders")
      .select("*, order_items(name, size, color, price, quantity), payments(payment_method, status)")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[invoice] order lookup failed:", error);
      return NextResponse.json({ error: "Failed to load invoice" }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    let gstin: string;
    try {
      gstin = getBusinessGstin();
    } catch (configError) {
      console.error("[invoice] BUSINESS_GSTIN misconfigured:", configError instanceof Error ? configError.message : configError);
      return NextResponse.json({ error: "Invoice is temporarily unavailable" }, { status: 500 });
    }

    const invoice = buildInvoice({
      order: { ...order, order_items: order.order_items ?? [], payments: order.payments ?? [] } as InvoiceOrderRow,
      gstin,
      homeStateCode: gstin.slice(0, 2),
    });
    return NextResponse.json({ invoice });
  } catch (error) {
    console.error("[invoice] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
