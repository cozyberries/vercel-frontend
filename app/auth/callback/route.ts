import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Error exchanging code for session:", error);
      // Redirect to login with error
      return NextResponse.redirect(
        new URL("/login?error=auth_callback_error", request.url)
      );
    }

    // After successful authentication, ensure user profile exists
    if (data?.user) {
      try {
        // Check if profile exists
        const { data: existingProfile } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("id", data.user.id)
          .single();

        // If profile doesn't exist, create it
        if (!existingProfile) {
          const { error: profileError } = await supabase
            .from("user_profiles")
            .insert({
              id: data.user.id,
              role: "customer",
              full_name: data.user.user_metadata?.full_name || null,
              is_active: true,
              is_verified: true, // Email is verified after confirmation
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

          if (profileError) {
            console.error("Error creating user profile in callback:", profileError);
            // Don't fail the auth flow if profile creation fails
          }
        } else {
          // Update verification status if profile exists
          await supabase
            .from("user_profiles")
            .update({
              is_verified: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", data.user.id);
        }
      } catch (profileError) {
        console.error("Error handling user profile in callback:", profileError);
        // Don't fail the auth flow if profile creation fails
      }
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
