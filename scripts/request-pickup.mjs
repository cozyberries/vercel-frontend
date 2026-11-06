#!/usr/bin/env node
// Raises a Delhivery pickup request for an order's parcel, the same call the "Add to pickup"
// button on /admin/orders makes (POST /api/admin/orders/[id]/pickup). A pickup request is per
// warehouse and per day: if one is already open for that day Delhivery refuses a second, and
// this script treats that as done (the executive collects every manifested parcel).
//
// Usage: node scripts/request-pickup.mjs --order=ORD-… [--execute] [--date=YYYY-MM-DD] [--count=1] [--warehouse=Cozyberries]
// Dry run by default. --execute calls Delhivery and appends "Pickup #id requested for date time"
// to the order's delivery_notes.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appendPickupNote, interpretPickupResponse, pickupNoteLine, planPickup } from "../lib/delhivery/pickup.ts";
import { postPickupRequest } from "./lib/pickup-call.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env.local") });

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "1"];
  })
);
const EXECUTE = Boolean(args.execute);
if (!args.order) {
  console.error("Usage: node scripts/request-pickup.mjs --order=<order number> [--execute] [--date=YYYY-MM-DD] [--count=1] [--warehouse=…]");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DELHIVERY_TOKEN = process.env.DELIVERY_API_KEY?.trim();
if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DELHIVERY_TOKEN) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or DELIVERY_API_KEY in .env.local");
  process.exit(1);
}
const DELHIVERY_BASE = (process.env.DELHIVERY_BASE_URL || "https://track.delhivery.com").trim().replace(/\/$/, "");
const warehouseName = (args.warehouse || process.env.DELHIVERY_WAREHOUSE_NAME || "Cozyberries").trim();
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const { data: order, error } = await supabase
  .from("orders")
  .select("id, order_number, status, fulfilment_method, tracking_number, carrier_name, delivery_notes")
  .eq("order_number", args.order)
  .maybeSingle();
if (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
if (!order) {
  console.error(`✗ No order ${args.order}`);
  process.exit(1);
}
if (!String(order.tracking_number ?? "").trim()) {
  console.error(`✗ Order ${order.order_number} has no shipment yet; manifest it first`);
  process.exit(1);
}

let payload;
try {
  payload = planPickup({
    warehouseName,
    now: new Date(),
    date: args.date,
    count: args.count ? Number(args.count) : undefined,
  });
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}

console.log(`Order ${order.order_number} · ${order.status} · AWB ${order.tracking_number}`);
console.log(`  pickup   ${payload.pickup_location} on ${payload.pickup_date} at ${payload.pickup_time}, ${payload.expected_package_count} parcel(s)`);

if (!EXECUTE) {
  console.log("\nDry run. Add --execute to request the pickup at Delhivery.");
  process.exit(0);
}

let status;
let text;
try {
  ({ status, text } = await postPickupRequest({ baseUrl: DELHIVERY_BASE, token: DELHIVERY_TOKEN, payload }));
} catch (err) {
  console.error(`✗ Delhivery request failed: ${err.message}`);
  process.exit(1);
}

const outcome = interpretPickupResponse(status, text);
if (!outcome.ok) {
  if (outcome.alreadyOpen) {
    console.log(`✓ A pickup is already open at ${payload.pickup_location} for ${payload.pickup_date}; the parcel goes with it (${outcome.message})`);
    process.exit(0);
  }
  console.error(`✗ Delhivery refused the pickup (HTTP ${status}): ${outcome.message}`);
  process.exit(1);
}
console.log(`✓ Pickup #${outcome.pickupId} requested for ${outcome.date} at ${outcome.time} (${outcome.location})`);

const line = pickupNoteLine(outcome);
const { error: updateError } = await supabase
  .from("orders")
  .update({ delivery_notes: appendPickupNote(order.delivery_notes, line), updated_at: new Date().toISOString() })
  .eq("id", order.id);
if (updateError) console.error(`! note not written to the order: ${updateError.message}`);
else console.log(`✓ Noted on the order: ${line}`);
