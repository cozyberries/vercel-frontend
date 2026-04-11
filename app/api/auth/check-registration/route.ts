import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import { findUserIdByPhone, findAuthUserByEmail } from "@/lib/auth-phone";
import { validateEmail } from "@/lib/utils/validation";

export const maxDuration = 15;

const RATE_LIMIT_KEY_PREFIX = "check_registration";
const RATE_LIMIT_LIMIT = 10;
const RATE_LIMIT_WINDOW = 900; // 15 min

const IP_RATE_LIMIT_KEY_PREFIX = "check_registration_ip";
const IP_RATE_LIMIT_LIMIT = 30;
const IP_RATE_LIMIT_WINDOW = 900; // 15 min

export type CheckRegistrationStatus =
  | "none"
  | "phone_exists"
  | "email_exists_no_phone"
  | "email_exists_with_phone"
  | "already_registered"
  | "both_exist_separate_accounts";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { phone, email } = body;

  if (!phone || String(phone).trim() === "") {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  const digits = normalizePhone(String(phone));
  if (digits.length !== 10 || !/^[6-9]/.test(digits)) {
    return NextResponse.json(
      { error: "Invalid phone number. Must be a valid 10-digit Indian mobile number." },
      { status: 400 }
    );
  }

  // 1. IP-based rate limit (enumeration defence — must run first)
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    (() => {
      console.warn(
        "[check-registration] Could not determine client IP — x-forwarded-for and x-real-ip both absent. Falling back to shared bucket 'unknown'."
      );
      return "unknown";
    })();
  const ipRateLimit = await UpstashService.checkRateLimit(
    `${IP_RATE_LIMIT_KEY_PREFIX}:${ip}`,
    IP_RATE_LIMIT_LIMIT,
    IP_RATE_LIMIT_WINDOW
  );
  if (!ipRateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  // 2. Per-phone rate limit
  const rateLimit = await UpstashService.checkRateLimit(
    `${RATE_LIMIT_KEY_PREFIX}:${digits}`,
    RATE_LIMIT_LIMIT,
    RATE_LIMIT_WINDOW
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const rawEmail = typeof email === "string" ? email.trim() : undefined;
    const validEmail =
      rawEmail && validateEmail(rawEmail).isValid ? rawEmail : undefined;

    const [phoneUser, emailUser] = await Promise.all([
      findUserIdByPhone(digits),
      validEmail ? findAuthUserByEmail(validEmail) : Promise.resolve(null),
    ]);

    // Both phone and email found
    if (phoneUser && emailUser) {
      if (phoneUser.userId === emailUser.id) {
        return NextResponse.json({
          status: "already_registered" satisfies CheckRegistrationStatus,
          message:
            "This phone and email are already linked to the same account.",
        });
      }
      // Phone and email belong to two separate accounts — block, don't merge silently
      return NextResponse.json({
        status: "both_exist_separate_accounts" satisfies CheckRegistrationStatus,
        message:
          "This phone number and email address are registered to separate accounts. Please sign in with one of them instead.",
      });
    }

    // Only phone found
    if (phoneUser) {
      return NextResponse.json({
        status: "phone_exists" satisfies CheckRegistrationStatus,
        message:
          "This phone number is already registered. Verifying will sign you into the existing account.",
      });
    }

    // Only email found — check whether that account already has a phone
    if (emailUser) {
      const supabase = createAdminSupabaseClient();
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", emailUser.id)
        .maybeSingle();

      if (profileRow?.phone) {
        return NextResponse.json({
          status: "email_exists_with_phone" satisfies CheckRegistrationStatus,
          message:
            "This email is registered with a different phone number. Verifying will replace it with the new number.",
        });
      }

      return NextResponse.json({
        status: "email_exists_no_phone" satisfies CheckRegistrationStatus,
        message:
          "This email is already registered. Verifying will link your phone number to that account.",
      });
    }

    return NextResponse.json({
      status: "none" satisfies CheckRegistrationStatus,
      message: "",
    });
  } catch (err) {
    console.error("[check-registration] error:", err);
    // Fail open — a DB blip should not block registration
    return NextResponse.json({
      status: "none" satisfies CheckRegistrationStatus,
      message: "",
    });
  }
}
