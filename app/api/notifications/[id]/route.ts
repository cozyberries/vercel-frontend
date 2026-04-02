import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createServerSupabaseClient,
  createAdminSupabaseClient,
} from "@/lib/supabase-server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const supabase = await createServerSupabaseClient(cookieStore);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const admin = createAdminSupabaseClient();

    const { data, error } = await admin
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("Supabase notification patch:", error.code, error.message);
      throw error;
    }

    if (!data) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error updating notification:", error);
    return NextResponse.json(
      { error: "Failed to update notification" },
      { status: 500 }
    );
  }
}
