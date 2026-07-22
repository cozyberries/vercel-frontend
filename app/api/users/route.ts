import { NextResponse } from "next/server";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    // Auth + admin guard
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminSupabase = createAdminSupabaseClient();
    const { data: authUser } = await adminSupabase.auth.admin.getUserById(user.id);
    const role = authUser?.user?.app_metadata?.role;
    if (!role || !["admin", "super_admin"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: { users }, error } = await adminSupabase.auth.admin.listUsers();

    if (error) {
      console.error("Error fetching users:", error);
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 }
      );
    }

    const result = users.map((u) => ({
      id: u.id,
      email: u.email,
      phone: u.phone ?? null,
      role: u.app_metadata?.role ?? "customer",
      full_name: u.user_metadata?.full_name ?? null,
      created_at: u.created_at,
    }));
    return NextResponse.json(result);

  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}
