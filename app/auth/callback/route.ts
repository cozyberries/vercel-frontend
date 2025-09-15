import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Error exchanging code for session:", error);
      // Redirect to login with error
      return NextResponse.redirect(
        new URL("/login?error=auth_callback_error", request.url)
      );
    }
  }

  // Get the correct base URL for redirect
  const getBaseUrl = () => {
    // For Vercel deployments, use the request URL origin
    const { protocol, host } = requestUrl;
    return `${protocol}//${host}`;
  };

  // Redirect to home page after successful authentication
  return NextResponse.redirect(new URL("/", getBaseUrl()));
}
