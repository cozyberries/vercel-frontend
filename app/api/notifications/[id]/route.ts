import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import {
  effectiveUserErrorResponse,
  getEffectiveUser,
} from "@/lib/services/effective-user";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result, {
        unauthenticatedMessage: "Authentication required",
      });
    }
    const { userId } = result;

    const { id } = await params;

    const admin = createAdminSupabaseClient();

    const { data, error } = await admin
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", userId)
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
