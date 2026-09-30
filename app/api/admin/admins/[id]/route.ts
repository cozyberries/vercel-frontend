import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { roleOf } from "@/lib/admin/admin-accounts";

export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin();
  if (gate.response) return gate.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (id === gate.user.id) return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error || !data?.user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const role = roleOf(data.user);
  if (role === "super_admin") return NextResponse.json({ error: "Super admins are managed in Supabase" }, { status: 409 });
  if (role !== "admin") return NextResponse.json({ error: "Not an admin" }, { status: 409 });

  const { error: updateError } = await admin.auth.admin.updateUserById(id, { app_metadata: { role: "customer" } });
  if (updateError) {
    console.error("[admins] demote failed:", updateError);
    return NextResponse.json({ error: "Failed to remove admin" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
