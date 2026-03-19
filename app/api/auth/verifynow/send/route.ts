import { NextRequest, NextResponse } from "next/server";
import { UpstashService } from "@/lib/upstash";
import { findUserIdByPhone } from "@/lib/auth-phone";
import {
  getAuthTokenFromEnv,
  sendOtp,
  getVerifyNowUserMessage,
} from "@/lib/verifynow";

const INTENTS = ["register", "login"] as const;
const NO_ACCOUNT_MESSAGE = "No account with this number. Please register first.";
const RATE_LIMIT_KEY_PREFIX = "otp_send";
const RATE_LIMIT_LIMIT = 5;
const RATE_LIMIT_WINDOW = 900; // 15 min
const OTP_TIMEOUT_SECONDS = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { phone, intent } = body;

    if (phone == null || phone === "") {
      return NextResponse.json(
        { error: "phone is required" },
        { status: 400 }
      );
    }

    const normalizedPhone = String(phone).replace(/\D/g, "");
    if (normalizedPhone.length !== 10) {
      return NextResponse.json(
        { error: "Invalid phone number. Must be 10 digits." },
        { status: 400 }
      );
    }

    if (!INTENTS.includes(intent)) {
      return NextResponse.json(
        { error: "intent must be register or login" },
        { status: 400 }
      );
    }

    const rateLimit = await UpstashService.checkRateLimit(
      `${RATE_LIMIT_KEY_PREFIX}:${normalizedPhone}`,
      RATE_LIMIT_LIMIT,
      RATE_LIMIT_WINDOW
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // For login: only send OTP if the user already exists
    if (intent === "login") {
      const existing = await findUserIdByPhone(normalizedPhone);
      if (!existing) {
        return NextResponse.json(
          { error: NO_ACCOUNT_MESSAGE },
          { status: 404 }
        );
      }
    }

    const token = getAuthTokenFromEnv();
    const { verificationId } = await sendOtp(token, normalizedPhone);

    return NextResponse.json({
      verificationId,
      timeout: OTP_TIMEOUT_SECONDS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[verifynow/send] Error:", message);
    const { status, error: userError } = getVerifyNowUserMessage(message);
    const body: { error: string; details?: string } = { error: userError };
    if (process.env.NODE_ENV === "development") {
      body.details = message;
    }
    return NextResponse.json(body, { status });
  }
}
