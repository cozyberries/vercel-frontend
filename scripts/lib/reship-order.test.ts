import { describe, expect, it } from "vitest";
import { normalisePhone, planReship, reshipCacheTargets } from "./reship-order.mjs";

const NOW = "2026-11-06T10:00:00.000Z";

const order = () => ({
  id: "ac1112f0-c60c-4d1c-ab0d-91e527833e2a",
  user_id: "u-1",
  order_number: "ORD-20261024-084659-00514",
  status: "delivered",
  fulfilment_method: "delivery",
  tracking_number: "51289710000140",
  carrier_name: "Delhivery",
  customer_phone: "8754590439",
  shipping_address: { full_name: "Fahira", phone: "8754590439", city: "Dindigul", postal_code: "624002" },
  delivery_notes: null as string | null,
  delhivery_latest_status: "RTO",
});

describe("normalisePhone", () => {
  it("keeps a ten-digit Indian mobile and strips country code, zero, spaces and dashes", () => {
    expect(normalisePhone("8189869691")).toBe("8189869691");
    expect(normalisePhone("+91 81898 69691")).toBe("8189869691");
    expect(normalisePhone("91-8189869691")).toBe("8189869691");
    expect(normalisePhone("08189869691")).toBe("8189869691");
  });

  it("rejects anything that is not a ten-digit mobile starting 6-9", () => {
    expect(() => normalisePhone("12345")).toThrow(/ten-digit/);
    expect(() => normalisePhone("5189869691")).toThrow(/ten-digit/);
    expect(() => normalisePhone("")).toThrow(/ten-digit/);
  });
});

describe("planReship", () => {
  it("puts the new phone on the order, clears the returned shipment and sets Processing", () => {
    const plan = planReship({ order: order(), phone: "8189869691", now: NOW });

    expect(plan.update).toEqual({
      customer_phone: "8189869691",
      shipping_address: { full_name: "Fahira", phone: "8189869691", city: "Dindigul", postal_code: "624002" },
      tracking_number: null,
      carrier_name: null,
      delhivery_latest_status: null,
      delhivery_latest_scan_at: null,
      delhivery_latest_location: null,
      status: "processing",
      delivery_notes:
        "Shipment 51289710000140 returned to origin (customer unreachable on 8754590439); re-ship to 8189869691 as ORD-20261024-084659-00514-R1",
      updated_at: NOW,
    });
    expect(plan.statusEvent).toEqual({
      order_id: "ac1112f0-c60c-4d1c-ab0d-91e527833e2a",
      from_status: "delivered",
      to_status: "processing",
      actor_admin_id: null,
    });
    expect(plan.oldAwb).toBe("51289710000140");
    expect(plan.delhiveryOrderId).toBe("ORD-20261024-084659-00514-R1");
  });

  it("appends to existing notes and numbers the re-ship after earlier shipments in the notes", () => {
    const o = order();
    o.delivery_notes =
      "Shipment 11111111111111 cancelled: wrong size\nShipment 22222222222222 returned to origin (customer unreachable on 8754590439); re-ship to 8754590439 as ORD-20261024-084659-00514-R2";
    const plan = planReship({ order: o, phone: "8189869691", now: NOW });
    expect(plan.delhiveryOrderId).toBe("ORD-20261024-084659-00514-R3");
    expect(plan.update.delivery_notes).toBe(
      `${o.delivery_notes}\nShipment 51289710000140 returned to origin (customer unreachable on 8754590439); re-ship to 8189869691 as ORD-20261024-084659-00514-R3`
    );
  });

  it("records no status event when the order is already Processing", () => {
    const o = { ...order(), status: "processing" };
    const plan = planReship({ order: o, phone: "8189869691", now: NOW });
    expect(plan.statusEvent).toBeNull();
    expect(plan.update.status).toBe("processing");
  });

  it("refuses a pickup order, an unpaid or cancelled order, and an order with no shipment", () => {
    expect(() => planReship({ order: { ...order(), fulfilment_method: "pickup" }, phone: "8189869691", now: NOW })).toThrow(
      /pickup/
    );
    expect(() => planReship({ order: { ...order(), status: "cancelled" }, phone: "8189869691", now: NOW })).toThrow(
      /cancelled/
    );
    expect(() => planReship({ order: { ...order(), status: "payment_pending" }, phone: "8189869691", now: NOW })).toThrow(
      /payment_pending/
    );
    expect(() => planReship({ order: { ...order(), tracking_number: null }, phone: "8189869691", now: NOW })).toThrow(
      /no Delhivery shipment/
    );
    expect(() => planReship({ order: { ...order(), shipping_address: null }, phone: "8189869691", now: NOW })).toThrow(
      /shipping address/
    );
  });

  it("refuses unless Delhivery has reported the parcel returned, or --force is passed", () => {
    const live = { ...order(), delhivery_latest_status: "In Transit" };
    expect(() => planReship({ order: live, phone: "8189869691", now: NOW })).toThrow(/not reported .* returned/);
    expect(planReship({ order: live, phone: "8189869691", now: NOW, force: true }).oldAwb).toBe("51289710000140");
    expect(planReship({ order: { ...order(), delhivery_latest_status: "Returned" }, phone: "8189869691", now: NOW }).oldAwb).toBe(
      "51289710000140"
    );
  });

  it("refuses the same number that just failed, unless forced", () => {
    expect(() => planReship({ order: order(), phone: "8754590439", now: NOW })).toThrow(/same number/);
    expect(planReship({ order: order(), phone: "8754590439", now: NOW, force: true }).update.customer_phone).toBe("8754590439");
  });
});

describe("reshipCacheTargets", () => {
  it("names the customer's order caches and the admin dashboard keys", () => {
    expect(reshipCacheTargets(order())).toEqual({
      keys: [
        "user:order:u-1:ac1112f0-c60c-4d1c-ab0d-91e527833e2a",
        "admin:dashboard:actions",
        "admin:dashboard:sales:30d",
        "admin:dashboard:sales:3m",
        "admin:dashboard:sales:12m",
        "admin:dashboard:sales:all",
      ],
      patterns: ["user:orders:u-1:*"],
    });
  });
});
