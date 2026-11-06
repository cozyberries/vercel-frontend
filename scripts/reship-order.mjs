#!/usr/bin/env node
// Prepares an order for a replacement Delhivery shipment after the first parcel came back
// (RTO, e.g. the customer was unreachable on a wrong number). It writes the corrected phone
// on the order and its shipping address, notes the returned AWB in delivery_notes, clears the
// tracking fields and puts the status back to Processing (with an order_status_events row),
// then clears the customer's order caches and the admin dashboard caches.
//
// It does NOT manifest the new shipment. Delhivery rejects a manifest whose client, order id,
// amount, product description, payment mode and consignee name all match an earlier one
// ("Duplicate Order Id"), so the replacement must be manifested on Delhivery One with the
// suffixed order id the script prints (ORD-…-R1), and its AWB pasted into /admin/orders.
//
// Usage: node scripts/reship-order.mjs --order=ORD-20261024-084659-00514 --phone=8189869691 [--execute] [--force]
// Dry run by default. --force skips the "Delhivery reported RTO" and "different number" checks.
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { config } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planReship, reshipCacheTargets } from "./lib/reship-order.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env.local") });

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? "1"];
  })
);
const EXECUTE = Boolean(args.execute);
const FORCE = Boolean(args.force);
if (!args.order || !args.phone) {
  console.error("Usage: node scripts/reship-order.mjs --order=<order number> --phone=<new mobile> [--execute] [--force]");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const ORDER_COLUMNS =
  "id, user_id, order_number, status, fulfilment_method, tracking_number, carrier_name, customer_phone, shipping_address, delivery_notes, delhivery_latest_status, delhivery_latest_scan_at, delhivery_latest_location";

const { data: order, error } = await supabase
  .from("orders")
  .select(ORDER_COLUMNS)
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

let plan;
try {
  plan = planReship({ order, phone: args.phone, now: new Date().toISOString(), force: FORCE });
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}

console.log(`Order ${order.order_number} (${order.id})`);
console.log(`  status        ${order.status} → processing${plan.statusEvent ? "" : " (unchanged)"}`);
console.log(`  shipment      ${plan.oldAwb} (${order.delhivery_latest_status ?? "no scan"}) → cleared`);
console.log(`  phone         ${plan.oldPhone} → ${plan.newPhone}`);
console.log(`  note          ${plan.update.delivery_notes.split("\n").pop()}`);
console.log(`  manifest as   ${plan.delhiveryOrderId}`);

if (!EXECUTE) {
  console.log("\nDry run. Add --execute to write.");
  process.exit(0);
}

// Only the row still carrying the returned AWB is touched, so a second run or a concurrent
// admin edit cannot clear a newer shipment.
const { data: updated, error: updateError } = await supabase
  .from("orders")
  .update(plan.update)
  .eq("id", order.id)
  .eq("tracking_number", plan.oldAwb)
  .select("id, status, tracking_number, customer_phone, shipping_address")
  .maybeSingle();
if (updateError) {
  console.error(`✗ update failed: ${updateError.message}`);
  process.exit(1);
}
if (!updated) {
  console.error(`✗ Order changed before the write (AWB ${plan.oldAwb} no longer on it); nothing written`);
  process.exit(1);
}
if (updated.status !== "processing" || updated.tracking_number !== null || updated.shipping_address?.phone !== plan.newPhone) {
  console.error(`✗ Read-back mismatch: ${JSON.stringify(updated)}`);
  process.exit(1);
}
console.log(`\n✓ Order written: processing, AWB cleared, phone ${updated.customer_phone}`);

if (plan.statusEvent) {
  const { error: eventError } = await supabase.from("order_status_events").insert(plan.statusEvent);
  if (eventError) console.error(`! status event not recorded: ${eventError.message}`);
  else console.log(`✓ Status event ${plan.statusEvent.from_status} → processing recorded`);
}

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
if (redisUrl && redisToken) {
  try {
    const redis = new Redis({ url: redisUrl, token: redisToken });
    const { keys, patterns } = reshipCacheTargets(order);
    const found = [...keys];
    for (const pattern of patterns) {
      let cursor = "0";
      do {
        const [next, batch] = await redis.scan(cursor, { match: pattern, count: 100 });
        found.push(...batch);
        cursor = String(next);
      } while (cursor !== "0");
    }
    const deleted = await redis.del(...found);
    console.log(`✓ Cleared ${deleted} cache key(s)`);
  } catch (err) {
    console.error(`! cache clear failed (caches expire on their own): ${err.message}`);
  }
} else {
  console.log("! UPSTASH_REDIS_REST_URL/TOKEN not set; caches not cleared (they expire on their own)");
}

console.log(`
Next, on Delhivery One:
  1. Manifest a new shipment for ${order.shipping_address?.full_name ?? "the customer"}, phone ${plan.newPhone},
     same address, order id ${plan.delhiveryOrderId} (the original id would be refused as a duplicate).
  2. Open the order on /admin/orders, paste the new AWB into "Tracking number" and save.
     Mark it Shipped once Delhivery picks it up.`);
