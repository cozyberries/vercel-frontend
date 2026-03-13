import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { generateNameFromEmail } from "@/lib/utils/validation";
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
  } catch (error) {
    return false;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return false;
  if (decoded.includes(":")) return false;
  return true;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const base = getBaseUrl(request);
  const authRedirectRaw = request.cookies.get("auth_redirect")?.value;
  const authRedirect = authRedirectRaw && isSafeRedirect(authRedirectRaw) ? decodeURIComponent(authRedirectRaw) : null;

  const clearAuthRedirectCookie = (response: NextResponse) => {
    response.cookies.set("auth_redirect", "", { path: "/", maxAge: 0 });
    return response;
  };

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Error exchanging code for session:", error);
      const loginUrl = new URL("/login", base);
      loginUrl.searchParams.set("error", "auth_callback_error");
      if (authRedirect) loginUrl.searchParams.set("redirect", authRedirect);
      return NextResponse.redirect(loginUrl);
    }

    // If this is a new OAuth user, create their profile
    if (data?.user && data?.user.email) {
      try {
        // Use admin client to check and create profile
        const adminSupabase = createAdminSupabaseClient();

        // Check if profile exists
        const { data: existingProfile } = await adminSupabase
          .from("user_profiles")
          .select("id")
          .eq("id", data.user.id)
          .single();

        // If no profile exists, create one
        if (!existingProfile) {
          // Use name from user_metadata (from OAuth provider) or generate from email
          const fullName =
            data.user.user_metadata?.full_name ||
            data.user.user_metadata?.name ||
            generateNameFromEmail(data.user.email);

          const now = new Date().toISOString();

          // Create profile in user_profiles table
          await adminSupabase
            .from("user_profiles")
            .upsert(
              {
                id: data.user.id,
                full_name: fullName,
                role: "customer",
                is_active: true,
                created_at: now,
                updated_at: now,
              },
              {
                onConflict: "id",
              }
            );

          // Also create in profiles table if it exists
          await adminSupabase
            .from("profiles")
            .upsert(
              {
                id: data.user.id,
                full_name: fullName,
                created_at: now,
                updated_at: now,
              },
              {
                onConflict: "id",
              }
            );

          // New user — redirect to complete profile (phone required)
          const completeUrl = new URL("/complete-profile", base);
          if (authRedirect) completeUrl.searchParams.set("redirect", authRedirect);
          return clearAuthRedirectCookie(NextResponse.redirect(completeUrl));
        }

        // Existing user — check if phone is missing
        const { data: profileWithPhone, error: phoneCheckError } = await adminSupabase
          .from("profiles")
          .select("phone")
          .eq("id", data.user.id)
          .single();

        if (phoneCheckError) {
          console.error("Error checking phone:", phoneCheckError);
          const completeUrl = new URL("/complete-profile", base);
          if (authRedirect) completeUrl.searchParams.set("redirect", authRedirect);
          return clearAuthRedirectCookie(NextResponse.redirect(completeUrl));
        }

        if (!profileWithPhone?.phone) {
          const completeUrl = new URL("/complete-profile", base);
          if (authRedirect) completeUrl.searchParams.set("redirect", authRedirect);
          return clearAuthRedirectCookie(NextResponse.redirect(completeUrl));
        }
      } catch (profileError) {
        console.error("Error creating OAuth user profile:", profileError);
        const completeUrl = new URL("/complete-profile", base);
        if (authRedirect) completeUrl.searchParams.set("redirect", authRedirect);
        return clearAuthRedirectCookie(NextResponse.redirect(completeUrl));
      }
    }

    // Existing user with phone — redirect to intended destination or home
    const destination = authRedirect || "/";
    const res = NextResponse.redirect(new URL(destination, base));
    return clearAuthRedirectCookie(res);
  }

  // No code — redirect to home or intended destination
  const destination = authRedirect || "/";
  const res = NextResponse.redirect(new URL(destination, base));
  return clearAuthRedirectCookie(res);
}
