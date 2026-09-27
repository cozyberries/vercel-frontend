import { NextResponse } from "next/server";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/services/effective-user";

/**
 * The admin-route gate from CLAUDE.md: a server-verified session (getUser()) and an
 * admin role, both checked before the caller creates a service-role client.
 */
export async function requireAdmin(): Promise<
  { user: SupabaseUser; response?: undefined } | { user?: undefined; response: NextResponse }
> {
  const sessionClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdmin(user as unknown as SupabaseUser)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user: user as unknown as SupabaseUser };
}
