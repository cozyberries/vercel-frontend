import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { UpstashService } from "@/lib/upstash";
import {
  countDashboardActions,
  DASHBOARD_ACTIONS_KEY,
  DASHBOARD_ACTIONS_TTL,
  type DashboardActions,
} from "@/lib/admin/dashboard-actions";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;

  try {
    const cached = (await UpstashService.get(DASHBOARD_ACTIONS_KEY)) as DashboardActions | null;
    if (cached) return NextResponse.json({ actions: cached, cached: true });

    const admin = createAdminSupabaseClient();
    const actions = await countDashboardActions(admin, new Date());
    await UpstashService.set(DASHBOARD_ACTIONS_KEY, actions, DASHBOARD_ACTIONS_TTL);
    return NextResponse.json({ actions, cached: false });
  } catch (e) {
    console.error("[dashboard-actions]", e);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
