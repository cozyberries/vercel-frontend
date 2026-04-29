import { NextRequest, NextResponse } from "next/server";
import { isSessionExpired } from "@/lib/utils/checkout-helpers";
import { logServerEvent } from "@/lib/services/event-logger";
import {
  effectiveUserErrorResponse,
  getEffectiveUser,
} from "@/lib/services/effective-user";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const result = await getEffectiveUser();
    if (!result.ok) {
      return effectiveUserErrorResponse(result, {
        unauthenticatedMessage: "Authentication required",
      });
    }
    const { userId, client: supabase } = result;

    const { sessionId } = await params;

    const { data: session, error: sessionError } = await supabase
      .from("checkout_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
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

        logServerEvent(supabase, userId, "session_expired", {
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
