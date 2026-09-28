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
// Below the route's 20s hard Promise.race backstop, so the loop itself stops
// claiming new work with headroom to return a clean partial result before
// that backstop would fire and strand an in-flight event.
const DEFAULT_DEADLINE_MS = 15_000;
const MARK_PROCESSED_MAX_ATTEMPTS = 3;
const MARK_PROCESSED_RETRY_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

// Retries the status write itself (old admin-app parity): if the
// webhook_events update can't be persisted, the event must NOT be counted
// processed — a silent write failure here would otherwise let the row sit at
// status 'processing' forever (never picked up by claim_webhook_events'
// pending/failed branches) while the caller believes it succeeded, or
// (worse) look done when it isn't. Returns false only after 3 failed
// attempts; the caller counts that as a processing failure, not a success.
async function markProcessed(
  admin: AdminClient,
  id: string,
  warning: string | null
): Promise<boolean> {
  const patch = {
    status: "processed",
    processed_at: new Date().toISOString(),
    next_retry_at: null,
    last_error: warning,
  };
  for (let attempt = 1; attempt <= MARK_PROCESSED_MAX_ATTEMPTS; attempt++) {
    const { error } = await admin.from("webhook_events").update(patch).eq("id", id);
    if (!error) return true;
    if (attempt < MARK_PROCESSED_MAX_ATTEMPTS) {
      await sleep(MARK_PROCESSED_RETRY_DELAY_MS);
    } else {
      console.error(
        `[webhook-processor] failed to mark event ${id} processed after ${MARK_PROCESSED_MAX_ATTEMPTS} attempts: ${error.message}`
      );
    }
  }
  return false;
}

async function markFailed(admin: AdminClient, ev: ClaimedEvent, message: string): Promise<void> {
  const attempts = (ev.attempt_count ?? 0) + 1;
  const dead = attempts >= MAX_ATTEMPTS;
  const delayMin =
    RETRY_DELAYS_MINUTES[Math.min(attempts - 1, RETRY_DELAYS_MINUTES.length - 1)];
  const { error } = await admin
    .from("webhook_events")
    .update({
      status: dead ? "failed" : "pending",
      attempt_count: attempts,
      next_retry_at: dead ? null : new Date(Date.now() + delayMin * 60_000).toISOString(),
      last_error: message,
    })
    .eq("id", ev.id);
  if (error) {
    console.error(
      `[webhook-processor] failed to record failure for event ${ev.id}: ${error.message}`
    );
  }
}

export async function processWebhookEventBatch(
  deadlineMs: number = DEFAULT_DEADLINE_MS
): Promise<ProcessResult> {
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

  const start = Date.now();
  for (const ev of events) {
    // Deadline-aware instead of a blind Promise.race on the whole batch: a
    // race only changes what the route awaits, it doesn't stop the loop, so
    // an event could be left claimed with its notification already inserted
    // but never marked processed. Checking before each event lets us return
    // a clean partial result and leave the rest for the 10-minute lease
    // reclaim, instead of stranding one mid-flight.
    if (Date.now() - start >= deadlineMs) break;
    try {
      const parsed = parseDelhiveryWebhookPayload(ev.payload);
      if (!parsed) {
        if (await markProcessed(admin, ev.id, null)) {
          result.processed += 1;
          result.skipped += 1;
        } else {
          result.failed += 1;
        }
        continue;
      }
      const warnings: string[] = [];
      for (const scan of parsed.scans) {
        const warn = await createScanNotification(admin, scan);
        if (warn) warnings.push(warn);
      }
      if (await markProcessed(admin, ev.id, warnings.length ? warnings.join("; ") : null)) {
        result.processed += 1;
      } else {
        result.failed += 1;
      }
    } catch (err) {
      await markFailed(admin, ev, err instanceof Error ? err.message : String(err));
      result.failed += 1;
    }
  }
  return result;
}
