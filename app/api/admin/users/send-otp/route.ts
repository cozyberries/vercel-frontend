import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/services/effective-user";
import { UpstashService } from "@/lib/upstash";
import { getAuthTokenFromEnv, getVerifyNowUserMessage, sendOtp } from "@/lib/verifynow";
import { findExistingUser, parseNewCustomer } from "@/lib/services/admin-customer-accounts";

/** Keep under Vercel limit (Hobby 10s); allows the VerifyNow timeout to complete. */
export const maxDuration = 15;

const OTP_TIMEOUT_SECONDS = 60;
// Same budget as the customer signup route (/api/auth/verifynow/send), on the
// same key, so staff cannot be used to spam a number.
const RATE_LIMIT = 5;
const RATE_WINDOW_SECONDS = 900;

export async function POST(request: NextRequest) {
  try {
    const sessionClient = await createServerSupabaseClient();
    const {
      data: { user: sessionUser },
      error: sessionError,
    } = await sessionClient.auth.getUser();

    if (sessionError || !sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdmin(sessionUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = parseNewCustomer(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { normalizedEmail, phoneDigits } = parsed.value;

    let existing;
    try {
      existing = await findExistingUser(
        createAdminSupabaseClient() as SupabaseClient,
        normalizedEmail,
        phoneDigits
      );
    } catch (listError) {
      console.error("[admin-users-send-otp] listUsers error", listError);
      return NextResponse.json({ error: "Failed to verify duplicate users" }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json(
        { error: "Customer already has an account", existing_user_id: existing.id },
        { status: 409 }
      );
    }

    const rateLimit = await UpstashService.checkRateLimit(
      `otp_send:${phoneDigits}`,
      RATE_LIMIT,
      RATE_WINDOW_SECONDS
    );
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const { verificationId } = await sendOtp(getAuthTokenFromEnv(), phoneDigits);
    return NextResponse.json({ verificationId, timeout: OTP_TIMEOUT_SECONDS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[admin-users-send-otp] error:", message);
    const { status, error: userError } = getVerifyNowUserMessage(message);
    return NextResponse.json({ error: userError }, { status });
  }
}
