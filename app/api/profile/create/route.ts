import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";
import { blockIfImpersonating } from "@/lib/utils/impersonation-guard";

/**
 * Ensures the authenticated user has a role set in app_metadata.
 * Called by the auth provider as a safety net after every session change.
 */
export async function POST() {
  try {
    const blocked = await blockIfImpersonating();
    if (blocked) return blocked;

    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminSupabase = createAdminSupabaseClient();
    const { data: authUser } = await adminSupabase.auth.admin.getUserById(user.id);
    const existingRole = authUser?.user?.app_metadata?.role;

    if (existingRole) {
      return NextResponse.json({ message: "Profile already exists", profile: { id: user.id, role: existingRole } });
    }

    // Set default customer role in app_metadata
    const { error } = await adminSupabase.auth.admin.updateUserById(user.id, {
      app_metadata: { role: "customer" },
    });

    if (error) {
      console.error("Error setting user role:", error);
      return NextResponse.json({ error: "Failed to create user profile: " + error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: "User profile created successfully",
      profile: { id: user.id, role: "customer" },
    });
  } catch (error) {
    console.error("Error in profile creation API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
