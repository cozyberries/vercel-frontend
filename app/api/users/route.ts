import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const adminSupabase = createAdminSupabaseClient();
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
