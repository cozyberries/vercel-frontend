import { B2CL_LIMIT_PAISE, HSN_BABY_GARMENTS, HSN_DESCRIPTION, UQC_PIECES } from "@/lib/config/business";
import { placeOfSupplyLabel } from "./register-format";
import type { B2csRow, DocumentRun, HsnRow, RegisterInvoice, TaxAmounts } from "./register-types";

export const ZERO: TaxAmounts = { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, valuePaise: 0 };

export function addAmounts(a: TaxAmounts, b: TaxAmounts): TaxAmounts {
  return {
    taxablePaise: a.taxablePaise + b.taxablePaise,
    cgstPaise: a.cgstPaise + b.cgstPaise,
    sgstPaise: a.sgstPaise + b.sgstPaise,
    igstPaise: a.igstPaise + b.igstPaise,
    valuePaise: a.valuePaise + b.valuePaise,
  };
}

export function subtractAmounts(a: TaxAmounts, b: TaxAmounts): TaxAmounts {
  return {
    taxablePaise: a.taxablePaise - b.taxablePaise,
    cgstPaise: a.cgstPaise - b.cgstPaise,
    sgstPaise: a.sgstPaise - b.sgstPaise,
    igstPaise: a.igstPaise - b.igstPaise,
    valuePaise: a.valuePaise - b.valuePaise,
  };
}

export function sumAmounts(list: TaxAmounts[]): TaxAmounts {
  return list.reduce(addAmounts, ZERO);
}

export function taxOf(a: TaxAmounts): number {
  return a.cgstPaise + a.sgstPaise + a.igstPaise;
}

/** What a row contributes as at month end: its amounts when valid, zero when cancelled. */
export function effectiveAmounts(inv: RegisterInvoice): TaxAmounts {
  return inv.status === "valid" ? inv.amounts : ZERO;
}

/** GSTR-1 table 5: inter-state invoices above ₹1,00,000. An intra-state invoice never is. */
export function isB2cl(inv: RegisterInvoice): boolean {
  return inv.mode === "inter" && inv.amounts.valuePaise > B2CL_LIMIT_PAISE;
}

const INVOICE_NUMBER = /^(.*\/)(\d+)$/;

export function parseInvoiceNumber(n: string): { prefix: string; seq: number } | null {
  const match = INVOICE_NUMBER.exec(n);
  return match ? { prefix: match[1], seq: Number(match[2]) } : null;
}

/** CB/26-27/9999 before CB/26-27/10000; numbers of another shape sort after, as text. */
export function compareInvoiceNumbers(a: string, b: string): number {
  const pa = parseInvoiceNumber(a);
  const pb = parseInvoiceNumber(b);
  if (pa && pb) return pa.prefix.localeCompare(pb.prefix) || pa.seq - pb.seq;
  if (pa) return -1;
  if (pb) return 1;
  return a.localeCompare(b);
}

/**
 * GSTR-1 table 7, one row per place of supply and rate: this month's valid
 * non-B2CL invoices, less earlier months' non-B2CL invoices cancelled this month.
 */
export function b2csRows(invoices: RegisterInvoice[], cancelledEarlier: RegisterInvoice[]): B2csRow[] {
  const rows = new Map<string, { placeOfSupply: string; ratePercent: number; month: TaxAmounts; less: TaxAmounts }>();
  const rowFor = (inv: RegisterInvoice) => {
    const placeOfSupply = placeOfSupplyLabel(inv.placeOfSupply);
    const key = `${placeOfSupply}|${inv.ratePercent}`;
    let row = rows.get(key);
    if (!row) {
      row = { placeOfSupply, ratePercent: inv.ratePercent, month: ZERO, less: ZERO };
      rows.set(key, row);
    }
    return row;
  };
  for (const inv of invoices) {
    if (inv.status !== "valid" || isB2cl(inv)) continue;
    const row = rowFor(inv);
    row.month = addAmounts(row.month, inv.amounts);
  }
  for (const inv of cancelledEarlier) {
    if (isB2cl(inv)) continue;
    const row = rowFor(inv);
    row.less = addAmounts(row.less, inv.amounts);
  }
  return [...rows.values()]
    .sort((a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply) || a.ratePercent - b.ratePercent)
    .map((row) => ({
      placeOfSupply: row.placeOfSupply,
      ratePercent: row.ratePercent,
      monthTaxablePaise: row.month.taxablePaise,
      lessCancelledTaxablePaise: row.less.taxablePaise,
      net: subtractAmounts(row.month, row.less),
    }));
}

/**
 * GSTR-1 table 12 (B2C), one row per HSN and rate over every valid invoice's
 * lines (B2CS and B2CL), less earlier months' cancellations. Shipping lines
 * carry quantity 0, so they add value but not pieces.
 */
export function hsnRows(
  invoices: Pick<RegisterInvoice, "status" | "lines" | "ratePercent">[],
  cancelledEarlier: Pick<RegisterInvoice, "status" | "lines" | "ratePercent">[],
): HsnRow[] {
  const rows = new Map<string, { hsn: string; ratePercent: number; quantity: number; net: TaxAmounts }>();
  const add = (inv: Pick<RegisterInvoice, "status" | "lines" | "ratePercent">, sign: 1 | -1) => {
    for (const line of inv.lines) {
      const key = `${line.hsn}|${inv.ratePercent}`;
      const row = rows.get(key) ?? { hsn: line.hsn, ratePercent: inv.ratePercent, quantity: 0, net: ZERO };
      row.quantity += sign * line.quantity;
      row.net = sign === 1 ? addAmounts(row.net, line) : subtractAmounts(row.net, line);
      rows.set(key, row);
    }
  };
  for (const inv of invoices) if (inv.status === "valid") add(inv, 1);
  for (const inv of cancelledEarlier) add(inv, -1);
  return [...rows.values()]
    .sort((a, b) => a.hsn.localeCompare(b.hsn) || a.ratePercent - b.ratePercent)
    .map((row) => ({
      hsn: row.hsn,
      description: row.hsn === HSN_BABY_GARMENTS ? HSN_DESCRIPTION : "",
      uqc: UQC_PIECES,
      ratePercent: row.ratePercent,
      quantity: row.quantity,
      net: row.net,
    }));
}

/** GSTR-1 table 13: runs of consecutive numbers within one series, each with its cancelled count. */
export function documentRuns(invoices: Pick<RegisterInvoice, "invoiceNumber" | "status">[]): DocumentRun[] {
  const sorted = [...invoices].sort((a, b) => compareInvoiceNumbers(a.invoiceNumber, b.invoiceNumber));
  const runs: DocumentRun[] = [];
  let previous: { prefix: string; seq: number } | null = null;
  for (const inv of sorted) {
    const parsed = parseInvoiceNumber(inv.invoiceNumber);
    const last = runs[runs.length - 1];
    if (last && parsed && previous && parsed.prefix === previous.prefix && parsed.seq === previous.seq + 1) {
      last.to = inv.invoiceNumber;
      last.total += 1;
    } else {
      runs.push({ from: inv.invoiceNumber, to: inv.invoiceNumber, total: 1, cancelled: 0 });
    }
    if (inv.status === "cancelled") runs[runs.length - 1].cancelled += 1;
    previous = parsed;
  }
  return runs;
}
