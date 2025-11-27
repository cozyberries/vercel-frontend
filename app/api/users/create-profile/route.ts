import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { generateNameFromEmail } from "@/lib/utils/validation";

// Initialize user profile after signup
// This endpoint uses admin client to bypass RLS and create profile
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, email } = body;

    if (!userId || !email) {
      return NextResponse.json(
        { error: "userId and email are required" },
        { status: 400 }
      );
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
    let errorDetails: any = {};

    // Try user_profiles first
    const { data: userProfileData, error: userProfileError } = await supabase
      .from("user_profiles")
      .upsert(
        {
          id: userId,
          full_name: generatedName,
          role: "customer",
          is_active: true,
          created_at: now,
          updated_at: now,
        },
        {
          onConflict: "id",
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
    const { data: profileDataAlt, error: profileErrorAlt } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          full_name: generatedName,
          created_at: now,
          updated_at: now,
        },
        {
          onConflict: "id",
        }
      )
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