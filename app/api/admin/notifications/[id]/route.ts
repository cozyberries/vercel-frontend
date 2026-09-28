import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  const { id } = await params;

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof parsed !== "object" || parsed === null || typeof (parsed as { read?: unknown }).read !== "boolean") {
    return NextResponse.json({ error: "read must be a boolean" }, { status: 400 });
  }
  const read = (parsed as { read: boolean }).read;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("notifications")
    .update({ read, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("user_id", null) // broadcast rows only — customer rows are untouchable here
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  return NextResponse.json({ notification: data });
}
