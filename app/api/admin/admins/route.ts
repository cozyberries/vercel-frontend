import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { listAdminAccounts, roleOf, safeGetUserById, toAdminAccount } from "@/lib/admin/admin-accounts";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireSuperAdmin();
  if (gate.response) return gate.response;
  try {
    const admins = await listAdminAccounts(createAdminSupabaseClient());
    return NextResponse.json({ admins });
  } catch (e) {
    console.error("[admins] list failed:", e);
    return NextResponse.json({ error: "Failed to load admins" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin();
  if (gate.response) return gate.response;

  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.user_id === "string" ? body.user_id.trim() : "";
  if (!userId) return NextResponse.json({ error: "user_id is required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const user = await safeGetUserById(admin, userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const role = roleOf(user);
  if (role === "admin" || role === "super_admin") {
    return NextResponse.json({ error: "Already an admin" }, { status: 409 });
  }

  // Scoped to the one id the super admin acted on; app_metadata is admin-write-only.
  const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { role: "admin" },
  });
  if (updateError || !updated?.user) {
    console.error("[admins] promote failed:", updateError);
    return NextResponse.json({ error: "Failed to make admin" }, { status: 500 });
  }
  return NextResponse.json({ admin: toAdminAccount(updated.user) });
}
