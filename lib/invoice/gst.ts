import { GST_RATE_PERCENT, HSN_BABY_GARMENTS } from "@/lib/config/business";

export type TaxMode = "intra" | "inter";

export interface InvoiceLineInput {
  description: string;
  hsn: string;
  quantity: number;
  /** Tax-inclusive unit price in rupees. */
  unitPrice: number;
}

/** Every amount is integer paise. */
export interface InvoiceLine {
  description: string;
  hsn: string;
  quantity: number;
  unitPricePaise: number;
  /** Tax-inclusive amount after this line's share of the discount. */
  amountPaise: number;
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface InvoiceTotals {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  discountPaise: number;
  totalPaise: number;
}

export interface GstComputation {
  mode: TaxMode;
  lines: InvoiceLine[];
  totals: InvoiceTotals;
}

/** Intra-state only when the place of supply is the registration's state. */
export function taxModeFor(placeOfSupply: string | null | undefined, homeStateCode: string): TaxMode {
  return placeOfSupply && placeOfSupply === homeStateCode ? "intra" : "inter";
}

const toPaise = (rupees: number) => Math.round(rupees * 100);

function splitLine(
  description: string,
  hsn: string,
  quantity: number,
  unitPricePaise: number,
  amountPaise: number,
  discountPaise: number,
  mode: TaxMode
): InvoiceLine {
  const taxablePaise = Math.round((amountPaise * 100) / (100 + GST_RATE_PERCENT));
  const tax = amountPaise - taxablePaise;
  const cgstPaise = mode === "intra" ? Math.floor(tax / 2) : 0;
  const sgstPaise = mode === "intra" ? tax - cgstPaise : 0;
  const igstPaise = mode === "inter" ? tax : 0;
  return { description, hsn, quantity, unitPricePaise, amountPaise, discountPaise, taxablePaise, cgstPaise, sgstPaise, igstPaise };
}

/**
 * Splits GST out of tax-inclusive prices in integer paise, so the lines always
 * add up exactly to the order total.
 * - The order-level discount is spread over the goods lines by value (GST is
 *   charged on the discounted price); leftover paise land on the last line.
 * - A delivery charge becomes a "Shipping charges" line at the same rate:
 *   shipping bundled with goods is a composite supply taxed like the goods.
 */
export function computeGst(input: {
  lines: InvoiceLineInput[];
  discountRupees: number;
  deliveryChargeRupees: number;
  mode: TaxMode;
}): GstComputation {
  const goods = input.lines.map((l) => ({ ...l, grossPaise: toPaise(l.unitPrice) * l.quantity }));
  const goodsTotal = goods.reduce((sum, l) => sum + l.grossPaise, 0);
  const discount = Math.min(Math.max(0, toPaise(input.discountRupees)), goodsTotal);

  let allocated = 0;
  const lines = goods.map((l, index) => {
    const share =
      index === goods.length - 1
        ? discount - allocated
        : Math.floor((discount * l.grossPaise) / goodsTotal);
    allocated += share;
    return splitLine(l.description, l.hsn, l.quantity, toPaise(l.unitPrice), l.grossPaise - share, share, input.mode);
  });

  const deliveryPaise = toPaise(input.deliveryChargeRupees);
  if (deliveryPaise > 0) {
    lines.push(splitLine("Shipping charges", HSN_BABY_GARMENTS, 1, deliveryPaise, deliveryPaise, 0, input.mode));
  }

  const totals = lines.reduce<InvoiceTotals>(
    (t, l) => ({
      taxablePaise: t.taxablePaise + l.taxablePaise,
      cgstPaise: t.cgstPaise + l.cgstPaise,
      sgstPaise: t.sgstPaise + l.sgstPaise,
      igstPaise: t.igstPaise + l.igstPaise,
      discountPaise: t.discountPaise + l.discountPaise,
      totalPaise: t.totalPaise + l.amountPaise,
    }),
    { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, discountPaise: 0, totalPaise: 0 }
  );

  return { mode: input.mode, lines, totals };
}
