import { NextRequest, NextResponse } from "next/server";
import { PostgrestError } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { generateNameFromEmail, validateRequiredPhoneNumber } from "@/lib/utils/validation";
import { UpstashService } from "@/lib/upstash";

// Initialize user profile after signup.
// Called by the client immediately after signUp(); no session is available yet when
// email confirmation is required, so we do not require session. Security: we verify
// the user exists in auth.users and email matches, plus rate limit per userId.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, email, phone } = body;

    if (!userId || !email) {
      return NextResponse.json(
        { error: "userId and email are required" },
        { status: 400 }
      );
    }

    // --- Rate limiting: 2 profile creations per user per hour ---
    const rateLimit = await UpstashService.checkRateLimit(`create_profile:${userId}`, 2, 3600);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Validate phone if provided
    if (phone) {
      const phoneValidation = validateRequiredPhoneNumber(phone);
      if (!phoneValidation.isValid) {
        return NextResponse.json(
          { error: phoneValidation.error || "Invalid phone number" },
          { status: 400 }
        );
      }
    }

    // Use admin client to bypass RLS
    const supabase = createAdminSupabaseClient();

    // Verify the user exists in auth.users
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
    
    if (authError || !authUser) {
      return NextResponse.json(
        { error: "User not found", details: authError?.message },
        { status: 404 }
      );
    }

    // Verify email matches (case-insensitive)
    if (authUser.user.email?.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        { error: "Email mismatch" },
        { status: 400 }
      );
    }

    // Generate name from email
    const generatedName = generateNameFromEmail(email);

    // Try to create profile in both tables (profiles and user_profiles)
    // First try user_profiles (used by admin routes)
    const now = new Date().toISOString();
    let profileData = null;
    let hasError = false;
    let errorDetails: Record<string, PostgrestError> = {};

    // Try user_profiles first
    const { data: userProfileData, error: userProfileError } = await supabase
      .from("user_profiles")
      .upsert(
        {
          id: userId,
          full_name: generatedName,
          role: "customer",
          is_active: true,
          updated_at: now,
        },
        {
          onConflict: "id",
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (!userProfileError && userProfileData) {
      profileData = userProfileData;
    } else if (userProfileError) {
      errorDetails.user_profiles = userProfileError;
      hasError = true;
    }

    // Also try profiles table (used by profile routes)
    const profilesPayload: Record<string, string> = {
      id: userId,
      full_name: generatedName,
      updated_at: now,
    };
    if (phone) {
      profilesPayload.phone = phone.replace(/\D/g, "");
    }
    const { data: profileDataAlt, error: profileErrorAlt } = await supabase
      .from("profiles")
      .upsert(profilesPayload, {
        onConflict: "id",
      })
      .select()
      .single();

    // If user_profiles failed but profiles succeeded, that's okay
    if (userProfileError && !profileErrorAlt && profileDataAlt) {
      profileData = profileDataAlt;
      hasError = false; // Success in profiles table
    } else if (profileErrorAlt && !profileData) {
      // Only mark as error if we don't have profileData from user_profiles
      errorDetails.profiles = profileErrorAlt;
      hasError = true;
    }

    // If both failed, return error
    if (hasError && !profileData) {
      console.error("Error creating user profile:", errorDetails);

      return NextResponse.json(
        {
          error: "Failed to create user profile",
          details: errorDetails.user_profiles?.message || errorDetails.profiles?.message || "Unknown error",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: profileData || { id: userId, full_name: generatedName },
      generatedName,
    });
  } catch (error) {
    console.error("Error in POST /api/users/create-profile:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    );
  }
}