import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

function getBaseUrl(request: NextRequest): string {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || requestUrl.host;
  const protocolRaw =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || requestUrl.protocol;
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

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const redirectParam = requestUrl.searchParams.get("redirect");
  const base = getBaseUrl(request);
  const safeRedirect = redirectParam && isSafeRedirect(redirectParam) ? decodeURIComponent(redirectParam) : null;

  const clearAuthRedirectCookie = (response: NextResponse) => {
    response.cookies.set("auth_redirect", "", { path: "/", maxAge: 0 });
    return response;
  };

  if (!tokenHash) {
    const loginUrl = new URL("/login", base);
    loginUrl.searchParams.set("error", "phone_callback_error");
    if (safeRedirect) loginUrl.searchParams.set("redirect", safeRedirect);
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });

  if (error) {
    console.error("Error verifying phone OTP:", error);
    const loginUrl = new URL("/login", base);
    loginUrl.searchParams.set("error", "phone_callback_error");
    if (safeRedirect) loginUrl.searchParams.set("redirect", safeRedirect);
    return NextResponse.redirect(loginUrl);
  }

  const destination = safeRedirect ?? "/profile";
  const res = NextResponse.redirect(new URL(destination, base));
  return clearAuthRedirectCookie(res);
}
