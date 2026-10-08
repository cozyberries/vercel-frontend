import { describe, expect, it } from "vitest";
import readExcelFile from "read-excel-file/node";
import { HSN_DESCRIPTION } from "@/lib/config/business";
import { GSTIN, NOW, orderRow } from "./__fixtures__/register";
import { INVOICE_COLUMNS, registerXlsx, SHEET_NAMES } from "./register-xlsx";
import { buildSalesRegister } from "./sales-register";
import type { SalesRegister } from "./register-types";

type Cell = string | number | boolean | Date | null;

async function workbook(register: SalesRegister): Promise<Record<string, Cell[][]>> {
  const sheets = await readExcelFile(await registerXlsx(register));
  return Object.fromEntries(sheets.map((s) => [s.sheet, s.data as Cell[][]]));
}

const FORMULA_NAME = '=HYPERLINK("http://x","y")';

/** 0001 stall ₹1,050 (formula-like name); 0002 cancelled 28 Sep; 0003 online ₹1,140 dated 30 Sep 23:59 IST. */
function september(): SalesRegister {
  return buildSalesRegister({
    month: "2026-09",
    orders: [
      orderRow({ customer_name: FORMULA_NAME }),
      orderRow({ id: "o2", invoice_number: "CB/26-27/0002", status: "cancelled", invoice_voided_at: "2026-09-28T10:00:00.000Z" }),
      orderRow({ id: "o3", invoice_number: "CB/26-27/0003", invoice_date: "2026-09-30T18:29:00.000Z", status: "delivered",
        fulfilment_method: "delivery", shipping_address: { full_name: "R", state: "Karnataka" }, delivery_charge: 90, total_amount: 1140,
        payments: [{ payment_method: "upi", status: "completed" }] }),
    ],
    cancelledEarlier: [],
    missingNumbers: [{ order_number: "ORD-X" }],
    gstin: GSTIN,
    now: NOW,
  });
}

const valueOf = (rows: Cell[][], label: string): Cell[] => rows.filter((r) => r[0] === label).map((r) => r[1]);

describe("registerXlsx", () => {
  it("writes nine sheets in order", async () => {
    expect(Object.keys(await workbook(september()))).toEqual([...SHEET_NAMES]);
    expect(SHEET_NAMES).toEqual(["Summary", "Invoices", "B2B", "B2CS", "B2CL", "HSN summary", "HSN B2B", "Documents issued", "Cancelled earlier"]);
  });

  it("lists every invoice with a Total row equal to the Summary and to the sum of its rows", async () => {
    const book = await workbook(september());
    const rows = book.Invoices;
    expect(rows[0]).toEqual(INVOICE_COLUMNS);
    expect(rows.slice(1, 4).map((r) => r[0])).toEqual(["CB/26-27/0001", "CB/26-27/0002", "CB/26-27/0003"]);
    const total = rows[4];
    expect(total[0]).toBe("Total");
    expect(total.slice(8, 15)).toEqual([2085.71, 52.14, 52.15, 0, 2190, 0, 90]);
    for (let col = 8; col <= 12; col++) {
      const sum = rows.slice(1, 4).reduce((s, r) => s + Number(r[col]), 0);
      expect(sum).toBeCloseTo(Number(total[col]), 2);
    }
    expect(valueOf(book.Summary, "Invoice value")).toEqual([2190, 0, 0, 2190]);
  });

  it("writes shop invoices to the B2B sheet and challans to Documents issued", async () => {
    const { retailer, doc } = await import("@/lib/retail/__fixtures__/retail");
    const r = buildSalesRegister({
      month: "2026-09", orders: [orderRow()], cancelledEarlier: [], missingNumbers: [], gstin: GSTIN, now: NOW,
      retail: { invoices: [{ ...doc({ period: "2026-09", doc_date: "2026-09-30" }), retailers: retailer() }], challans: [{ number: "CBC/26-27/0001", status: "issued" }] },
    });
    const book = await workbook(r);
    expect(book.B2B[0].slice(0, 4)).toEqual(["GSTIN of recipient", "Receiver name", "Invoice no.", "Invoice date"]);
    expect(book.B2B[1].slice(0, 3)).toEqual(["29AAGFC4321M1ZB", "Kids Corner LLP", "CBR/26-27/0001"]);
    expect(book.B2B[1][4]).toBe(750);
    expect(book["Documents issued"].map((row) => row[0])).toContain("Delivery challan in cases other than by way of supply");
    expect(valueOf(book.Summary, "Invoice value")).toEqual([1050, 750, 0, 1800]);
  });

  it("zeroes a cancelled row and notes the cancellation", async () => {
    const row = (await workbook(september())).Invoices[2];
    expect(row.slice(8, 15)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(row[16]).toBe("Cancelled 28-09-2026 (was ₹1,050.00)");
  });

  it("writes dates as date cells on the IST day", async () => {
    const row = (await workbook(september())).Invoices[3];
    expect((row[1] as Date).toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });

  it("keeps a formula-like name as text", async () => {
    expect((await workbook(september())).Invoices[1][4]).toBe(FORMULA_NAME);
  });

  it("fills the Summary with business, period, counts and warnings", async () => {
    const s = (await workbook(september())).Summary;
    expect(s[0][0]).toBe("Sales register — Sep 2026");
    expect(valueOf(s, "GSTIN")).toEqual([GSTIN]);
    expect(valueOf(s, "Period")).toEqual(["01-09-2026 to 30-09-2026"]);
    expect(valueOf(s, "Invoices issued")).toEqual([3]);
    expect(valueOf(s, "Invoices cancelled")).toEqual([1]);
    expect(valueOf(s, "Stall invoice value")).toEqual([1050]);
    expect(s.some((r) => r[0] === "Paid orders with no invoice number: ORD-X")).toBe(true);
  });

  it("writes B2CS, HSN and document runs", async () => {
    const book = await workbook(september());
    expect(book.B2CS[1]).toEqual(["OE", "29-Karnataka", 5, 2085.71, 0, 2085.71, 0, 52.14, 52.15, 0]);
    expect(book["HSN summary"][1]).toEqual(["6111", HSN_DESCRIPTION, "PCS-PIECES", 2, 5, 2085.71, 0, 52.14, 52.15, 0, 2190]);
    expect(book["Documents issued"][1]).toEqual(["Invoices for outward supply", "CB/26-27/0001", "CB/26-27/0003", 3, 1, 2]);
    expect(book.B2CL[1][0]).toBe("None this month");
    expect(book["Cancelled earlier"][1][0]).toBe("None this month");
  });

  it("writes earlier cancellations as minus figures", async () => {
    const register = buildSalesRegister({
      month: "2026-10",
      orders: [],
      cancelledEarlier: [orderRow({ status: "cancelled", invoice_voided_at: "2026-10-02T09:00:00.000Z" })],
      missingNumbers: [],
      gstin: GSTIN,
      now: NOW,
    });
    const row = (await workbook(register))["Cancelled earlier"][1];
    expect(row[0]).toBe("CB/26-27/0001");
    expect((row[1] as Date).toISOString()).toBe("2026-09-25T00:00:00.000Z");
    expect((row[2] as Date).toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(row.slice(3)).toEqual(["29-Karnataka", 5, -1000, -25, -25, 0, -1050]);
  });

  it("writes a nil register for an empty month", async () => {
    const book = await workbook(buildSalesRegister({ month: "2026-09", orders: [], cancelledEarlier: [], missingNumbers: [], gstin: GSTIN, now: NOW }));
    expect(book.Invoices).toHaveLength(2);
    expect(book.Invoices[1].slice(0, 13)).toEqual(["Total", null, null, null, null, null, null, null, 0, 0, 0, 0, 0]);
    for (const sheet of ["B2CS", "B2CL", "HSN summary", "Documents issued", "Cancelled earlier"]) {
      expect(book[sheet][1][0]).toBe("None this month");
    }
  });
});
