import { describe, expect, it } from "vitest";
import { buildInvoice, type InvoiceOrderRow } from "./build-invoice";

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
