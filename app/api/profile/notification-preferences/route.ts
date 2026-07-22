import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import {
  effectiveUserErrorResponse,
  getEffectiveUser,
} from "@/lib/services/effective-user";
import {
  NOTIFICATION_CATEGORIES,
  resolveNotificationPreferences,
} from "@/lib/notifications/preferences";

export async function GET() {
  const result = await getEffectiveUser();
  if (!result.ok) return effectiveUserErrorResponse(result);
  return NextResponse.json(
    resolveNotificationPreferences(result.effectiveUser.user_metadata)
  );
}

export async function PUT(request: NextRequest) {
  const result = await getEffectiveUser();
  if (!result.ok) return effectiveUserErrorResponse(result);
  const { userId, actingAdminId, effectiveUser } = result;

  // Preferences are personal to the session user, not the impersonation target.
  if (actingAdminId !== null) {
    return NextResponse.json(
      { error: "Not permitted while acting as another user" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const current = resolveNotificationPreferences(effectiveUser.user_metadata);
  const next = { ...current };
  for (const key of NOTIFICATION_CATEGORIES) {
    if (typeof body[key] === "boolean") next[key] = body[key];
  }

  const adminSupabase = createAdminSupabaseClient();
  // updateUserById REPLACES user_metadata wholesale — spread the existing
  // object so unrelated keys (full_name, avatar_url) aren't wiped.
  const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...effectiveUser.user_metadata,
      notification_preferences: next,
    },
  });

  if (error) {
    console.error("Error updating notification preferences:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update notification preferences" },
      { status: 500 }
    );
  }

  return NextResponse.json(next);
}
