// Pure logic for Delhivery pickup requests (POST /fm/request/new/). A pickup request is per
// warehouse and per day, not per parcel: Delhivery keeps one open request per location per day
// and refuses a second until the first is closed, so "already exists" counts as done.
//
// No imports on purpose: scripts/request-pickup.mjs loads this file straight into Node (type
// stripping), so it must stay self-contained and free of path aliases.

export const PICKUP_TIME = "14:00:00";

export interface PickupRequestPayload {
  pickup_time: string;
  pickup_date: string;
  pickup_location: string;
  expected_package_count: number;
}

export interface PickupRequestResponse {
  pickup_id?: number;
  pickup_time?: string;
  pickup_date?: string;
  pickup_location_name?: string;
  expected_package_count?: number;
  incoming_center_name?: string;
}

export type PickupOutcome =
  | { ok: true; pickupId: number; time: string; date: string; location: string }
  | { ok: false; alreadyOpen: boolean; message: string };

/** The IST calendar date (YYYY-MM-DD) for an instant. */
export function istToday(now: Date): string {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function planPickup({
  warehouseName,
  now,
  date,
  count = 1,
}: {
  warehouseName: string;
  now: Date;
  date?: string;
  count?: number;
}): PickupRequestPayload {
  const location = String(warehouseName ?? "").trim();
  if (!location) throw new Error("No warehouse name for the pickup location");
  const today = istToday(now);
  const pickupDate = date ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) throw new Error(`Pickup date must be YYYY-MM-DD, got "${pickupDate}"`);
  if (pickupDate < today) throw new Error(`Pickup date ${pickupDate} is in the past (today is ${today} IST)`);
  if (!Number.isInteger(count) || count < 1) throw new Error("Expected parcel count must be at least 1");
  return { pickup_time: PICKUP_TIME, pickup_date: pickupDate, pickup_location: location, expected_package_count: count };
}

function bodyMessage(body: unknown): string {
  if (typeof body === "string") return body.trim();
  if (body && typeof body === "object") {
    const values = Object.values(body as Record<string, unknown>).filter((v) => typeof v === "string") as string[];
    if (values.length) return values.join("; ");
    try {
      return JSON.stringify(body);
    } catch {
      return "";
    }
  }
  return "";
}

/** Reads Delhivery's answer: the pickup on success, or why it was refused. */
export function interpretPickupResponse(status: number, body: unknown): PickupOutcome {
  let parsed: unknown = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = body;
    }
  }
  if (status === 200 && parsed && typeof parsed === "object") {
    const r = parsed as PickupRequestResponse;
    if (typeof r.pickup_id === "number") {
      return {
        ok: true,
        pickupId: r.pickup_id,
        time: r.pickup_time ?? PICKUP_TIME,
        date: r.pickup_date ?? "",
        location: r.pickup_location_name ?? "",
      };
    }
    return { ok: false, alreadyOpen: false, message: "Delhivery returned no pickup id" };
  }
  const message = bodyMessage(parsed) || `HTTP ${status}`;
  const alreadyOpen = /already\s+exist/i.test(message) || /\bpr_exist\b/i.test(JSON.stringify(parsed ?? ""));
  return { ok: false, alreadyOpen, message };
}

export function pickupNoteLine({ pickupId, date, time }: { pickupId: number; date: string; time: string }): string {
  return `Pickup #${pickupId} requested for ${date} ${time.slice(0, 5)}`;
}

export function appendPickupNote(existing: string | null | undefined, line: string): string {
  return existing ? `${existing}\n${line}` : line;
}
