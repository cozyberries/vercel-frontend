import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { findUserIdByPhone, createPhoneUser } from "@/lib/auth-phone";
import { validateEmail } from "@/lib/utils/validation";
import {
  getAuthTokenFromEnv,
  validateOtp,
  getVerifyNowUserMessage,
} from "@/lib/verifynow";

/**
 * Phone OTP verify flow (must stay aligned with docs/plans/2026-03-19-phone-signup-login-flow.md):
 * 1. Validate OTP with VerifyNow.
 * 2. Register: if no user for phone → create user in Supabase (auth + profiles + user_profiles).
 * 3. Login: if no user for phone → 404 "Please register first".
 * 4. Generate magic link for user's email → return redirectUrl to /auth/phone/callback.
 * 5. Client redirects to callback → verifyOtp sets session → user lands on /profile (or safe redirect).
 */
const INTENTS = ["register", "login"] as const;

/**
 * Origin for redirect URLs (phone callback). Callback must hit the frontend so the
 * session cookie is set on the right domain. Local = localhost; production = frontend
 * domain (e.g. https://cozyberries.in), never the API subdomain (e.g. api.cozyberries.in).
 */
function getRedirectOrigin(request: NextRequest): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_FRONTEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const requestUrl = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    requestUrl.host;
  const protocolRaw =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    requestUrl.protocol;
  const protocol = protocolRaw.replace(/:$/, "");

  // Local: always use localhost so callback works without env
  if (host && (host.startsWith("localhost") || host.includes("127.0.0.1"))) {
    return "http://localhost:3000";
  }

  // Request hit api.* (e.g. api.cozyberries.in): use main site (e.g. https://cozyberries.in)
  // so callback and profile run on the frontend domain, not the API domain
  if (host && host.startsWith("api.")) {
    return `${protocol}://${host.slice(4)}`;
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
    intent,
    phone,
    redirect: bodyRedirect,
    fullName: bodyFullName,
    email: bodyEmail,
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

  const verificationIdStr = String(verificationId).trim();
  const codeStr = String(code).trim();

  try {
    const authToken = getAuthTokenFromEnv();
    await validateOtp(authToken, normalizedPhone, verificationIdStr, codeStr);
  } catch (otpError) {
    const err = otpError instanceof Error ? otpError : new Error(String(otpError));
    const message = err.message + (err.cause ? ` (${String(err.cause)})` : "");
    console.error("[verifynow/verify] OTP error:", message);
    const { status, error: userMessage } = getVerifyNowUserMessage(err.message);
    const errBody: { error: string; details?: string } = { error: userMessage };
    if (process.env.NODE_ENV === "development") errBody.details = message;
    return NextResponse.json(errBody, { status });
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
      const fullName = typeof bodyFullName === "string" ? bodyFullName.trim() : undefined;
      const rawEmail = typeof bodyEmail === "string" ? bodyEmail.trim() : undefined;
      const registerEmail =
        rawEmail && validateEmail(rawEmail).isValid ? rawEmail : undefined;
      const created = await createPhoneUser(normalizedPhone, {
        fullName: fullName || undefined,
        email: registerEmail,
      });
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
      const errMsg = linkError.message || String(linkError);
      const body: { error: string; details?: string } = {
        error: "Unable to complete sign in. Please try again.",
      };
      if (process.env.NODE_ENV === "development") body.details = `generateLink: ${errMsg}`;
      return NextResponse.json(body, { status: 500 });
    }

    const hashedToken = (linkData as { properties?: { hashed_token?: string } })
      ?.properties?.hashed_token;
    if (!hashedToken || typeof hashedToken !== "string") {
      console.error("generateLink: missing hashed_token in response");
      const body: { error: string; details?: string } = {
        error: "Unable to complete sign in. Please try again.",
      };
      if (process.env.NODE_ENV === "development")
        body.details = "generateLink: missing hashed_token in response";
      return NextResponse.json(body, { status: 500 });
    }

    // Origin where the app is served (e.g. https://cozyberries.in). Callback URL
    // must be on this origin so verifyOtp sets the session cookie on the right domain.
    const origin = getRedirectOrigin(request);
    const redirectRaw =
      bodyRedirect ?? request.cookies.get("auth_redirect")?.value ?? "";
    // Default destination after sign-in: profile page (user info is shown there).
    const redirect = isSafeRedirect(redirectRaw)
      ? decodeURIComponent(redirectRaw)
      : "/profile";

    const redirectUrl = `${origin}/auth/phone/callback?token_hash=${encodeURIComponent(hashedToken)}&redirect=${encodeURIComponent(redirect)}`;

    return NextResponse.json({ redirectUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Verify OTP user/link error:", err);
    const body: { error: string; details?: string } = {
      error: "Unable to complete sign in. Please try again.",
    };
    if (process.env.NODE_ENV === "development") body.details = message;
    return NextResponse.json(body, { status: 500 });
  }
}
