import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { findUserIdByPhone, createPhoneUser } from "@/lib/auth-phone";
import {
  getAuthToken,
  validateOtp,
  getVerifyNowUserMessage,
  type VerifyNowFlowType,
} from "@/lib/verifynow";

const FLOW_TYPES: VerifyNowFlowType[] = ["SMS", "WHATSAPP"];
const INTENTS = ["register", "login"] as const;

function getBaseUrl(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  const requestUrl = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    requestUrl.host;
  const protocolRaw =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    requestUrl.protocol;
  const protocol = protocolRaw.replace(/:$/, "");
  if (host && (host.startsWith("localhost") || host.includes("127.0.0.1"))) {
    return "http://localhost:3000";
  }
  return `${protocol}://${host}`;
}

function isSafeRedirect(path: string | null): path is string {
  if (!path || typeof path !== "string") return false;
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return false;
  if (decoded.includes(":")) return false;
  return true;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const {
    verificationId,
    code,
    flowType,
    intent,
    phone,
    redirect: bodyRedirect,
  } = body;

  if (
    verificationId == null ||
    String(verificationId).trim() === "" ||
    code == null ||
    String(code).trim() === ""
  ) {
    return NextResponse.json(
      { error: "verificationId and code are required" },
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

  if (phone == null || String(phone).trim() === "") {
    return NextResponse.json(
      { error: "phone is required" },
      { status: 400 }
    );
  }

  const normalizedPhone = normalizePhone(String(phone));
  if (normalizedPhone.length !== 10) {
    return NextResponse.json(
      { error: "Invalid phone number. Must be 10 digits." },
      { status: 400 }
    );
  }

  try {
    const token = await getAuthToken();
    await validateOtp(
      token,
      String(verificationId).trim(),
      String(code).trim(),
      flowType as VerifyNowFlowType
    );
  } catch (otpError) {
    const message =
      otpError instanceof Error ? otpError.message : String(otpError);
    const { status, error: userMessage } = getVerifyNowUserMessage(message);
    return NextResponse.json({ error: userMessage }, { status });
  }

  try {
    let email: string;

    const existing = await findUserIdByPhone(normalizedPhone);
    if (existing) {
      email = existing.email;
    } else if (intent === "login") {
      return NextResponse.json(
        {
          error: "No account with this number. Please register first.",
        },
        { status: 404 }
      );
    } else {
      const created = await createPhoneUser(normalizedPhone);
      email = created.email;
    }

    const supabase = createAdminSupabaseClient();
    const { data: linkData, error: linkError } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

    if (linkError) {
      console.error("generateLink error:", linkError);
      return NextResponse.json(
        { error: "Unable to complete sign in. Please try again." },
        { status: 500 }
      );
    }

    const hashedToken = (linkData as { properties?: { hashed_token?: string } })
      ?.properties?.hashed_token;
    if (!hashedToken || typeof hashedToken !== "string") {
      console.error("generateLink: missing hashed_token in response");
      return NextResponse.json(
        { error: "Unable to complete sign in. Please try again." },
        { status: 500 }
      );
    }

    const origin = getBaseUrl(request);
    const redirectRaw =
      bodyRedirect ?? request.cookies.get("auth_redirect")?.value ?? "";
    const redirect = isSafeRedirect(redirectRaw)
      ? decodeURIComponent(redirectRaw)
      : "/profile";

    const redirectUrl = `${origin}/auth/phone/callback?token_hash=${encodeURIComponent(hashedToken)}&redirect=${encodeURIComponent(redirect)}`;

    return NextResponse.json({ redirectUrl });
  } catch (err) {
    console.error("Verify OTP user/link error:", err);
    return NextResponse.json(
      { error: "Unable to complete sign in. Please try again." },
      { status: 500 }
    );
  }
}
