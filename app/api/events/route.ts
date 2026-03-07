import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

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

    const body = await request.json();
    const { event_type, event_data, page_path, session_id } = body;

    if (!event_type || typeof event_type !== "string") {
      return NextResponse.json(
        { error: "event_type is required" },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase.from("event_logs").insert({
      user_id: user.id,
      event_type,
      event_data: event_data ?? null,
      page_path: page_path ?? null,
      session_id: session_id ?? null,
    });

    if (insertError) {
      console.error("Event log insert failed:", insertError);
      return NextResponse.json(
        { error: "Failed to log event" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Event logging error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
