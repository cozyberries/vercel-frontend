import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * API route to create user_profiles record after user signup
 * This is called automatically when a new user signs up
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    if (existingProfile) {
      // Profile already exists, return success
      return NextResponse.json({
        message: "Profile already exists",
        profile: existingProfile,
      });
    }

    // Create new user profile with default customer role
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .insert({
        id: user.id,
        role: "customer",
        full_name: user.email?.split("@")[0] || "User",
        is_active: true,
        is_verified: false, // Will be verified after email confirmation
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (profileError) {
      console.error("Error creating user profile:", profileError);
      return NextResponse.json(
        { error: "Failed to create user profile: " + profileError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "User profile created successfully",
      profile,
    });
  } catch (error) {
    console.error("Error in profile creation API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

