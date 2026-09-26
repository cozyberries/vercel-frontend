import { describe, expect, it } from "vitest";
import { buildInvoice, type InvoiceOrderRow } from "./build-invoice";
import { renderInvoicePdf } from "./pdf";
import { invoicePdfFilename } from "./pdf-filename";

const order: InvoiceOrderRow = {
  id: "order-1",
  order_number: "ORD-20260926-143012-00042",
  created_at: "2026-09-26T08:58:00.000Z",
  status: "collected",
  fulfilment_method: "pickup",
  customer_name: "Priya Sharma",
  customer_email: "priya@example.com",
  customer_phone: "9876543210",
  shipping_address: null,
  place_of_supply: "29",
  invoice_number: "CB/26-27/0001",
  invoice_date: "2026-09-26T09:05:00.000Z",
  subtotal: 2497,
  discount_amount: 100,
  delivery_charge: 0,
  total_amount: 2397,
  order_items: [
    { name: "Frock Japanese", size: "3-4Y", color: "petal-pops", price: 1199, quantity: 1 },
    { name: "Pyjamas Ribbed", size: "1-2Y", color: "joyful-orbs", price: 649, quantity: 2 },
  ],
  payments: [{ payment_method: "cash", status: "completed" }],
};

const doc = (o: Partial<InvoiceOrderRow> = {}) =>
  buildInvoice({ order: { ...order, ...o }, gstin: "29EPDPR9174E1ZB", homeStateCode: "29" });

describe("renderInvoicePdf", () => {
  it("renders an issued tax invoice as a PDF file", async () => {
    const pdf = await renderInvoicePdf(doc());
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1500);
  });

  it.each([
    ["pending", { status: "payment_pending", invoice_number: null, invoice_date: null, payments: [] }],
    ["receipt", { status: "delivered", invoice_number: null, invoice_date: null }],
    ["cancelled", { status: "cancelled" }],
    ["inter-state delivery", {
      fulfilment_method: "delivery" as const,
      place_of_supply: "33",
      delivery_charge: 90,
      total_amount: 2487,
      shipping_address: { full_name: "Priya Sharma", address_line_1: "1 Anna Salai", city: "Chennai", state: "Tamil Nadu", postal_code: "600002", country: "India" },
    }],
  ])("renders the %s variant", async (_label, overrides) => {
    const pdf = await renderInvoicePdf(doc(overrides as Partial<InvoiceOrderRow>));
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

describe("invoicePdfFilename", () => {
  it("names issued invoices by invoice number, without slashes", () => {
    expect(invoicePdfFilename(doc())).toBe("CozyBerries-Invoice-CB-26-27-0001.pdf");
  });

  it("names documents without an invoice number by order number", () => {
    expect(invoicePdfFilename(doc({ status: "payment_pending", invoice_number: null }))).toBe(
      "CozyBerries-Order-ORD-20260926-143012-00042.pdf"
    );
  });
});

describe("buildInvoice line descriptions", () => {
  it("shows colour slugs as readable names", () => {
    expect(doc().lines[0].description).toBe("Frock Japanese · Size 3-4Y · Petal Pops");
  });
});
