import { HSN_BABY_GARMENTS, SELLER } from "@/lib/config/business";
import { amountInWords } from "@/lib/invoice/amount-in-words";
import type { InvoiceLine, InvoiceTotals, TaxMode } from "@/lib/invoice/gst";
import { gstStateName } from "@/lib/invoice/state-codes";
import { mrpValueOf, piecesOf, priceSaleLines, retailGst } from "./pricing";
import type { ConsignmentDoc, DocStatus, Retailer } from "./types";

export interface Party {
  legalName: string;
  tradeName: string | null;
  gstin: string;
  addressLines: string[];
  stateName: string;
  stateCode: string;
}

export interface RetailInvoiceDocument {
  status: DocStatus;
  number: string | null;
  /** YYYY-MM-DD. */
  date: string;
  period: string;
  seller: Party;
  buyer: Party;
  placeOfSupply: { code: string; name: string };
  mode: TaxMode;
  sharePct: number;
  lines: (InvoiceLine & { mrpPaise: number })[];
  totals: InvoiceTotals;
  totalMrpPaise: number;
  amountInWords: string;
  challanNumbers: string[];
}

export interface ChallanDocument {
  status: DocStatus;
  number: string | null;
  date: string;
  seller: Party;
  consignee: Party;
  lines: { description: string; hsn: string; quantity: number; mrpPaise: number; valuePaise: number }[];
  totalQuantity: number;
  totalMrpPaise: number;
}

function sellerParty(gstin: string): Party {
  const stateCode = gstin.slice(0, 2);
  return {
    legalName: SELLER.legalName,
    tradeName: null,
    gstin,
    addressLines: [...SELLER.addressLines],
    stateName: gstStateName(stateCode) ?? SELLER.stateName,
    stateCode,
  };
}

function shopParty(r: Pick<Retailer, "legal_name" | "trade_name" | "gstin" | "address" | "state_code">): Party {
  return {
    legalName: r.legal_name,
    tradeName: r.trade_name,
    gstin: r.gstin,
    addressLines: r.address.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    stateName: gstStateName(r.state_code) ?? r.state_code,
    stateCode: r.state_code,
  };
}

/**
 * The shop a document is addressed to: the snapshot taken when it was issued,
 * so editing the shop never rewrites an issued invoice or challan. Drafts (no
 * snapshot) preview the shop as it is now.
 */
export function docParty(doc: ConsignmentDoc, retailer: Retailer): Party {
  if (doc.buyer_gstin === null) return shopParty(retailer);
  return shopParty({
    legal_name: doc.buyer_legal_name ?? retailer.legal_name,
    trade_name: doc.buyer_trade_name,
    gstin: doc.buyer_gstin,
    address: doc.buyer_address ?? "",
    state_code: doc.buyer_state_code ?? doc.buyer_gstin.slice(0, 2),
  });
}

/** A B2B tax invoice for one sales report. Draft documents preview at the shop's current share. */
export function buildRetailInvoice({ doc, retailer, gstin, challanNumbers }: { doc: ConsignmentDoc; retailer: Retailer; gstin: string; challanNumbers: string[] }): RetailInvoiceDocument {
  if (doc.kind !== "sale" || !doc.period) throw new Error("Not a sale document");
  const sharePct = Number(doc.share_pct ?? retailer.our_share_pct);
  const priced = priceSaleLines(doc.consignment_lines, sharePct);
  const buyer = docParty(doc, retailer);
  const gst = retailGst(priced, buyer.stateCode, gstin.slice(0, 2));
  return {
    status: doc.status,
    number: doc.number,
    date: doc.doc_date,
    period: doc.period,
    seller: sellerParty(gstin),
    buyer,
    placeOfSupply: { code: buyer.stateCode, name: buyer.stateName },
    mode: gst.mode,
    sharePct,
    lines: gst.lines.map((l, i) => ({ ...l, mrpPaise: priced[i].mrpPaise })),
    totals: gst.totals,
    totalMrpPaise: priced.reduce((s, l) => s + l.mrpPaise * l.quantity, 0),
    amountInWords: amountInWords(gst.totals.totalPaise),
    challanNumbers,
  };
}

/** A delivery challan for stock sent on sale-or-return. Lines merged per product, size and MRP. */
export function buildChallan({ doc, retailer, gstin }: { doc: ConsignmentDoc; retailer: Retailer; gstin: string }): ChallanDocument {
  const merged = new Map<string, ChallanDocument["lines"][number]>();
  for (const l of doc.consignment_lines) {
    const key = `${l.product_name}|${l.size}|${l.mrp_paise}`;
    const m = merged.get(key);
    if (m) {
      m.quantity += l.quantity;
      m.valuePaise += l.quantity * l.mrp_paise;
    } else {
      merged.set(key, { description: `${l.product_name} (${l.size})`, hsn: HSN_BABY_GARMENTS, quantity: l.quantity, mrpPaise: l.mrp_paise, valuePaise: l.quantity * l.mrp_paise });
    }
  }
  return {
    status: doc.status,
    number: doc.number,
    date: doc.doc_date,
    seller: sellerParty(gstin),
    consignee: docParty(doc, retailer),
    lines: [...merged.values()].sort((a, b) => a.description.localeCompare(b.description) || a.mrpPaise - b.mrpPaise),
    totalQuantity: piecesOf(doc),
    totalMrpPaise: mrpValueOf(doc),
  };
}

export function retailPdfFilename(doc: Pick<ConsignmentDoc, "id" | "kind" | "number">): string {
  return doc.number ? `${doc.number.replace(/\//g, "-")}.pdf` : `draft-${doc.kind}-${doc.id.slice(0, 8)}.pdf`;
}
