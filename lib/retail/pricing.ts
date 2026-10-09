import { HSN_BABY_GARMENTS, SELLER } from "@/lib/config/business";
import { computeGst, taxModeFor, type GstComputation } from "@/lib/invoice/gst";
import type { ConsignmentDoc, ConsignmentLine, DiscountRate } from "./types";

/**
 * The shop's price for one piece: our share of the selling price (MRP less any
 * approved discount), GST included, rounded to the paisa once. Worked in whole
 * hundredths so it matches the SQL in consignment_issue exactly.
 */
export function unitPricePaise(mrpPaise: number, sharePct: number, discountPct = 0): number {
  const keep = Math.round((100 - discountPct) * 100);
  const share = Math.round(sharePct * 100);
  return Math.round((mrpPaise * keep * share) / 100_000_000);
}

/** "10", "12.5": a discount rate as people write it. */
export function formatRate(pct: number): string {
  return String(Math.round(pct * 100) / 100);
}

/** The month's approved discount rates, lowest first. */
export function ratesFor(rates: DiscountRate[], period: string): number[] {
  return rates.filter((r) => r.period === period).map((r) => r.rate_pct).sort((a, b) => a - b);
}

export interface PricedSaleLine {
  description: string;
  productName: string;
  size: string;
  quantity: number;
  mrpPaise: number;
  /** The approved discount these pieces sold at (0 = full MRP). */
  discountPct: number;
  unitPricePaise: number;
}

/**
 * Invoice lines for a sale: batch lines with the same product, size, MRP,
 * discount and price are merged, in first-seen order. An issued line's stored
 * price wins over `sharePct` (the draft preview uses the shop's current share).
 */
export function priceSaleLines(lines: ConsignmentLine[], sharePct: number): PricedSaleLine[] {
  const merged = new Map<string, PricedSaleLine>();
  for (const l of lines) {
    const discount = Number(l.discount_pct ?? 0);
    const price = l.unit_price_paise ?? unitPricePaise(l.mrp_paise, sharePct, discount);
    const key = `${l.product_name}|${l.size}|${l.mrp_paise}|${discount}|${price}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += l.quantity;
    } else {
      merged.set(key, {
        description: `${l.product_name} (${l.size})`,
        productName: l.product_name,
        size: l.size,
        quantity: l.quantity,
        mrpPaise: l.mrp_paise,
        discountPct: discount,
        unitPricePaise: price,
      });
    }
  }
  return [...merged.values()];
}

/** GST split of a shop invoice: intra-state when the shop is in the seller's state. */
export function retailGst(lines: PricedSaleLine[], shopStateCode: string, homeStateCode: string = SELLER.stateCode): GstComputation {
  return computeGst({
    lines: lines.map((l) => ({ description: l.description, hsn: HSN_BABY_GARMENTS, quantity: l.quantity, unitPrice: l.unitPricePaise / 100 })),
    discountRupees: 0,
    deliveryChargeRupees: 0,
    mode: taxModeFor(shopStateCode, homeStateCode),
  });
}

/** What a sale document charges the shop (GST included). */
export function docTotalPaise(doc: Pick<ConsignmentDoc, "consignment_lines" | "share_pct">, fallbackSharePct: number): number {
  const share = doc.share_pct ?? fallbackSharePct;
  return doc.consignment_lines.reduce(
    (sum, l) => sum + (l.unit_price_paise ?? unitPricePaise(l.mrp_paise, share, Number(l.discount_pct ?? 0))) * l.quantity,
    0,
  );
}

export function piecesOf(doc: Pick<ConsignmentDoc, "consignment_lines">): number {
  return doc.consignment_lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function mrpValueOf(doc: Pick<ConsignmentDoc, "consignment_lines">): number {
  return doc.consignment_lines.reduce((sum, l) => sum + l.mrp_paise * l.quantity, 0);
}
