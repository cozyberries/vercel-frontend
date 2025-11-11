import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = await req.json();

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // ✅ Use your actual secret key (MUST NOT be exposed client-side)
    const secret = process.env.RAZORPAY_KEY_SECRET;

    if (!secret) {
      throw new Error("RAZORPAY_KEY_SECRET is not defined in server environment");
    }

    // ✅ Generate expected signature
    const generated_signature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generated_signature === razorpay_signature) {
      return NextResponse.json({
        success: true,
        message: "Payment verified successfully",
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Payment verification failed: Signature mismatch" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Error verifying Razorpay signature:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
