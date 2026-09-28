import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  const limit = Math.min(
    Math.max(parseInt(request.nextUrl.searchParams.get("limit") || "30", 10) || 30, 1),
    100
  );
  const admin = createAdminSupabaseClient();
  const [listRes, countRes] = await Promise.all([
    admin
      .from("notifications")
      .select("*")
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(limit),
    admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("user_id", null)
      .eq("read", false),
  ]);
  if (listRes.error) return NextResponse.json({ error: listRes.error.message }, { status: 500 });
  if (countRes.error) return NextResponse.json({ error: countRes.error.message }, { status: 500 });
  return NextResponse.json({
    notifications: listRes.data ?? [],
    unread: countRes.count ?? 0,
  });
}
