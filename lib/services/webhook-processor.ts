// Turns queued Delhivery scan events into broadcast admin notifications
// (user_id null). Claiming goes through the claim_webhook_events RPC
// (FOR UPDATE SKIP LOCKED + 10-minute lease reclaim), so concurrent processor
// runs never double-process an event.
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import {
  parseDelhiveryWebhookPayload,
  type ParsedDelhiveryScan,
} from "@/lib/services/delhivery-webhook";

const BATCH_SIZE = 50;
const LEASE_TIMEOUT_MINUTES = 10;
const MAX_ATTEMPTS = 10;
const RETRY_DELAYS_MINUTES = [1, 5, 15, 60];

export interface ProcessResult {
  claimed: number;
  processed: number;
  failed: number;
  skipped: number;
}

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;
interface ClaimedEvent {
  id: string;
  payload: unknown;
  attempt_count: number;
}

async function createScanNotification(
  admin: AdminClient,
  scan: ParsedDelhiveryScan
): Promise<string | null> {
  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, user_id")
    .eq("tracking_number", scan.awb)
    .maybeSingle();

  const when = new Date(scan.status_datetime).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: false,
  });
  const subject = order ? `Order ${order.order_number}` : `AWB ${scan.awb}`;
  const where = scan.status_location ? ` at ${scan.status_location}` : "";

  const { error } = await admin.from("notifications").insert({
    user_id: null,
    type: "shipping_scan",
    read: false,
    title: `Shipment scan: ${scan.status}`,
    message: `${subject}${where} at ${when}`,
    meta: {
      awb: scan.awb,
      scan_status: scan.status,
      ...(scan.status_location ? { scan_location: scan.status_location } : {}),
      scan_time: scan.status_datetime,
      ...(order ? { order_id: order.id, order_number: order.order_number } : {}),
    },
  });
  if (error) throw new Error(`notification insert failed: ${error.message}`);
  return order ? null : `WARN_UNMATCHED_AWB:${scan.awb}`;
}

async function markProcessed(admin: AdminClient, id: string, warning: string | null) {
  await admin
    .from("webhook_events")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      next_retry_at: null,
      last_error: warning,
    })
    .eq("id", id);
}

async function markFailed(admin: AdminClient, ev: ClaimedEvent, message: string) {
  const attempts = (ev.attempt_count ?? 0) + 1;
  const dead = attempts >= MAX_ATTEMPTS;
  const delayMin =
    RETRY_DELAYS_MINUTES[Math.min(attempts - 1, RETRY_DELAYS_MINUTES.length - 1)];
  await admin
    .from("webhook_events")
    .update({
      status: dead ? "failed" : "pending",
      attempt_count: attempts,
      next_retry_at: dead ? null : new Date(Date.now() + delayMin * 60_000).toISOString(),
      last_error: message,
    })
    .eq("id", ev.id);
}

export async function processWebhookEventBatch(): Promise<ProcessResult> {
  const admin = createAdminSupabaseClient();
  const now = new Date();
  const { data, error } = await admin.rpc("claim_webhook_events", {
    p_batch_size: BATCH_SIZE,
    p_lease_threshold: new Date(now.getTime() - LEASE_TIMEOUT_MINUTES * 60_000).toISOString(),
    p_now: now.toISOString(),
  });
  if (error) throw new Error(`claim_webhook_events failed: ${error.message}`);

  const events = (data ?? []) as ClaimedEvent[];
  const result: ProcessResult = { claimed: events.length, processed: 0, failed: 0, skipped: 0 };

  for (const ev of events) {
    try {
      const parsed = parseDelhiveryWebhookPayload(ev.payload);
      if (!parsed) {
        await markProcessed(admin, ev.id, null);
        result.processed += 1;
        result.skipped += 1;
        continue;
      }
      const warnings: string[] = [];
      for (const scan of parsed.scans) {
        const warn = await createScanNotification(admin, scan);
        if (warn) warnings.push(warn);
      }
      await markProcessed(admin, ev.id, warnings.length ? warnings.join("; ") : null);
      result.processed += 1;
    } catch (err) {
      await markFailed(admin, ev, err instanceof Error ? err.message : String(err));
      result.failed += 1;
    }
  }
  return result;
}
