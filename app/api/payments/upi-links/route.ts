import { NextRequest, NextResponse } from "next/server";
import { effectiveUserErrorResponse, getEffectiveUser } from "@/lib/services/effective-user";
import { isSessionExpired } from "@/lib/utils/checkout-helpers";
import { buildUpiPayUrl, readUpiPayee, upiAppLinks } from "@/lib/payments/upi";
import QRCode from "qrcode";

export async function GET(request: NextRequest) {
    try {
        // Staff placing a stall order act as the customer: the order belongs to the impersonated
        // user, not to the admin's session, so scope by the effective user like /api/orders/[id].
        const effective = await getEffectiveUser();
        if (!effective.ok) {
            return effectiveUserErrorResponse(effective);
        }
        const { userId, client: supabase } = effective;

        const sessionId = request.nextUrl.searchParams.get("sessionId");
        const orderId = request.nextUrl.searchParams.get("orderId");

        if (!sessionId && !orderId) {
            return NextResponse.json({ error: "sessionId or orderId is required" }, { status: 400 });
        }

        let totalAmount: number;
        let reference: string;

        if (sessionId) {
            // New flow: checkout session
            const { data: session, error: sessionError } = await supabase
                .from("checkout_sessions")
                .select("id, total_amount, user_id, status, created_at")
                .eq("id", sessionId)
                .eq("user_id", userId)
                .single();

            if (sessionError || !session) {
                return NextResponse.json({ error: "Session not found" }, { status: 404 });
            }

            if (session.status !== "pending" || isSessionExpired(session.created_at)) {
                return NextResponse.json({ error: "Session has expired" }, { status: 410 });
            }

            totalAmount = session.total_amount;
            reference = session.id;
        } else {
            // Legacy flow: order-based
            const { data: order, error: orderError } = await supabase
                .from("orders")
                .select("id, total_amount, order_number, user_id, status")
                .eq("id", orderId!)
                .eq("user_id", userId)
                .single();

            if (orderError || !order) {
                return NextResponse.json({ error: "Order not found" }, { status: 404 });
            }

            if (order.status !== "payment_pending") {
                return NextResponse.json({ error: "Order is not eligible for payment" }, { status: 409 });
            }

            totalAmount = order.total_amount;
            reference = order.order_number;
        }

        const payee = readUpiPayee();
        if (!payee) {
            return NextResponse.json({ error: "UPI payments not configured" }, { status: 503 });
        }

        // Amount and order reference are locked into the QR, so the customer cannot pay a different sum.
        const upiUrl = buildUpiPayUrl(payee, {
            amount: totalAmount,
            reference,
            note: `CozyBerries order ${reference}`,
        });

        // Rendered large so the image stays sharp at full card width on the payment page.
        const qrCodeDataUrl = await QRCode.toDataURL(upiUrl, {
            width: 720,
            margin: 2,
            color: { dark: "#000000", light: "#ffffff" },
            errorCorrectionLevel: "M",
        });

        return NextResponse.json({
            links: upiAppLinks(upiUrl),
            qrCode: qrCodeDataUrl,
            payee: { upiId: payee.upiId, payeeName: payee.payeeName },
        });

    } catch (error) {
        console.error("UPI Links Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
