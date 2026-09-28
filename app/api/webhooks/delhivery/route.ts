// Delhivery scan-event intake. No session exists — the x-delhivery-token header
// is the authorisation (see CLAUDE.md service-role register). Events are queued
// into webhook_events; the QStash-scheduled processor turns them into
// notifications. Delhivery retries on non-2xx, so 202 is returned only after a
// successful insert.
import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { parseDelhiveryWebhookPayload } from "@/lib/services/delhivery-webhook";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_000_000;

function tokensMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(request: NextRequest) {
  const expected = process.env.DELHIVERY_WEBHOOK_TOKEN?.trim();
  const provided = request.headers.get("x-delhivery-token")?.trim();
  if (!provided) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }
  if (!expected) {
    return NextResponse.json({ error: "Webhook token not configured" }, { status: 500 });
  }
  if (!tokensMatch(provided, expected)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const declared = parseInt(request.headers.get("content-length") || "0", 10);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseDelhiveryWebhookPayload(body);
  if (!parsed) {
    return NextResponse.json({ error: "No valid scan in payload" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("webhook_events").insert({
    source: "delhivery",
    event_type: "shipment_scan",
    awb: parsed.raw_awb,
    payload: body,
    status: "pending",
    received_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[delhivery-webhook] insert failed:", error.message);
    return NextResponse.json({ error: "Failed to queue event" }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
