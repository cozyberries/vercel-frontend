import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-gate";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { loadVariantOptions } from "@/lib/retail/queries";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

/** Sizes with stock on hand, for "Send stock". */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.response) return gate.response;
  try {
    return NextResponse.json({ variants: await loadVariantOptions(createAdminSupabaseClient()) }, { headers: NO_STORE });
  } catch (e) {
    console.error("[retail] variants failed:", e);
    return NextResponse.json({ error: "Couldn't load products" }, { status: 500, headers: NO_STORE });
  }
}
