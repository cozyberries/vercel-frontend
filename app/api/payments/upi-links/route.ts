import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import QRCode from "qrcode";

export async function GET(request: NextRequest) {
    try {
        const supabase = await createServerSupabaseClient();

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const orderId = request.nextUrl.searchParams.get("orderId");
        if (!orderId) {
            return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
        }

        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("id, total_amount, order_number, user_id")
            .eq("id", orderId)
            .eq("user_id", user.id)
            .single();

        if (orderError || !order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        const upiId = process.env.UPI_ID;
        const upiPayeeName = process.env.UPI_PAYEE_NAME;
        const upiAid = process.env.UPI_AID;

        if (!upiId || !upiPayeeName) {
            return NextResponse.json({ error: "UPI payments not configured" }, { status: 503 });
        }

        const amount = order.total_amount.toFixed(2);
        const payeeName = encodeURIComponent(upiPayeeName);
        const transactionNote = encodeURIComponent("Cozyberries Purchase");

        // pa (payee address) must NOT have @ encoded — UPI apps reject %40
        let baseParams = `pa=${upiId}&pn=${payeeName}`;
        if (upiAid) {
            baseParams += `&aid=${upiAid}`;
        }
        baseParams += `&am=${amount}&cu=INR&tn=${transactionNote}`;

        // Standard UPI intent URL for QR code (works with all UPI apps)
        const upiUrl = `upi://pay?${baseParams}`;

        // Generate QR code as data URL (base64 PNG)
        const qrCodeDataUrl = await QRCode.toDataURL(upiUrl, {
            width: 300,
            margin: 2,
            color: { dark: "#000000", light: "#ffffff" },
            errorCorrectionLevel: "M",
        });

        const links = {
            phonepe: `phonepe://pay?${baseParams}`,
            gpay: `tez://upi/pay?${baseParams}`,
            paytm: `paytmmp://pay?${baseParams}`,
        };

        return NextResponse.json({ links, qrCode: qrCodeDataUrl });

    } catch (error) {
        console.error("UPI Links Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
