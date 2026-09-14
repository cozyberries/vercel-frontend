import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase-server";

// NOTE: the GET handler was removed deliberately. It was unauthenticated and
// returned rows whose `title` embeds customer email addresses. Nothing consumed it.
// `recent_activities` is service-role-only; see the RLS tier design.

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
