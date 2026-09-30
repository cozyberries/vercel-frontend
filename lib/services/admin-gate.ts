import { NextResponse } from "next/server";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdmin, isSuperAdmin } from "@/lib/services/effective-user";

type GateResult =
  | { user: SupabaseUser; response?: undefined }
  | { user?: undefined; response: NextResponse };

async function gate(check: (user: SupabaseUser) => boolean): Promise<GateResult> {
  const sessionClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const typed = user as unknown as SupabaseUser;
  if (!check(typed)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user: typed };
}

/**
 * The admin-route gate from CLAUDE.md: a server-verified session (getUser()) and an
 * admin role, both checked before the caller creates a service-role client.
 */
export function requireAdmin(): Promise<GateResult> {
  return gate(isAdmin);
}

/**
 * Same gate, but only `super_admin` passes. getUser() returns the live account, so a
 * demoted admin is refused at once even while their old JWT still says "admin".
 */
export function requireSuperAdmin(): Promise<GateResult> {
  return gate(isSuperAdmin);
}
