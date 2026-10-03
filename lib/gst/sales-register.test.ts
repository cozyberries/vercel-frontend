import { describe, expect, it } from "vitest";
import { buildInvoice } from "@/lib/invoice/build-invoice";
import { GSTIN, NOW, orderRow } from "./__fixtures__/register";
import { buildSalesRegister, type RegisterOrderRow } from "./sales-register";

const build = (orders: RegisterOrderRow[], extra: Partial<Parameters<typeof buildSalesRegister>[0]> = {}) =>
  buildSalesRegister({ month: "2026-09", orders, cancelledEarlier: [], missingNumbers: [], gstin: GSTIN, now: NOW, ...extra });

const invoiceTotals = (row: RegisterOrderRow) =>
  buildInvoice({ order: { ...row, customer_email: null, customer_phone: null }, gstin: GSTIN, homeStateCode: "29" }).totals;

describe("buildSalesRegister", () => {
  it("matches buildInvoice to the paisa, line by line and in total", () => {
    const rows = [
      orderRow(),
      orderRow({ id: "o2", invoice_number: "CB/26-27/0002", subtotal: 2100, discount_amount: 50, total_amount: 2050,
        order_items: [{ name: "Set", size: "1-2Y", color: null, price: 700, quantity: 3 }] }),
      orderRow({ id: "o3", invoice_number: "CB/26-27/0003", status: "delivered", fulfilment_method: "delivery",
        place_of_supply: "33", shipping_address: { full_name: "K", state: "Tamil Nadu" }, delivery_charge: 90, total_amount: 1140 }),
    ];
    const r = build(rows);
    rows.forEach((row, i) => {
      const t = invoiceTotals(row);
      expect(r.invoices[i].amounts).toEqual({
        taxablePaise: t.taxablePaise, cgstPaise: t.cgstPaise, sgstPaise: t.sgstPaise, igstPaise: t.igstPaise, valuePaise: t.totalPaise,
      });
    });
    expect(r.totals.month.valuePaise).toBe(105000 + 205000 + 114000);
    expect(r.totals.month.taxablePaise).toBe(rows.reduce((s, row) => s + invoiceTotals(row).taxablePaise, 0));
    expect(r.invoices[1]).toMatchObject({ discountPaise: 5000, shippingPaise: 0 });
    expect(r.invoices[2]).toMatchObject({ shippingPaise: 9000, mode: "inter", channel: "online", placeOfSupply: { code: "33", name: "Tamil Nadu" } });
    expect(r.invoices[2].lines.map((l) => l.quantity)).toEqual([1, 0]);
  });

  it("zeroes nothing itself but marks an invoice cancelled within its month", () => {
    const r = build([orderRow({ status: "cancelled", invoice_voided_at: "2026-09-28T10:00:00.000Z" })]);
    expect(r.invoices[0]).toMatchObject({ status: "cancelled", cancelledAt: "2026-09-28T10:00:00.000Z", amounts: { valuePaise: 105000 } });
    expect(r.totals).toMatchObject({ issued: 1, cancelled: 1, month: { valuePaise: 0 } });
    expect(r.documents).toEqual([{ from: "CB/26-27/0001", to: "CB/26-27/0001", total: 1, cancelled: 1 }]);
    expect(r.b2cs).toEqual([]);
  });

  it("keeps an invoice cancelled after the month end valid in its month", () => {
    const r = build([orderRow({ status: "cancelled", invoice_voided_at: "2026-10-02T10:00:00.000Z" })]);
    expect(r.invoices[0]).toMatchObject({ status: "valid", cancelledAt: null });
    expect(r.totals).toMatchObject({ cancelled: 0, month: { valuePaise: 105000 } });
  });

  it("voided exactly at the month end stays valid; a millisecond earlier is cancelled", () => {
    const atEnd = build([orderRow({ status: "cancelled", invoice_voided_at: "2026-09-30T18:30:00.000Z" })]);
    const justBefore = build([orderRow({ status: "cancelled", invoice_voided_at: "2026-09-30T18:29:59.999Z" })]);
    expect(atEnd.invoices[0].status).toBe("valid");
    expect(justBefore.invoices[0].status).toBe("cancelled");
  });

  it("subtracts earlier months' invoices cancelled this month", () => {
    const r = buildSalesRegister({
      month: "2026-10",
      orders: [orderRow({ id: "o17", invoice_number: "CB/26-27/0017", invoice_date: "2026-10-02T06:00:00.000Z" })],
      cancelledEarlier: [orderRow({ status: "cancelled", invoice_voided_at: "2026-10-02T09:00:00.000Z" })],
      missingNumbers: [],
      gstin: GSTIN,
      now: NOW,
    });
    expect(r.cancelledEarlier[0]).toMatchObject({ invoiceNumber: "CB/26-27/0001", status: "cancelled", cancelledAt: "2026-10-02T09:00:00.000Z" });
    expect(r.totals.cancelledEarlier.valuePaise).toBe(105000);
    expect(r.totals.net).toEqual({ taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, valuePaise: 0 });
    expect(r.b2cs[0]).toMatchObject({ monthTaxablePaise: 100000, lessCancelledTaxablePaise: 100000, net: { taxablePaise: 0 } });
    expect(r.hsn[0].quantity).toBe(0);
    expect(r.period).toEqual({ from: "01-10-2026", to: "03-10-2026", unfinished: true });
  });

  it("splits valid invoices between Stall and Online", () => {
    const r = build([
      orderRow(),
      orderRow({ id: "o2", invoice_number: "CB/26-27/0002", status: "delivered", fulfilment_method: "delivery",
        shipping_address: { full_name: "R", state: "Karnataka" }, place_of_supply: null, delivery_charge: 90, total_amount: 1140 }),
      orderRow({ id: "o3", invoice_number: "CB/26-27/0003", status: "cancelled", invoice_voided_at: "2026-09-28T10:00:00.000Z" }),
    ]);
    expect(r.totals.byChannel).toEqual({ stall: { count: 1, valuePaise: 105000 }, online: { count: 1, valuePaise: 114000 } });
    expect(r.invoices[1].placeOfSupply).toEqual({ code: "29", name: "Karnataka" });
  });

  it("puts inter-state invoices above ₹1,00,000 in B2CL and out of B2CS", () => {
    const r = build([
      orderRow({ invoice_number: "CB/26-27/0005", status: "delivered", fulfilment_method: "delivery", place_of_supply: "27",
        shipping_address: { full_name: "M", state: "Maharashtra" }, subtotal: 100000.01, total_amount: 100000.01,
        order_items: [{ name: "Bulk", size: null, color: null, price: 100000.01, quantity: 1 }] }),
    ]);
    expect(r.b2cl.map((i) => i.invoiceNumber)).toEqual(["CB/26-27/0005"]);
    expect(r.b2cs).toEqual([]);
    expect(r.hsn[0].net.valuePaise).toBe(10_000_001);
  });

  it("sorts invoices by number", () => {
    const r = build(["CB/26-27/0010", "CB/26-27/0002", "CB/26-27/0009"].map((n, i) => orderRow({ id: `o${i}`, invoice_number: n })));
    expect(r.invoices.map((i) => i.invoiceNumber)).toEqual(["CB/26-27/0002", "CB/26-27/0009", "CB/26-27/0010"]);
  });

  it("warns about missing numbers, unknown place of supply, total mismatch and undated cancellations", () => {
    const r = build(
      [
        orderRow({ id: "o4", invoice_number: "CB/26-27/0004", status: "cancelled", invoice_voided_at: null }),
        orderRow({ id: "o2", invoice_number: "CB/26-27/0002", status: "delivered", fulfilment_method: "delivery",
          place_of_supply: null, shipping_address: { full_name: "R", state: "test" }, delivery_charge: 90, total_amount: 1140 }),
        orderRow({ id: "o3", invoice_number: "CB/26-27/0003", total_amount: 999 }),
      ],
      { missingNumbers: [{ order_number: "ORD-A" }, { order_number: "ORD-B" }] },
    );
    expect(r.warnings).toEqual([
      "Paid orders with no invoice number: ORD-A, ORD-B",
      "Place of supply unknown for CB/26-27/0002: check the delivery address. It is shown as IGST.",
      "CB/26-27/0003 adds up to ₹1,050.00 but the order total is ₹999.00.",
      "CB/26-27/0004 is cancelled but has no cancellation date; counted as cancelled in its own month.",
    ]);
    expect(r.invoices[0]).toMatchObject({ invoiceNumber: "CB/26-27/0002", mode: "inter" });
    expect(r.invoices[2]).toMatchObject({ invoiceNumber: "CB/26-27/0004", status: "cancelled", cancelledAt: null });
  });

  it("builds an empty month: zero totals, no rows, no warnings", () => {
    const r = build([]);
    expect(r).toMatchObject({
      month: "2026-09",
      period: { from: "01-09-2026", to: "30-09-2026", unfinished: false },
      generatedAt: NOW.toISOString(),
      seller: { legalName: "Cozyberries", gstin: GSTIN, stateCode: "29", stateName: "Karnataka" },
      invoices: [], cancelledEarlier: [], b2cs: [], b2cl: [], hsn: [], documents: [], warnings: [],
      totals: { issued: 0, cancelled: 0, month: { valuePaise: 0 }, net: { valuePaise: 0 },
        byChannel: { stall: { count: 0, valuePaise: 0 }, online: { count: 0, valuePaise: 0 } } },
    });
  });

  it("carries the customer name and payment method, never phone or email", () => {
    const r = build([orderRow()]);
    expect(r.invoices[0]).toMatchObject({ customerName: "Asha Rao", paymentMethod: "Cash", orderNumber: "ORD-1" });
    expect(JSON.stringify(r)).not.toMatch(/phone|email/i);
  });
});
