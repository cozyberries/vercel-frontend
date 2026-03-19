import { NextRequest, NextResponse } from "next/server";
import { UpstashService } from "@/lib/upstash";
import { getAuthToken, sendOtp, type VerifyNowFlowType } from "@/lib/verifynow";

const FLOW_TYPES: VerifyNowFlowType[] = ["SMS", "WHATSAPP"];
const INTENTS = ["register", "login"] as const;
const RATE_LIMIT_KEY_PREFIX = "otp_send";
const RATE_LIMIT_LIMIT = 5;
const RATE_LIMIT_WINDOW = 900; // 15 min
const OTP_TIMEOUT_SECONDS = 60;

function parseVerifyNowError(message: string): { status: number; error: string } {
  if (message.includes("code: 800")) {
    return { status: 429, error: "Too many attempts. Try again later." };
  }
  if (message.includes("511") || message.includes("code: 5")) {
    return { status: 502, error: "Something went wrong. Please try again." };
  }
  return { status: 502, error: "Something went wrong. Please try again." };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { phone, flowType, intent } = body;

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

    if (!FLOW_TYPES.includes(flowType)) {
      return NextResponse.json(
        { error: "flowType must be SMS or WHATSAPP" },
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

    const token = await getAuthToken();
    const { verificationId } = await sendOtp(
      token,
      normalizedPhone,
      flowType as VerifyNowFlowType
    );

    return NextResponse.json({
      verificationId,
      timeout: OTP_TIMEOUT_SECONDS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const { status, error: userError } = parseVerifyNowError(message);
    return NextResponse.json({ error: userError }, { status });
  }
}
