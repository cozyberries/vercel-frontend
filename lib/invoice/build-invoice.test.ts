import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInvoice, type InvoiceOrderRow } from "./build-invoice";

const mrp = vi.hoisted(() => ({ discountRate: 0.1, shownSince: new Date("2026-09-27T00:00:00+05:30") }));
vi.mock("@/lib/config/offers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/offers")>()),
  MRP_DISPLAY: mrp,
}));
afterEach(() => {
  mrp.discountRate = 0.1;
});

const baseOrder: InvoiceOrderRow = {
  id: "order-1",
  order_number: "ORD-1",
  created_at: "2026-09-25T06:00:00.000Z",
  status: "processing",
  fulfilment_method: "pickup",
  customer_name: "Asha Rao",
  customer_email: "asha@example.com",
  customer_phone: "9876543210",
  shipping_address: null,
  place_of_supply: "29",
  invoice_number: "CB/26-27/0001",
  invoice_date: "2026-09-25T06:05:00.000Z",
  subtotal: 1050,
  discount_amount: 0,
  delivery_charge: 0,
  total_amount: 1050,
  order_items: [{ name: "Frock", size: "3-4Y", color: "pink", price: 1050, quantity: 1 }],
  payments: [{ payment_method: "cash", status: "completed" }],
};

const build = (order: Partial<InvoiceOrderRow>) =>
  buildInvoice({ order: { ...baseOrder, ...order }, gstin: "29EPDPR9174E1ZB", homeStateCode: "29" });

describe("buildInvoice", () => {
  it("issues an intra-state invoice for a paid pickup order", () => {
    const inv = build({});
    expect(inv.status).toBe("issued");
    expect(inv.invoiceNumber).toBe("CB/26-27/0001");
    expect(inv.mode).toBe("intra");
    expect(inv.shipTo).toEqual({ kind: "pickup", label: expect.stringContaining("Self-pickup") });
    expect(inv.seller.gstin).toBe("29EPDPR9174E1ZB");
    expect(inv.buyer).toEqual({ name: "Asha Rao", phone: "9876543210", email: "asha@example.com" });
    expect(inv.lines[0]).toMatchObject({ description: "Frock · Size 3-4Y · Pink", hsn: "6111", cgstPaise: 2500, sgstPaise: 2500 });
    expect(inv.totals.totalPaise).toBe(105000);
    expect(inv.amountInWords).toBe("Rupees One Thousand Fifty Only");
    expect(inv.paymentMethod).toBe("Cash");
    expect(inv.placeOfSupply).toEqual({ code: "29", name: "Karnataka" });
  });

  it("uses IGST for delivery to another state and prints the address", () => {
    const inv = build({
      fulfilment_method: "delivery",
      place_of_supply: "33",
      delivery_charge: 90,
      total_amount: 1140,
      shipping_address: { full_name: "Asha Rao", address_line_1: "1 Anna Salai", city: "Chennai", state: "Tamil Nadu", postal_code: "600002", country: "India" },
      payments: [{ payment_method: "upi", status: "completed" }],
    });
    expect(inv.mode).toBe("inter");
    expect(inv.lines).toHaveLength(2);
    expect(inv.totals.igstPaise).toBeGreaterThan(0);
    expect(inv.totals.totalPaise).toBe(114000);
    expect(inv.shipTo).toEqual({ kind: "delivery", lines: ["Asha Rao", "1 Anna Salai", "Chennai, Tamil Nadu 600002", "India"] });
    expect(inv.paymentMethod).toBe("UPI");
  });

  it("resolves the place of supply from the address for orders placed before it was stored", () => {
    const inv = build({
      fulfilment_method: "delivery",
      place_of_supply: null,
      shipping_address: { full_name: "A", address_line_1: "x", city: "Bengaluru", state: "Karnataka", postal_code: "560005", country: "India" },
    });
    expect(inv.mode).toBe("intra");
    expect(inv.placeOfSupply).toEqual({ code: "29", name: "Karnataka" });
  });

  it("falls back to IGST and prints the raw state when the state could not be resolved", () => {
    const inv = build({
      fulfilment_method: "delivery",
      place_of_supply: null,
      shipping_address: { full_name: "T", address_line_1: "x", city: "y", state: "test", postal_code: "1", country: "India" },
    });
    expect(inv.mode).toBe("inter");
    expect(inv.placeOfSupply).toEqual({ code: null, name: "test" });
  });

  it("is only an order summary until payment is confirmed", () => {
    const inv = build({ status: "payment_pending", invoice_number: null, invoice_date: null, payments: [] });
    expect(inv.status).toBe("pending");
    expect(inv.invoiceNumber).toBeNull();
    expect(inv.paymentMethod).toBeNull();
  });

  it("stays an order summary while payment is re-verified, even with an invoice number kept", () => {
    const inv = build({ status: "verifying_payment" });
    expect(inv.status).toBe("pending");
  });

  it("is a payment receipt for an order paid before invoice numbers existed", () => {
    const inv = build({ status: "processing", invoice_number: null, invoice_date: null });
    expect(inv.status).toBe("receipt");
    expect(inv.invoiceNumber).toBeNull();
    expect(build({ status: "delivered", invoice_number: null, invoice_date: null, fulfilment_method: "delivery" }).status)
      .toBe("receipt");
  });

  it("is cancelled for a cancelled or refunded order, keeping its invoice number", () => {
    const inv = build({ status: "cancelled" });
    expect(inv.status).toBe("cancelled");
    expect(inv.invoiceNumber).toBe("CB/26-27/0001");
    expect(build({ status: "refunded", invoice_number: null }).status).toBe("cancelled");
  });
});

describe("buildInvoice — MRP and the full discount", () => {
  const placed = "2026-10-02T10:00:00+05:30";

  it("shows no MRP for an order placed before the MRP was shown", () => {
    expect(build({}).mrp).toBeNull(); // baseOrder is from 25 Sep
  });

  it("shows no MRP while the MRP display is off", () => {
    mrp.discountRate = 0;
    expect(build({ created_at: placed }).mrp).toBeNull();
  });

  it("lists the MRP saving as the discount on a plain order", () => {
    // ₹1,050 ÷ 0.9 = ₹1,166.67 → ₹1,167.
    expect(build({ created_at: placed }).mrp).toEqual({
      unitMrpPaise: [116700],
      totalMrpPaise: 116700,
      mrpSavingPaise: 11700,
      extraDiscountPaise: 0,
      extraDiscountLabel: null,
      discountPaise: 11700,
    });
  });

  it("adds an admin discount as a special discount", () => {
    const inv = build({
      created_at: placed, subtotal: 1000, discount_code: "ADMIN_OVERRIDE", discount_amount: 100, total_amount: 900,
      order_items: [{ name: "Frock", size: "3-4Y", color: null, price: 1000, quantity: 1 }],
    });
    expect(inv.mrp).toMatchObject({
      totalMrpPaise: 111100, mrpSavingPaise: 11100, extraDiscountPaise: 10000,
      extraDiscountLabel: "special discount", discountPaise: 21100,
    });
    expect(inv.totals.totalPaise).toBe(90000);
  });

  it("names a coupon by its code", () => {
    const inv = build({
      created_at: placed, subtotal: 1000, discount_code: "EARLY5", discount_amount: 50, total_amount: 950,
      order_items: [{ name: "Frock", size: null, color: null, price: 1000, quantity: 1 }],
    });
    expect(inv.mrp?.extraDiscountLabel).toBe("EARLY5");
  });

  it("gives a raised line its own MRP, so it reads like any other", () => {
    const inv = build({
      created_at: placed, subtotal: 989, total_amount: 989,
      order_items: [{ name: "Frock", size: null, color: null, price: 989, quantity: 1 }],
    });
    expect(inv.mrp).toMatchObject({ totalMrpPaise: 109900, mrpSavingPaise: 11000, discountPaise: 11000 });
  });

  it("leaves the shipping line without an MRP and out of Total MRP", () => {
    const inv = build({
      created_at: placed, fulfilment_method: "delivery", delivery_charge: 90, total_amount: 1140,
      shipping_address: { full_name: "Asha Rao", address_line_1: "1 MG Road", city: "Bengaluru", state: "Karnataka", postal_code: "560001", country: "India" },
    });
    expect(inv.lines).toHaveLength(2);
    expect(inv.mrp?.unitMrpPaise).toEqual([116700, null]);
    expect(inv.mrp?.totalMrpPaise).toBe(116700);
  });

  it("changes no tax figure", () => {
    const order = {
      subtotal: 1000, discount_code: "ADMIN_OVERRIDE", discount_amount: 100, total_amount: 900,
      order_items: [{ name: "Frock", size: null, color: null, price: 1000, quantity: 1 }],
    };
    const withMrp = build({ ...order, created_at: placed });
    const withoutMrp = build({ ...order });
    expect(withMrp.totals).toEqual(withoutMrp.totals);
    expect(withMrp.lines).toEqual(withoutMrp.lines);
  });
});
