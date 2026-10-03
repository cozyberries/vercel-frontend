import type { TaxMode } from "@/lib/invoice/gst";

export type Channel = "stall" | "online";

/** Integer paise. valuePaise is the invoice value: taxable + tax. */
export interface TaxAmounts {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  valuePaise: number;
}

export interface RegisterLine extends TaxAmounts {
  hsn: string;
  /** Pieces; 0 for the shipping line. */
  quantity: number;
}

export interface RegisterInvoice {
  orderId: string;
  invoiceNumber: string;
  /** ISO instant. */
  invoiceDate: string;
  orderNumber: string;
  channel: Channel;
  customerName: string;
  placeOfSupply: { code: string | null; name: string };
  mode: TaxMode;
  ratePercent: number;
  /** As at the end of the register's month. */
  status: "valid" | "cancelled";
  /** ISO instant of the cancellation; null when valid, or when the date was never recorded. */
  cancelledAt: string | null;
  /** The invoice's own amounts, never zeroed; use effectiveAmounts() for what a row contributes. */
  amounts: TaxAmounts;
  discountPaise: number;
  shippingPaise: number;
  paymentMethod: string | null;
  lines: RegisterLine[];
}

/** GSTR-1 table 7. placeOfSupply is the "29-Karnataka" label. */
export interface B2csRow {
  placeOfSupply: string;
  ratePercent: number;
  monthTaxablePaise: number;
  lessCancelledTaxablePaise: number;
  net: TaxAmounts;
}

/** GSTR-1 table 12 (B2C). */
export interface HsnRow {
  hsn: string;
  description: string;
  uqc: string;
  ratePercent: number;
  quantity: number;
  net: TaxAmounts;
}

/** GSTR-1 table 13: one run of consecutive invoice numbers. */
export interface DocumentRun {
  from: string;
  to: string;
  total: number;
  cancelled: number;
}

export interface ChannelTotal {
  count: number;
  valuePaise: number;
}

export interface RegisterTotals {
  issued: number;
  cancelled: number;
  /** Valid invoices dated in the month. */
  month: TaxAmounts;
  /** Earlier months' invoices cancelled in this month (positive amounts). */
  cancelledEarlier: TaxAmounts;
  /** month − cancelledEarlier: the GSTR-3B 3.1(a) figures. */
  net: TaxAmounts;
  byChannel: Record<Channel, ChannelTotal>;
}

/** One month's sales register. Plain JSON: the API sends it as-is. */
export interface SalesRegister {
  month: string;
  /** dd-mm-yyyy. */
  period: { from: string; to: string; unfinished: boolean };
  generatedAt: string;
  seller: { legalName: string; gstin: string; stateCode: string; stateName: string };
  invoices: RegisterInvoice[];
  cancelledEarlier: RegisterInvoice[];
  b2cs: B2csRow[];
  b2cl: RegisterInvoice[];
  hsn: HsnRow[];
  documents: DocumentRun[];
  totals: RegisterTotals;
  warnings: string[];
}
