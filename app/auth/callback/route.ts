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

  // Use only the environment variable for redirect
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!baseUrl) {
    console.error("NEXT_PUBLIC_SITE_URL environment variable is not set");
    // Fallback to using request URL for this critical redirect
    const { protocol, host } = requestUrl;
    return NextResponse.redirect(new URL("/", `${protocol}//${host}`));
  }

  // Redirect to home page after successful authentication
  return NextResponse.redirect(new URL("/", baseUrl));
}
