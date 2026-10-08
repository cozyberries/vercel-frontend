/** Retail consignment rows as PostgREST returns them. Money is integer paise. */
export type DocKind = "challan" | "sale" | "return";
export type DocStatus = "draft" | "issued" | "cancelled";
export type PaymentMethod = "upi" | "bank" | "cash";

export interface Retailer {
  id: string;
  legal_name: string;
  trade_name: string | null;
  gstin: string;
  state_code: string;
  address: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  our_share_pct: number;
  active: boolean;
  created_at: string;
}

export interface ConsignmentLine {
  id: string;
  doc_id: string;
  variant_slug: string;
  product_name: string;
  size: string;
  quantity: number;
  mrp_paise: number;
  /** The issued challan line (batch) a sale or return line draws on. */
  batch_line_id: string | null;
  /** Sale lines, set when the sale is issued. */
  unit_price_paise: number | null;
}

export interface ConsignmentDoc {
  id: string;
  retailer_id: string;
  kind: DocKind;
  status: DocStatus;
  number: string | null;
  /** YYYY-MM-DD. */
  doc_date: string;
  /** YYYY-MM, sales only. */
  period: string | null;
  share_pct: number | null;
  note: string | null;
  created_at: string;
  issued_at: string | null;
  cancelled_at: string | null;
  consignment_lines: ConsignmentLine[];
}

/** One row of public.retailer_batch_balances: an issued challan line and what the shop still holds of it. */
export interface BatchBalance {
  batch_line_id: string;
  retailer_id: string;
  variant_slug: string;
  product_name: string;
  size: string;
  mrp_paise: number;
  sent_on: string;
  challan_number: string;
  sent: number;
  held: number;
}

export interface RetailerPayment {
  id: string;
  retailer_id: string;
  doc_id: string | null;
  amount_paise: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  created_at: string;
}

/** One problem in an uploaded sales sheet. `row` is the spreadsheet row number. */
export interface RowError {
  row: number;
  code: string;
  message: string;
}
