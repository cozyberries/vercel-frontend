import { describe, expect, it } from "vitest";
import { delhiveryOrderIdFor, manifestCacheTargets, planManifest, waybillFrom } from "./manifest-shipment.mjs";

const order = () => ({
  id: "ac1112f0-c60c-4d1c-ab0d-91e527833e2a",
  user_id: "u-1",
  order_number: "ORD-20261024-084659-00514",
  status: "processing",
  fulfilment_method: "delivery",
  tracking_number: null as string | null,
  total_amount: "1273.00",
  customer_phone: "8189869691",
  shipping_address: {
    full_name: "Fahira",
    phone: "8189869691",
    address_line_1: "33/9, maraignana nagar , yousufiya college opposite , paraipatti ",
    city: "Dindigul",
    state: "Tamil Nadu",
    country: "India",
    postal_code: "624002",
  },
  delivery_notes:
    "Shipment 51289710000140 returned to origin (customer unreachable on 8754590439); re-ship to 8189869691 as ORD-20261024-084659-00514-R1" as string | null,
});
const items = [
  { sku: "pyjamas-with-rib-pine-cone-3-6m-pine-cone", quantity: 1 },
  { sku: "frock-sleeveless-joyful-orbs-3-6m-joyful-orbs", quantity: 1 },
];
const upi = [{ payment_method: "upi", status: "completed" }];

describe("delhiveryOrderIdFor", () => {
  it("uses the last re-ship id recorded in the delivery notes", () => {
    expect(delhiveryOrderIdFor(order())).toBe("ORD-20261024-084659-00514-R1");
    const twice = { ...order(), delivery_notes: `${order().delivery_notes}\nShipment 2 returned to origin (x); re-ship to 1 as ORD-20261024-084659-00514-R2` };
    expect(delhiveryOrderIdFor(twice)).toBe("ORD-20261024-084659-00514-R2");
  });

  it("falls back to the order number for a first shipment", () => {
    expect(delhiveryOrderIdFor({ ...order(), delivery_notes: null })).toBe("ORD-20261024-084659-00514");
    expect(delhiveryOrderIdFor({ ...order(), delivery_notes: "Shipment 1 cancelled: wrong size" })).toBe("ORD-20261024-084659-00514");
  });
});

describe("planManifest", () => {
  it("builds the same payload as the admin shipment route, with the re-ship order id", () => {
    const plan = planManifest({ order: order(), items, payments: upi, warehouseName: "Cozyberries" });
    expect(plan.delhiveryOrderId).toBe("ORD-20261024-084659-00514-R1");
    expect(plan.payload).toEqual({
      shipments: [
        {
          name: "Fahira",
          order: "ORD-20261024-084659-00514-R1",
          phone: "8189869691",
          add: "33/9, maraignana nagar , yousufiya college opposite , paraipatti ",
          pin: 624002,
          city: "Dindigul",
          state: "Tamil Nadu",
          country: "India",
          payment_mode: "Prepaid",
          cod_amount: 0,
          total_amount: 1273,
          weight: 500,
          products_desc: "pyjamas-with-rib-pine-cone-3-6m-pine-cone(1)~frock-sleeveless-joyful-orbs-3-6m-joyful-orbs(1)",
          quantity: "2",
          shipping_mode: "Surface",
          seller_name: "Cozyberries",
          seller_add: "",
          return_name: "Cozyberries",
          waybill: "",
        },
      ],
      pickup_location: { name: "Cozyberries" },
    });
  });

  it("marks a completed cash-on-delivery payment as COD with the amount to collect", () => {
    const plan = planManifest({
      order: order(),
      items,
      payments: [{ payment_method: "cod", status: "completed" }],
      warehouseName: "Cozyberries",
    });
    expect(plan.isCod).toBe(true);
    expect(plan.payload.shipments[0].payment_mode).toBe("COD");
    expect(plan.payload.shipments[0].cod_amount).toBe(1273);
  });

  it("refuses pickup orders, orders with a shipment, unpaid or shipped orders, missing address, warehouse or items", () => {
    const base = { items, payments: upi, warehouseName: "Cozyberries" };
    expect(() => planManifest({ ...base, order: { ...order(), fulfilment_method: "pickup" } })).toThrow(/pickup/);
    expect(() => planManifest({ ...base, order: { ...order(), tracking_number: "999" } })).toThrow(/already has shipment 999/);
    expect(() => planManifest({ ...base, order: { ...order(), status: "payment_pending" } })).toThrow(/payment_pending/);
    expect(() => planManifest({ ...base, order: { ...order(), status: "shipped" } })).toThrow(/shipped/);
    expect(() => planManifest({ ...base, order: { ...order(), shipping_address: null } })).toThrow(/shipping address/);
    expect(() => planManifest({ ...base, order: order(), warehouseName: " " })).toThrow(/warehouse/);
    expect(() => planManifest({ ...base, order: order(), items: [] })).toThrow(/no items/);
  });
});

describe("waybillFrom", () => {
  it("returns the waybill of a successful package", () => {
    expect(waybillFrom({ success: true, packages: [{ status: "Success", waybill: "51289710000999", remarks: [] }] })).toBe(
      "51289710000999"
    );
  });

  it("surfaces Delhivery's remark on failure", () => {
    expect(() => waybillFrom({ success: false, rmk: "Duplicate Order Id", packages: [] })).toThrow(/Duplicate Order Id/);
    expect(() => waybillFrom({ success: true, packages: [{ status: "Fail", waybill: "", remarks: ["Incorrect phone number(s)"] }] })).toThrow(
      /Incorrect phone/
    );
    expect(() => waybillFrom({ success: true, packages: [] })).toThrow(/no package/);
  });
});

describe("manifestCacheTargets", () => {
  it("names the customer's order caches and the admin action counts", () => {
    expect(manifestCacheTargets(order())).toEqual({
      keys: ["user:order:u-1:ac1112f0-c60c-4d1c-ab0d-91e527833e2a", "admin:dashboard:actions"],
      patterns: ["user:orders:u-1:*"],
    });
  });
});
