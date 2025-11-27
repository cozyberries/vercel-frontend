import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * Create a user profile for a newly registered user
 * This endpoint is called after successful signup to create the user_profiles entry
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get the current user from the session
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

    // Create user profile with default customer role
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .insert({
        id: user.id,
        role: "customer",
        full_name: user.user_metadata?.full_name || null,
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
        { error: "Failed to create user profile", details: profileError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "User profile created successfully",
      profile,
    });
  } catch (error) {
    console.error("Error in POST /api/users/create-profile:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    );
  }
}




