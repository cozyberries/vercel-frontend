import { GST_RATE_PERCENT, HSN_BABY_GARMENTS } from "@/lib/config/business";
import { gstStateName } from "@/lib/invoice/state-codes";
import type { Channel, RegisterInvoice, RegisterLine, TaxAmounts } from "../register-types";

/** GST split of a tax-inclusive value, the way computeGst() splits one line. */
export function amountsFor(valuePaise: number, mode: "intra" | "inter"): TaxAmounts {
  const taxablePaise = Math.round((valuePaise * 100) / (100 + GST_RATE_PERCENT));
  const tax = valuePaise - taxablePaise;
  const cgstPaise = mode === "intra" ? Math.floor(tax / 2) : 0;
  return {
    taxablePaise,
    cgstPaise,
    sgstPaise: mode === "intra" ? tax - cgstPaise : 0,
    igstPaise: mode === "inter" ? tax : 0,
    valuePaise,
  };
}

export interface RegisterInvoiceFixture {
  invoiceNumber?: string;
  invoiceDate?: string;
  valuePaise?: number;
  /** "29" (home, intra) by default; any other code is inter-state; null is unknown (inter). */
  posCode?: string | null;
  status?: "valid" | "cancelled";
  cancelledAt?: string | null;
  channel?: Channel;
  quantity?: number;
  shippingPaise?: number;
}

export function registerInvoice(o: RegisterInvoiceFixture = {}): RegisterInvoice {
  const posCode = o.posCode === undefined ? "29" : o.posCode;
  const mode = posCode === "29" ? "intra" : "inter";
  const valuePaise = o.valuePaise ?? 105000;
  const shippingPaise = o.shippingPaise ?? 0;
  const amounts = amountsFor(valuePaise, mode);
  const goods = amountsFor(valuePaise - shippingPaise, mode);
  const lines: RegisterLine[] = [{ hsn: HSN_BABY_GARMENTS, quantity: o.quantity ?? 1, ...goods }];
  if (shippingPaise > 0) {
    lines.push({
      hsn: HSN_BABY_GARMENTS,
      quantity: 0,
      taxablePaise: amounts.taxablePaise - goods.taxablePaise,
      cgstPaise: amounts.cgstPaise - goods.cgstPaise,
      sgstPaise: amounts.sgstPaise - goods.sgstPaise,
      igstPaise: amounts.igstPaise - goods.igstPaise,
      valuePaise: shippingPaise,
    });
  }
  const invoiceNumber = o.invoiceNumber ?? "CB/26-27/0001";
  const status = o.status ?? "valid";
  return {
    orderId: `order-${invoiceNumber}`,
    invoiceNumber,
    invoiceDate: o.invoiceDate ?? "2026-09-25T06:05:00.000Z",
    orderNumber: "ORD-1",
    channel: o.channel ?? "stall",
    customerName: "Asha Rao",
    placeOfSupply: { code: posCode, name: (posCode && gstStateName(posCode)) || "—" },
    mode,
    ratePercent: GST_RATE_PERCENT,
    status,
    cancelledAt: status === "cancelled" ? (o.cancelledAt !== undefined ? o.cancelledAt : "2026-09-28T10:00:00.000Z") : null,
    amounts,
    discountPaise: 0,
    shippingPaise,
    paymentMethod: "Cash",
    lines,
  };
}
