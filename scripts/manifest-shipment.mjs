#!/usr/bin/env node
// Manifests a Delhivery shipment for an order from the command line, the same way the admin
// "Create Delhivery shipment" button does (app/api/admin/orders/[id]/shipment/route.ts), with
// one difference: the Delhivery order id is the suffixed re-ship id (ORD-…-R1) when
// scripts/reship-order.mjs recorded one in delivery_notes. Delhivery rejects a manifest whose
// client, order id, amount, product description, payment mode and consignee name all match an
// earlier one, so a replacement for a returned parcel cannot reuse the bare order number.
//
// Usage: node scripts/manifest-shipment.mjs --order=ORD-… [--execute] [--pickup[=YYYY-MM-DD]] [--warehouse=Cozyberries] [--weight=500] [--mode=Surface|Express]
// Dry run by default: prints the payload and calls nothing. --execute manifests at Delhivery,
// writes the waybill onto the order (only while it still has none) and clears the order caches.
// --pickup then raises the day's pickup request as well (same as scripts/request-pickup.mjs).
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { config } from "dotenv";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { manifestCacheTargets, planManifest, waybillFrom } from "./lib/manifest-shipment.mjs";
import { postPickupRequest } from "./lib/pickup-call.mjs";
import { appendPickupNote, interpretPickupResponse, pickupNoteLine, planPickup } from "../lib/delhivery/pickup.ts";

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
  console.error("Usage: node scripts/manifest-shipment.mjs --order=<order number> [--execute] [--warehouse=…] [--weight=500] [--mode=Surface|Express]");
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
  .select(
    "id, user_id, order_number, status, fulfilment_method, tracking_number, total_amount, customer_phone, shipping_address, delivery_notes, order_items(sku, quantity), payments(payment_method, status)"
  )
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
  plan = planManifest({
    order,
    items: order.order_items ?? [],
    payments: order.payments ?? [],
    warehouseName,
    weight: args.weight ? Number(args.weight) : undefined,
    shippingMode: args.mode,
  });
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}

const s = plan.payload.shipments[0];
console.log(`Order ${order.order_number} (${order.id}) · ${order.status}`);
console.log(`  Delhivery order id  ${s.order}`);
console.log(`  consignee           ${s.name} · ${s.phone}`);
console.log(`  address             ${s.add}, ${s.city}, ${s.state} ${s.pin}`);
console.log(`  payment             ${s.payment_mode} · total ₹${s.total_amount}${plan.isCod ? ` · collect ₹${s.cod_amount}` : ""}`);
console.log(`  contents            ${s.products_desc} · ${s.quantity} pc · ${s.weight} g · ${s.shipping_mode}`);
console.log(`  pickup location     ${plan.payload.pickup_location.name}`);

let pickupPayload = null;
if (args.pickup) {
  try {
    pickupPayload = planPickup({ warehouseName, now: new Date(), date: args.pickup === "1" ? undefined : args.pickup });
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
  console.log(`  pickup request      ${pickupPayload.pickup_date} at ${pickupPayload.pickup_time}, 1 parcel`);
}

if (!EXECUTE) {
  console.log("\nDry run. Add --execute to manifest at Delhivery.");
  process.exit(0);
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 15_000);
let data;
try {
  const res = await fetch(`${DELHIVERY_BASE}/api/cmu/create.json`, {
    method: "POST",
    headers: {
      Authorization: `Token ${DELHIVERY_TOKEN}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `format=json&data=${encodeURIComponent(JSON.stringify(plan.payload))}`,
    signal: controller.signal,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ Delhivery HTTP ${res.status}: ${text}`);
    process.exit(1);
  }
  data = JSON.parse(text);
} catch (err) {
  console.error(`✗ Delhivery request failed: ${err.message}`);
  process.exit(1);
} finally {
  clearTimeout(timer);
}

let waybill;
try {
  waybill = waybillFrom(data);
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
console.log(`\n✓ Delhivery manifested waybill ${waybill}`);

// Only an order still without a shipment takes the waybill, so a race with the admin button
// cannot overwrite a second real shipment. If this write fails the shipment still exists at
// Delhivery: paste the waybill into /admin/orders by hand.
const { data: updated, error: updateError } = await supabase
  .from("orders")
  .update({ tracking_number: waybill, carrier_name: "Delhivery", status: "processing", updated_at: new Date().toISOString() })
  .eq("id", order.id)
  .is("tracking_number", null)
  .select("id, tracking_number, carrier_name, status")
  .maybeSingle();
if (updateError || !updated) {
  console.error(
    `✗ Shipment ${waybill} exists at Delhivery but the order was not updated (${updateError?.message ?? "order already has a tracking number"}). Paste the waybill into /admin/orders.`
  );
  process.exit(1);
}
console.log(`✓ Order updated: ${updated.carrier_name} ${updated.tracking_number}, ${updated.status}`);

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
if (redisUrl && redisToken) {
  try {
    const redis = new Redis({ url: redisUrl, token: redisToken });
    const { keys, patterns } = manifestCacheTargets(order);
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
}

let pickupLine = "  2. Add it to a pickup: node scripts/request-pickup.mjs --order=" + order.order_number + " --execute";
if (pickupPayload) {
  try {
    const { status, text } = await postPickupRequest({ baseUrl: DELHIVERY_BASE, token: DELHIVERY_TOKEN, payload: pickupPayload });
    const outcome = interpretPickupResponse(status, text);
    if (outcome.ok) {
      const line = pickupNoteLine(outcome);
      const { data: fresh } = await supabase.from("orders").select("delivery_notes").eq("id", order.id).maybeSingle();
      const { error: noteError } = await supabase
        .from("orders")
        .update({ delivery_notes: appendPickupNote(fresh?.delivery_notes, line), updated_at: new Date().toISOString() })
        .eq("id", order.id);
      console.log(`✓ ${line}${noteError ? ` (note not written: ${noteError.message})` : ""}`);
      pickupLine = "  2. Hand the parcel to the Delhivery executive when they come.";
    } else if (outcome.alreadyOpen) {
      console.log(`✓ A pickup is already open for ${pickupPayload.pickup_date}; the parcel goes with it`);
      pickupLine = "  2. Hand the parcel to the Delhivery executive when they come.";
    } else {
      console.error(`! Pickup not requested (HTTP ${status}): ${outcome.message}`);
    }
  } catch (err) {
    console.error(`! Pickup request failed: ${err.message}`);
  }
}

console.log(`
Next:
  1. Print the label: /admin/print/label/${order.order_number}?autoPrint=true
${pickupLine}
  3. Mark the order Shipped on /admin/orders once Delhivery has it.`);
