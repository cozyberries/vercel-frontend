import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { generateNameFromEmail } from "@/lib/utils/validation";
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

    // Get the correct base URL for redirect
    const getBaseUrl = () => {
      const { protocol, host } = requestUrl;
      return `${protocol}//${host}`;
    };

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
          return NextResponse.redirect(new URL("/complete-profile", getBaseUrl()));
        }

        // Existing user — check if phone is missing
        const { data: profileWithPhone, error: phoneCheckError } = await adminSupabase
          .from("profiles")
          .select("phone")
          .eq("id", data.user.id)
          .single();

        if (phoneCheckError) {
          console.error("Error checking phone:", phoneCheckError);
          // Safe fallback: prompt user to complete profile if check fails
          return NextResponse.redirect(new URL("/complete-profile", getBaseUrl()));
        }

        if (!profileWithPhone?.phone) {
          return NextResponse.redirect(new URL("/complete-profile", getBaseUrl()));
        }
      } catch (profileError) {
        // Don't fail the OAuth flow if profile creation fails
        console.error("Error creating OAuth user profile:", profileError);
        // Safe fallback: redirect to complete-profile so user can retry
        return NextResponse.redirect(new URL("/complete-profile", getBaseUrl()));
      }
    }

    // Existing user with phone — redirect to home
    return NextResponse.redirect(new URL("/", getBaseUrl()));
  }

  // No code — redirect to home
  const { protocol, host } = requestUrl;
  return NextResponse.redirect(new URL("/", `${protocol}//${host}`));
}
