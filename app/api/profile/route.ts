import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { validatePhoneNumber, validateFullName } from "@/lib/utils/validation";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile data from profiles table
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    // If table doesn't exist or no profile found, create a default profile
    if (profileError) {
      if (
        profileError.code === "PGRST116" ||
        profileError.message?.includes("relation") ||
        profileError.message?.includes("does not exist")
      ) {
        // Table doesn't exist or no profile found, return user data only
        const userData = {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || null,
          avatar_url: user.user_metadata?.avatar_url || null,
          phone: null,
          address: null,
          city: null,
          state: null,
          postal_code: null,
          country: null,
          created_at: user.created_at,
          updated_at: user.updated_at,
        };
        return NextResponse.json(userData);
      } else {
        console.error("Error retrieving profile:", profileError);
        return NextResponse.json(
          {
            error: "Failed to retrieve profile",
            details: profileError.message,
          },
          { status: 500 }
        );
      }
    }

    // Return user data with profile information
    const userData = {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || profile?.full_name || null,
      avatar_url: user.user_metadata?.avatar_url || profile?.avatar_url || null,
      phone: profile?.phone || null,
      created_at: user.created_at,
      updated_at: profile?.updated_at || user.updated_at,
    };

    return NextResponse.json(userData);
  } catch (error) {
    console.error("Error in GET /api/profile:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { full_name, phone } = body;

    // Validate input data
    if (full_name) {
      const nameValidation = validateFullName(full_name);
      if (!nameValidation.isValid) {
        return NextResponse.json(
          { error: nameValidation.error },
          { status: 400 }
        );
      }
    }

    if (phone) {
      const phoneValidation = validatePhoneNumber(phone);
      if (!phoneValidation.isValid) {
        return NextResponse.json(
          { error: phoneValidation.error },
          { status: 400 }
        );
      }
    }

    // Prepare profile data
    const profileData = {
      id: user.id,
      full_name: full_name || user.user_metadata?.full_name || null,
      phone: phone || null,
      updated_at: new Date().toISOString(),
    };

    // Upsert profile data (insert or update)
    const { data, error } = await supabase
      .from("profiles")
      .upsert([profileData])
      .select()
      .single();

    if (error) {
      console.error("Error updating profile:", error);

      // If table doesn't exist, provide helpful error message
      if (
        error.message?.includes("relation") ||
        error.message?.includes("does not exist")
      ) {
        return NextResponse.json(
          {
            error: "Profiles table not found",
            details:
              "Please run the database migration to create the profiles table. See PROFILE_SETUP.md for instructions.",
            migration_needed: true,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: "Failed to update profile", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in PUT /api/profile:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    );
  }
}
