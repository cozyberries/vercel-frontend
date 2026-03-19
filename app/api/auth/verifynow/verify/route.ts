import { NextRequest, NextResponse } from "next/server";
import { appendFileSync } from "fs";
import { join } from "path";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { findUserIdByPhone, createPhoneUser } from "@/lib/auth-phone";
import {
  getAuthToken,
  validateOtp,
  getVerifyNowUserMessage,
  type VerifyNowFlowType,
} from "@/lib/verifynow";

const DEBUG_LOG = join(process.cwd(), ".cursor", "debug-eb0f9c.log");
function debugLog(payload: Record<string, unknown>) {
  try {
    appendFileSync(DEBUG_LOG, JSON.stringify({ ...payload, timestamp: Date.now() }) + "\n");
  } catch {
    // ignore
  }
}

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

  // Use the same authToken and verificationId from the send OTP response (client sends token in header).
  const headerAuthToken =
    request.headers.get("authToken") ?? request.headers.get("authtoken");
  const bodyAuthToken = (body as { authToken?: string }).authToken;
  const authTokenFromRequest =
    (typeof headerAuthToken === "string" && headerAuthToken.trim()
      ? headerAuthToken.trim()
      : null) ??
    (typeof bodyAuthToken === "string" && bodyAuthToken.trim()
      ? bodyAuthToken.trim()
      : null);

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

  if (!authTokenFromRequest) {
    return NextResponse.json(
      {
        error: "Session expired. Please go back and request a new OTP.",
      },
      { status: 400 }
    );
  }

  const verificationIdStr = String(verificationId).trim();
  const codeStr = String(code).trim();
  const flowTypeTyped = flowType as VerifyNowFlowType;

  // #region agent log
  debugLog({ sessionId: "eb0f9c", location: "verify/route.ts:entry", message: "verify received", data: { authTokenLen: authTokenFromRequest.length, fromHeader: !!headerAuthToken?.trim(), fromBody: !!bodyAuthToken?.trim(), verificationId: verificationIdStr, flowType: flowTypeTyped, codeLen: codeStr.length }, hypothesisId: "H1,H2,H4" });
  fetch('http://127.0.0.1:7778/ingest/2101fafd-1cc9-4546-b3ee-1ef67d077cb2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb0f9c'},body:JSON.stringify({sessionId:'eb0f9c',location:'verify/route.ts:entry',message:'verify received',data:{authTokenLen:authTokenFromRequest.length,fromHeader:!!headerAuthToken?.trim(),fromBody:!!bodyAuthToken?.trim(),verificationId:verificationIdStr,flowType:flowTypeTyped,codeLen:codeStr.length},timestamp:Date.now(),hypothesisId:'H1,H2,H4'})}).catch(()=>{});
  // #endregion

  try {
    await validateOtp(
      authTokenFromRequest,
      verificationIdStr,
      codeStr,
      flowTypeTyped
    );
  } catch (otpError) {
    const is401 =
      otpError instanceof Error &&
      /401|validateOtp failed: 401/.test(otpError.message);
    // #region agent log
    debugLog({ sessionId: "eb0f9c", location: "verify/route.ts:catch", message: "validateOtp error", data: { is401, message: otpError instanceof Error ? otpError.message : String(otpError) }, hypothesisId: "H3" });
    fetch('http://127.0.0.1:7778/ingest/2101fafd-1cc9-4546-b3ee-1ef67d077cb2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb0f9c'},body:JSON.stringify({sessionId:'eb0f9c',location:'verify/route.ts:catch',message:'validateOtp error',data:{is401,message:otpError instanceof Error?otpError.message:String(otpError)},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    if (is401) {
      try {
        const freshToken = await getAuthToken();
        // #region agent log
        debugLog({ sessionId: "eb0f9c", location: "verify/route.ts:retry", message: "retry with fresh token", data: { freshTokenLen: freshToken.length }, hypothesisId: "H3" });
        fetch('http://127.0.0.1:7778/ingest/2101fafd-1cc9-4546-b3ee-1ef67d077cb2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb0f9c'},body:JSON.stringify({sessionId:'eb0f9c',location:'verify/route.ts:retry',message:'retry with fresh token',data:{freshTokenLen:freshToken.length},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        await validateOtp(
          freshToken,
          verificationIdStr,
          codeStr,
          flowTypeTyped
        );
      } catch (retryError) {
        // #region agent log
        debugLog({ sessionId: "eb0f9c", location: "verify/route.ts:retryFailed", message: "retry failed", data: { message: retryError instanceof Error ? retryError.message : String(retryError) }, hypothesisId: "H3" });
        fetch('http://127.0.0.1:7778/ingest/2101fafd-1cc9-4546-b3ee-1ef67d077cb2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'eb0f9c'},body:JSON.stringify({sessionId:'eb0f9c',location:'verify/route.ts:retryFailed',message:'retry failed',data:{message:retryError instanceof Error?retryError.message:String(retryError)},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        console.error("[verifynow/verify] retry with fresh token failed:", retryError);
        const err = retryError instanceof Error ? retryError : new Error(String(retryError));
        const { status, error: userMessage } = getVerifyNowUserMessage(err.message);
        const errBody: { error: string; details?: string } = { error: userMessage };
        if (process.env.NODE_ENV === "development")
          errBody.details = err.message + (err.cause ? ` (${String(err.cause)})` : "");
        return NextResponse.json(errBody, { status });
      }
    } else {
      const err = otpError instanceof Error ? otpError : new Error(String(otpError));
      const cause = err.cause ? ` (${String(err.cause)})` : "";
      const message = err.message + cause;
      console.error("[verifynow/verify] OTP/token error:", message);
      const { status, error: userMessage } = getVerifyNowUserMessage(err.message);
      const errBody: { error: string; details?: string } = { error: userMessage };
      if (process.env.NODE_ENV === "development") errBody.details = message;
      return NextResponse.json(errBody, { status });
    }
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

    const origin = getBaseUrl(request);
    const redirectRaw =
      bodyRedirect ?? request.cookies.get("auth_redirect")?.value ?? "";
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
