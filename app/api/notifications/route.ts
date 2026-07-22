import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import {
  effectiveUserErrorResponse,
  getEffectiveUser,
} from "@/lib/services/effective-user";
import {
  isNotificationCategory,
  resolveNotificationPreferences,
} from "@/lib/notifications/preferences";

/**
 * Auth via getEffectiveUser; read/write notifications with the admin client
 * scoped by `user_id`. Avoids `GRANT ... TO authenticated` drift across
 * Supabase projects.
 */
export async function POST(req: Request) {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result, {
        unauthenticatedMessage: "Authentication required",
      });
    }
    const { userId, effectiveUser } = result;

    const body = await req.json();
    const { title, message, type, category } = body;

    if (
      typeof title !== "string" ||
      title.trim() === "" ||
      typeof message !== "string" ||
      message.trim() === ""
    ) {
      return NextResponse.json(
        { error: "title and message are required strings" },
        { status: 400 }
      );
    }

    // Every real trigger today (checkout failures, rating confirmations) is
    // an order-lifecycle event, so that's the safe default for untagged calls.
    const resolvedCategory = isNotificationCategory(category) ? category : "order_updates";
    const preferences = resolveNotificationPreferences(effectiveUser.user_metadata);
    if (!preferences[resolvedCategory]) {
      return NextResponse.json({ skipped: true, reason: "category_disabled" });
    }

    const admin = createAdminSupabaseClient();

    const { data, error } = await admin
      .from("notifications")
      .insert([
        {
          user_id: userId,
          title: title.trim(),
          message: message.trim(),
          type: typeof type === "string" && type.trim() ? type.trim() : "info",
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Supabase notification insert:", error.code, error.message, error.details);
      const dev = process.env.NODE_ENV === "development";
      return NextResponse.json(
        {
          error: "Failed to create notification",
          ...(dev && {
            supabaseCode: error.code,
            supabaseMessage: error.message,
          }),
        },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating notification:", error);
    const dev = process.env.NODE_ENV === "development";
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Failed to create notification",
        ...(dev && { hint: msg }),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      // Preserve existing behaviour: when no session at all, respond with
      // an empty notification list rather than an auth error.
      if (result.reason === "unauthenticated") {
        return NextResponse.json({ notifications: [] });
      }
      return effectiveUserErrorResponse(result, {
        unauthenticatedMessage: "Authentication required",
      });
    }
    const { userId } = result;

    const admin = createAdminSupabaseClient();

    const { data, error } = await admin
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase notification list:", error.code, error.message);
      throw error;
    }

    return NextResponse.json({ notifications: data ?? [] });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

/** Mark every unread notification for this user as read (the "Mark all read" action). */
export async function PATCH() {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result, {
        unauthenticatedMessage: "Authentication required",
      });
    }
    const { userId } = result;

    const admin = createAdminSupabaseClient();
    const { error } = await admin
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      console.error("Supabase mark-all-read:", error.code, error.message);
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marking all notifications read:", error);
    return NextResponse.json(
      { error: "Failed to mark notifications read" },
      { status: 500 }
    );
  }
}
