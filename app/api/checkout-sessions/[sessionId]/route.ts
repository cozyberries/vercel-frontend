import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isSessionExpired } from "@/lib/utils/checkout-helpers";
import { logServerEvent } from "@/lib/services/event-logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
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

    const { sessionId } = await params;

    const { data: session, error: sessionError } = await supabase
      .from("checkout_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // If already completed, return the order_id so the client can redirect
    if (session.status === "completed") {
      return NextResponse.json({
        session,
        completed: true,
        order_id: session.order_id,
      });
    }

    // Check expiry
    if (session.status !== "pending" || isSessionExpired(session.created_at)) {
      // Mark as expired if still pending
      if (session.status === "pending") {
        await supabase
          .from("checkout_sessions")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("id", sessionId);

        logServerEvent(supabase, user.id, "session_expired", {
          session_id: sessionId,
        });
      }

      return NextResponse.json(
        { error: "Session has expired. Please checkout again." },
        { status: 410 }
      );
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error("Error fetching checkout session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
