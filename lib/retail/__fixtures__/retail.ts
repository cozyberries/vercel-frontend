import type { BatchBalance, ConsignmentDoc, ConsignmentLine, Retailer, RetailerPayment } from "../types";

export const SHOP_GSTIN = "29AAGFC4321M1ZB"; // Karnataka, valid checksum
export const TN_GSTIN = "33AAACR5055K1ZE"; // Tamil Nadu, valid checksum

export function retailer(o: Partial<Retailer> = {}): Retailer {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    legal_name: "Kids Corner LLP",
    trade_name: "Kids Corner",
    gstin: SHOP_GSTIN,
    state_code: "29",
    address: "12 MG Road\nBengaluru 560001",
    contact_name: "Ravi",
    phone: "9876543210",
    email: "ravi@kidscorner.in",
    our_share_pct: 75,
    active: true,
    created_at: "2026-10-01T05:00:00.000Z",
    ...o,
  };
}

export function line(o: Partial<ConsignmentLine> = {}): ConsignmentLine {
  return {
    id: "line-1",
    doc_id: "doc-1",
    variant_slug: "petal-frock-1-2y",
    product_name: "Petal Pops Frock",
    size: "1-2Y",
    quantity: 1,
    mrp_paise: 100000,
    batch_line_id: null,
    unit_price_paise: null,
    ...o,
  };
}

export function doc(o: Partial<ConsignmentDoc> = {}): ConsignmentDoc {
  return {
    id: "doc-1",
    retailer_id: retailer().id,
    kind: "sale",
    status: "issued",
    number: "CBR/26-27/0001",
    doc_date: "2026-10-31",
    period: "2026-10",
    share_pct: 75,
    note: null,
    created_at: "2026-11-02T05:00:00.000Z",
    issued_at: "2026-11-02T05:05:00.000Z",
    cancelled_at: null,
    consignment_lines: [line({ batch_line_id: "batch-1", unit_price_paise: 75000 })],
    ...o,
  };
}

export function balance(o: Partial<BatchBalance> = {}): BatchBalance {
  return {
    batch_line_id: "batch-1",
    retailer_id: retailer().id,
    variant_slug: "petal-frock-1-2y",
    product_name: "Petal Pops Frock",
    size: "1-2Y",
    mrp_paise: 100000,
    sent_on: "2026-10-01",
    challan_number: "CBC/26-27/0001",
    sent: 5,
    held: 3,
    ...o,
  };
}

export function payment(o: Partial<RetailerPayment> = {}): RetailerPayment {
  return {
    id: "pay-1",
    retailer_id: retailer().id,
    doc_id: "doc-1",
    amount_paise: 50000,
    paid_on: "2026-11-05",
    method: "upi",
    reference: "UTR123",
    created_at: "2026-11-05T05:00:00.000Z",
    ...o,
  };
}
