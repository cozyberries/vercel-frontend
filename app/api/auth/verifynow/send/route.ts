import { NextRequest, NextResponse } from "next/server";
import { UpstashService } from "@/lib/upstash";
import { findUserIdByPhone } from "@/lib/auth-phone";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { blockIfImpersonating } from "@/lib/utils/impersonation-guard";
import {
  getAuthTokenFromEnv,
  sendOtp,
  getVerifyNowUserMessage,
} from "@/lib/verifynow";

/** Keep under Vercel limit (Hobby 10s); allows VerifyNow request timeout to complete. */
export const maxDuration = 15;

const INTENTS = ["register", "login", "link"] as const;
const NO_ACCOUNT_MESSAGE = "No account with this number. Please register first.";
const NUMBER_IN_USE_MESSAGE = "This number is already on another account";
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
        { error: "intent must be register, login or link" },
        { status: 400 }
      );
    }

    // link: attach a verified phone to the signed-in account (Google-created admins have none).
    let linkUserId: string | null = null;
    if (intent === "link") {
      // An admin acting as a customer must never attach a phone to either account.
      const blocked = await blockIfImpersonating();
      if (blocked) return blocked;
      const session = await createServerSupabaseClient();
      const {
        data: { user },
      } = await session.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      linkUserId = user.id;
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

    if (intent === "login" || intent === "link") {
      const existing = await findUserIdByPhone(normalizedPhone);
      if (intent === "login" && !existing) {
        return NextResponse.json({ error: NO_ACCOUNT_MESSAGE }, { status: 404 });
      }
      if (intent === "link" && existing && existing.userId !== linkUserId) {
        return NextResponse.json({ error: NUMBER_IN_USE_MESSAGE }, { status: 409 });
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
