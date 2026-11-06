// Pure planning for scripts/reship-order.mjs: what to write on an order whose Delhivery
// parcel came back (RTO) so a replacement can be manifested with a corrected phone.
// No I/O here; the runner script reads the order, applies `update`, inserts `statusEvent`
// and clears `reshipCacheTargets`.

const PAID_STATUSES = new Set(["payment_confirmed", "processing", "shipped", "delivered"]);

// Mirrors lib/admin/sales-range.ts SALES_RANGES and lib/admin/dashboard-actions.ts keys.
const SALES_RANGES = ["30d", "3m", "12m", "all"];
const DASHBOARD_ACTIONS_KEY = "admin:dashboard:actions";

/** Ten-digit Indian mobile; accepts +91 / 91 / 0 prefixes, spaces and dashes. */
export function normalisePhone(input) {
  const digits = String(input ?? "").replace(/[\s-]/g, "").replace(/^\+?91/, "").replace(/^0/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new Error(`"${input}" is not a ten-digit Indian mobile number`);
  }
  return digits;
}

function returnedToOrigin(status) {
  const s = String(status ?? "").toLowerCase();
  return s.includes("rto") || s.includes("return");
}

/** Number of shipments already recorded in the delivery notes (cancelled or returned). */
function priorShipments(notes) {
  return (String(notes ?? "").match(/^Shipment \d+ (cancelled|returned)/gm) ?? []).length;
}

/**
 * @param {{ order: Record<string, any>, phone: string, now: string, force?: boolean }} args
 */
export function planReship({ order, phone, now, force = false }) {
  const newPhone = normalisePhone(phone);
  const awb = String(order.tracking_number ?? "").trim();
  const addr = order.shipping_address;
  const oldPhone = String(addr?.phone || order.customer_phone || "");

  if (order.fulfilment_method === "pickup") throw new Error("This is a pickup order; nothing to ship");
  if (!PAID_STATUSES.has(order.status)) {
    throw new Error(`Order is ${order.status}; only a paid order can be re-shipped`);
  }
  if (!awb) throw new Error("Order has no Delhivery shipment to replace");
  if (!addr || typeof addr !== "object") throw new Error("Order has no shipping address");
  if (!force && !returnedToOrigin(order.delhivery_latest_status)) {
    throw new Error(
      `Delhivery has not reported shipment ${awb} as returned (latest status: ${order.delhivery_latest_status ?? "none"}); pass --force to override`
    );
  }
  if (!force && newPhone === oldPhone) {
    throw new Error(`${newPhone} is the same number that just failed; pass --force to re-ship to it anyway`);
  }

  const delhiveryOrderId = `${order.order_number}-R${priorShipments(order.delivery_notes) + 1}`;
  const note = `Shipment ${awb} returned to origin (customer unreachable on ${oldPhone}); re-ship to ${newPhone} as ${delhiveryOrderId}`;
  const existing = order.delivery_notes ? String(order.delivery_notes) : "";

  const update = {
    customer_phone: newPhone,
    shipping_address: { ...addr, phone: newPhone },
    tracking_number: null,
    carrier_name: null,
    delhivery_latest_status: null,
    delhivery_latest_scan_at: null,
    delhivery_latest_location: null,
    status: "processing",
    delivery_notes: existing ? `${existing}\n${note}` : note,
    updated_at: now,
  };

  const statusEvent =
    order.status === "processing"
      ? null
      : { order_id: order.id, from_status: order.status, to_status: "processing", actor_admin_id: null };

  return { update, statusEvent, oldAwb: awb, oldPhone, newPhone, delhiveryOrderId };
}

/** Redis keys the storefront and admin read for this order (lib/services/cache.ts key shapes). */
export function reshipCacheTargets(order) {
  return {
    keys: [
      `user:order:${order.user_id}:${order.id}`,
      DASHBOARD_ACTIONS_KEY,
      ...SALES_RANGES.map((r) => `admin:dashboard:sales:${r}`),
    ],
    patterns: [`user:orders:${order.user_id}:*`],
  };
}
