import writeExcelFile, { type Row, type SheetData } from "write-excel-file/node";
import { cancellationNote, formatIstDateTime, istDateCell, paiseToRupees, placeOfSupplyLabel } from "./register-format";
import { monthLabel } from "./register-month";
import { effectiveAmounts, taxOf } from "./register-summaries";
import type { RegisterInvoice, SalesRegister, TaxAmounts } from "./register-types";

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const SHEET_NAMES = ["Summary", "Invoices", "B2CS", "B2CL", "HSN summary", "Documents issued", "Cancelled earlier"] as const;
export const INVOICE_COLUMNS = [
  "Invoice no.", "Invoice date", "Order no.", "Channel", "Customer name", "Place of supply", "Supply", "Rate %",
  "Taxable value", "CGST", "SGST", "IGST", "Invoice value", "Discount", "Shipping", "Payment method", "Status",
];

const NONE = "None this month";
const head = (labels: string[]): Row => labels.map((value) => ({ value, fontWeight: "bold" as const }));
// Every text cell is typed String, so a value starting with "=" is stored as text, never as a formula.
const text = (value: string) => ({ value, type: String });
const money = (paise: number) => ({ value: paiseToRupees(paise), type: Number, format: "#,##0.00" });
const count = (n: number) => ({ value: n, type: Number });
const date = (iso: string) => ({ value: istDateCell(iso), type: Date, format: "dd-mm-yyyy" });
const orNone = (header: Row, rows: Row[]): SheetData => [header, ...(rows.length ? rows : [[text(NONE)]])];

function amountRows(a: TaxAmounts): Row[] {
  return [
    [text("Taxable value"), money(a.taxablePaise)],
    [text("CGST"), money(a.cgstPaise)],
    [text("SGST"), money(a.sgstPaise)],
    [text("IGST"), money(a.igstPaise)],
    [text("Total tax"), money(taxOf(a))],
    [text("Invoice value"), money(a.valuePaise)],
  ];
}

function summarySheet(r: SalesRegister): SheetData {
  const t = r.totals;
  const period = `${r.period.from} to ${r.period.to}${r.period.unfinished ? " (month not finished)" : ""}`;
  return [
    head([`Sales register — ${monthLabel(r.month)}`, ""]),
    [text("Business"), text(r.seller.legalName)],
    [text("GSTIN"), text(r.seller.gstin)],
    [text("State"), text(`${r.seller.stateCode}-${r.seller.stateName}`)],
    [text("Period"), text(period)],
    [text("Generated at"), text(formatIstDateTime(r.generatedAt))],
    [],
    [text("Invoices issued"), count(t.issued)],
    [text("Invoices cancelled"), count(t.cancelled)],
    [text("Net invoices issued"), count(t.issued - t.cancelled)],
    [],
    head(["This month's invoices", ""]),
    ...amountRows(t.month),
    [text("Stall invoices"), count(t.byChannel.stall.count)],
    [text("Stall invoice value"), money(t.byChannel.stall.valuePaise)],
    [text("Online invoices"), count(t.byChannel.online.count)],
    [text("Online invoice value"), money(t.byChannel.online.valuePaise)],
    [],
    head(["Less: earlier months' invoices cancelled this month", ""]),
    ...amountRows(t.cancelledEarlier),
    [],
    head(["Net for the month (GSTR-3B 3.1(a))", ""]),
    ...amountRows(t.net),
    ...(r.warnings.length ? [[], head(["Warnings", ""]), ...r.warnings.map((w) => [text(w)])] : []),
  ];
}

function invoiceRow(inv: RegisterInvoice): Row {
  const a = effectiveAmounts(inv);
  const valid = inv.status === "valid";
  return [
    text(inv.invoiceNumber),
    date(inv.invoiceDate),
    text(inv.orderNumber),
    text(inv.channel === "stall" ? "Stall" : "Online"),
    text(inv.customerName),
    text(placeOfSupplyLabel(inv.placeOfSupply)),
    text(inv.mode === "intra" ? "Intra" : "Inter"),
    count(inv.ratePercent),
    money(a.taxablePaise),
    money(a.cgstPaise),
    money(a.sgstPaise),
    money(a.igstPaise),
    money(a.valuePaise),
    money(valid ? inv.discountPaise : 0),
    money(valid ? inv.shippingPaise : 0),
    text(inv.paymentMethod ?? ""),
    text(valid ? "Valid" : cancellationNote(inv.cancelledAt, inv.amounts.valuePaise)),
  ];
}

function invoicesSheet(r: SalesRegister): SheetData {
  const valid = r.invoices.filter((inv) => inv.status === "valid");
  const sum = (pick: (inv: RegisterInvoice) => number) => valid.reduce((s, inv) => s + pick(inv), 0);
  const t = r.totals.month;
  return [
    head(INVOICE_COLUMNS),
    ...r.invoices.map(invoiceRow),
    [
      { value: "Total", type: String, fontWeight: "bold" as const },
      null, null, null, null, null, null, null,
      money(t.taxablePaise), money(t.cgstPaise), money(t.sgstPaise), money(t.igstPaise), money(t.valuePaise),
      money(sum((inv) => inv.discountPaise)), money(sum((inv) => inv.shippingPaise)),
      null, null,
    ],
  ];
}

function b2csSheet(r: SalesRegister): SheetData {
  return orNone(
    head(["Type", "Place of supply", "Rate %", "Taxable value (this month)", "Less: cancelled earlier", "Net taxable value", "IGST", "CGST", "SGST", "Cess"]),
    r.b2cs.map((row) => [
      text("OE"), text(row.placeOfSupply), count(row.ratePercent), money(row.monthTaxablePaise), money(row.lessCancelledTaxablePaise),
      money(row.net.taxablePaise), money(row.net.igstPaise), money(row.net.cgstPaise), money(row.net.sgstPaise), money(0),
    ]),
  );
}

function b2clSheet(r: SalesRegister): SheetData {
  return orNone(
    head(["Invoice no.", "Invoice date", "Place of supply", "Invoice value", "Rate %", "Taxable value", "IGST", "Cess"]),
    r.b2cl.map((inv) => [
      text(inv.invoiceNumber), date(inv.invoiceDate), text(placeOfSupplyLabel(inv.placeOfSupply)), money(inv.amounts.valuePaise),
      count(inv.ratePercent), money(inv.amounts.taxablePaise), money(inv.amounts.igstPaise), money(0),
    ]),
  );
}

function hsnSheet(r: SalesRegister): SheetData {
  return orNone(
    head(["HSN", "Description", "UQC", "Total quantity", "Rate %", "Taxable value", "IGST", "CGST", "SGST", "Cess", "Total value"]),
    r.hsn.map((row) => [
      text(row.hsn), text(row.description), text(row.uqc), count(row.quantity), count(row.ratePercent), money(row.net.taxablePaise),
      money(row.net.igstPaise), money(row.net.cgstPaise), money(row.net.sgstPaise), money(0), money(row.net.valuePaise),
    ]),
  );
}

function documentsSheet(r: SalesRegister): SheetData {
  return orNone(
    head(["Nature of document", "Sr. no. from", "Sr. no. to", "Total number", "Cancelled", "Net issued"]),
    r.documents.map((run) => [
      text("Invoices for outward supply"), text(run.from), text(run.to), count(run.total), count(run.cancelled), count(run.total - run.cancelled),
    ]),
  );
}

function cancelledEarlierSheet(r: SalesRegister): SheetData {
  return orNone(
    head(["Invoice no.", "Invoice date", "Cancelled on", "Place of supply", "Rate %", "Taxable value", "CGST", "SGST", "IGST", "Invoice value"]),
    r.cancelledEarlier.map((inv) => [
      text(inv.invoiceNumber), date(inv.invoiceDate), inv.cancelledAt ? date(inv.cancelledAt) : null,
      text(placeOfSupplyLabel(inv.placeOfSupply)), count(inv.ratePercent), money(-inv.amounts.taxablePaise),
      money(-inv.amounts.cgstPaise), money(-inv.amounts.sgstPaise), money(-inv.amounts.igstPaise), money(-inv.amounts.valuePaise),
    ]),
  );
}

const WIDTHS: Record<(typeof SHEET_NAMES)[number], number[]> = {
  Summary: [48, 24],
  Invoices: [16, 12, 26, 8, 24, 18, 7, 7, 14, 12, 12, 12, 14, 12, 12, 14, 36],
  B2CS: [6, 22, 7, 22, 20, 16, 12, 12, 12, 8],
  B2CL: [16, 12, 22, 14, 7, 14, 12, 8],
  "HSN summary": [8, 52, 12, 14, 7, 14, 12, 12, 12, 8, 14],
  "Documents issued": [28, 16, 16, 12, 10, 10],
  "Cancelled earlier": [16, 12, 12, 22, 7, 14, 12, 12, 12, 14],
};

/** The register as a GSTR-1-ready .xlsx, one sheet per section, header row frozen. */
export async function registerXlsx(register: SalesRegister): Promise<Buffer> {
  const data: Record<(typeof SHEET_NAMES)[number], SheetData> = {
    Summary: summarySheet(register),
    Invoices: invoicesSheet(register),
    B2CS: b2csSheet(register),
    B2CL: b2clSheet(register),
    "HSN summary": hsnSheet(register),
    "Documents issued": documentsSheet(register),
    "Cancelled earlier": cancelledEarlierSheet(register),
  };
  return writeExcelFile(
    SHEET_NAMES.map((sheet) => ({
      sheet,
      data: data[sheet],
      columns: WIDTHS[sheet].map((width) => ({ width })),
      stickyRowsCount: 1,
    })),
  ).toBuffer();
}
