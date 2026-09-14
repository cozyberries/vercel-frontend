import { NextRequest, NextResponse } from "next/server";
import { generateAuthToken } from "@/lib/jwt-auth";
import { blockIfImpersonating } from "@/lib/utils/impersonation-guard";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * Mints the *caller's own* JWT.
 *
 * The token this route signs carries `app_metadata.role`, and the admin app
 * (`cozyberries-admin`) treats that role as its only gate in front of a
 * service-role client. So the subject of the token must never come from the
 * request body: it is always the id of the session Supabase itself verified.
 * A `userId` / `userEmail` in the body is accepted for backwards compatibility
 * with existing clients but is *ignored* as the token subject.
 */
export async function POST(request: NextRequest) {
  try {
    const blocked = await blockIfImpersonating();
    if (blocked) return blocked;

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // The body is optional and advisory only. Read it so we can log a mismatch,
    // never so we can act on it.
    let requestedUserId: unknown;
    try {
      const body = await request.json();
      requestedUserId = body?.userId;
    } catch {
      requestedUserId = undefined;
    }

    if (typeof requestedUserId === "string" && requestedUserId !== user.id) {
      console.warn(
        "[generate-token] ignoring caller-supplied userId that does not match the session user"
      );
    }

    // Subject and email come from the verified session only.
    const token = await generateAuthToken(user.id, user.email);

    return NextResponse.json({
      token,
      success: true,
    });
  } catch (error) {
    console.error("Error generating JWT token:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
