import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";

// NOTE: the GET handler was removed deliberately. It was unauthenticated and
// returned rows whose `title` embeds customer email addresses. Nothing consumed it.
// `recent_activities` is service-role-only; see the RLS tier design.

// `recent_activities` is a service-role-only table holding PII, and this route is
// the one customer-facing writer into it. Customer writes are the intended design,
// so the gate stays "any signed-in user" — but the payload is constrained to what
// the app actually sends (see `sendActivity` callers) so a logged-in caller cannot
// stuff arbitrary strings or unbounded blobs into an internal audit table.
const ALLOWED_ACTIVITY_TYPES = new Set([
  "rating_submission_success",
  "rating_submission_failed",
]);
const MAX_TITLE_LENGTH = 500;
const MAX_METADATA_BYTES = 2048;

export async function POST(request: NextRequest) {
  try {
    const auth = await createServerSupabaseClient();
    const { data: { user } } = await auth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      const text = await request.text();
      if (!text || text.trim() === "") {
        return NextResponse.json({ error: "Empty request body" }, { status: 400 });
      }
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    const { type, title, metadata } = body;
    if (!type || !title || !metadata) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (typeof type !== "string" || !ALLOWED_ACTIVITY_TYPES.has(type)) {
      return NextResponse.json({ error: "Unsupported activity type" }, { status: 400 });
    }

    if (typeof title !== "string" || title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        { error: `title must be a string of at most ${MAX_TITLE_LENGTH} characters` },
        { status: 400 }
      );
    }

    let serializedMetadataBytes: number;
    try {
      serializedMetadataBytes = new TextEncoder().encode(JSON.stringify(metadata)).length;
    } catch {
      return NextResponse.json({ error: "metadata is not serializable" }, { status: 400 });
    }
    if (serializedMetadataBytes > MAX_METADATA_BYTES) {
      return NextResponse.json(
        { error: `metadata must serialize to at most ${MAX_METADATA_BYTES} bytes` },
        { status: 400 }
      );
    }

    // recent_activities is Tier 3 (service-role only), so the anon client cannot write it.
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("recent_activities")
      .insert([{ type, title, metadata }]);

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error adding activity:", error);
    return NextResponse.json({ error: "Failed to add activity" }, { status: 500 });
  }
}
