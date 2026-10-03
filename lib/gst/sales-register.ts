import { GST_RATE_PERCENT, SELLER } from "@/lib/config/business";
import { PAID_ORDER_STATUSES } from "@/lib/admin/sales-metrics";
import { buildInvoice, type InvoiceOrderRow } from "@/lib/invoice/build-invoice";
import { gstStateName } from "@/lib/invoice/state-codes";
import { formatPaise } from "./register-format";
import { monthBounds, registerPeriod } from "./register-month";
import { b2csRows, compareInvoiceNumbers, documentRuns, hsnRows, isB2cl, subtractAmounts, sumAmounts } from "./register-summaries";
import type { Channel, ChannelTotal, RegisterInvoice, RegisterLine, SalesRegister } from "./register-types";

/** An invoiced order as the register reads it. Phone and email are never selected. */
export type RegisterOrderRow = Omit<InvoiceOrderRow, "customer_email" | "customer_phone" | "invoice_number" | "invoice_date"> & {
  invoice_number: string;
  invoice_date: string;
  invoice_voided_at: string | null;
};

export interface MissingNumberRow {
  order_number: string;
}

const PAID = new Set<string>(PAID_ORDER_STATUSES);

/** Whether an invoice counts as cancelled as at `end` (the month's exclusive end). */
function cancellationAsAt(row: RegisterOrderRow, end: Date): { cancelled: boolean; at: string | null; undated: boolean } {
  if (row.invoice_voided_at) {
    return { cancelled: new Date(row.invoice_voided_at) < end, at: row.invoice_voided_at, undated: false };
  }
  // Voided before invoice_voided_at existed and never dated: cancelled in its own month.
  if (!PAID.has(row.status)) return { cancelled: true, at: null, undated: true };
  return { cancelled: false, at: null, undated: false };
}

function toRegisterInvoice(row: RegisterOrderRow, gstin: string, cancelled: boolean, cancelledAt: string | null): RegisterInvoice {
  const invoice = buildInvoice({
    order: { ...row, customer_email: null, customer_phone: null },
    gstin,
    homeStateCode: gstin.slice(0, 2),
  });
  // computeGst() lists the goods lines in order_items order, then the shipping line.
  const goodsCount = row.order_items.length;
  const lines: RegisterLine[] = invoice.lines.map((line, i) => ({
    hsn: line.hsn,
    quantity: i < goodsCount ? line.quantity : 0,
    taxablePaise: line.taxablePaise,
    cgstPaise: line.cgstPaise,
    sgstPaise: line.sgstPaise,
    igstPaise: line.igstPaise,
    valuePaise: line.amountPaise,
  }));
  const t = invoice.totals;
  return {
    orderId: row.id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    orderNumber: row.order_number,
    channel: row.fulfilment_method === "pickup" ? "stall" : "online",
    customerName: invoice.buyer.name,
    placeOfSupply: invoice.placeOfSupply,
    mode: invoice.mode,
    ratePercent: GST_RATE_PERCENT,
    status: cancelled ? "cancelled" : "valid",
    cancelledAt: cancelled ? cancelledAt : null,
    amounts: { taxablePaise: t.taxablePaise, cgstPaise: t.cgstPaise, sgstPaise: t.sgstPaise, igstPaise: t.igstPaise, valuePaise: t.totalPaise },
    discountPaise: t.discountPaise,
    shippingPaise: lines.slice(goodsCount).reduce((sum, line) => sum + line.valuePaise, 0),
    paymentMethod: invoice.paymentMethod,
    lines,
  };
}

function checkInvoice(row: RegisterOrderRow, inv: RegisterInvoice, warnings: string[]) {
  if (inv.placeOfSupply.code === null) {
    warnings.push(`Place of supply unknown for ${inv.invoiceNumber}: check the delivery address. It is shown as IGST.`);
  }
  const orderPaise = Math.round(Number(row.total_amount) * 100);
  if (orderPaise !== inv.amounts.valuePaise) {
    warnings.push(`${inv.invoiceNumber} adds up to ${formatPaise(inv.amounts.valuePaise)} but the order total is ${formatPaise(orderPaise)}.`);
  }
}

function channelTotals(valid: RegisterInvoice[]): Record<Channel, ChannelTotal> {
  const totals: Record<Channel, ChannelTotal> = { stall: { count: 0, valuePaise: 0 }, online: { count: 0, valuePaise: 0 } };
  for (const inv of valid) {
    totals[inv.channel].count += 1;
    totals[inv.channel].valuePaise += inv.amounts.valuePaise;
  }
  return totals;
}

const byNumber = (a: RegisterOrderRow, b: RegisterOrderRow) => compareInvoiceNumbers(a.invoice_number, b.invoice_number);

/**
 * One month's GST sales register, as at the month's end (as at now for the
 * current month). `orders` are the invoices dated in the month;
 * `cancelledEarlier` are invoices dated before it and voided in it.
 */
export function buildSalesRegister(input: {
  month: string;
  orders: RegisterOrderRow[];
  cancelledEarlier: RegisterOrderRow[];
  missingNumbers: MissingNumberRow[];
  gstin: string;
  now: Date;
}): SalesRegister {
  const { month, gstin, now } = input;
  const { end } = monthBounds(month);
  const warnings: string[] = [];
  if (input.missingNumbers.length > 0) {
    warnings.push(`Paid orders with no invoice number: ${input.missingNumbers.map((r) => r.order_number).join(", ")}`);
  }

  const invoices = [...input.orders].sort(byNumber).map((row) => {
    const c = cancellationAsAt(row, end);
    const inv = toRegisterInvoice(row, gstin, c.cancelled, c.at);
    checkInvoice(row, inv, warnings);
    if (c.undated) {
      warnings.push(`${inv.invoiceNumber} is cancelled but has no cancellation date; counted as cancelled in its own month.`);
    }
    return inv;
  });
  const cancelledEarlier = [...input.cancelledEarlier]
    .sort(byNumber)
    .map((row) => toRegisterInvoice(row, gstin, true, row.invoice_voided_at));

  const valid = invoices.filter((inv) => inv.status === "valid");
  const monthTotals = sumAmounts(valid.map((inv) => inv.amounts));
  const earlierTotals = sumAmounts(cancelledEarlier.map((inv) => inv.amounts));
  const stateCode = gstin.slice(0, 2);

  return {
    month,
    period: registerPeriod(month, now),
    generatedAt: now.toISOString(),
    seller: { legalName: SELLER.legalName, gstin, stateCode, stateName: gstStateName(stateCode) ?? SELLER.stateName },
    invoices,
    cancelledEarlier,
    b2cs: b2csRows(invoices, cancelledEarlier),
    b2cl: valid.filter(isB2cl),
    hsn: hsnRows(invoices, cancelledEarlier),
    documents: documentRuns(invoices),
    totals: {
      issued: invoices.length,
      cancelled: invoices.length - valid.length,
      month: monthTotals,
      cancelledEarlier: earlierTotals,
      net: subtractAmounts(monthTotals, earlierTotals),
      byChannel: channelTotals(valid),
    },
    warnings,
  };
}
