import { GST_RATE_PERCENT, HSN_BABY_GARMENTS } from "@/lib/config/business";
import { gstStateName } from "@/lib/invoice/state-codes";
import { buildSalesRegister, type RegisterOrderRow } from "../sales-register";
import type { Channel, RegisterInvoice, RegisterLine, SalesRegister, TaxAmounts } from "../register-types";

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

export const GSTIN = "29EPDPR9174E1ZB";
export const NOW = new Date("2026-10-03T04:30:00.000Z"); // 3 Oct 2026, 10:00 IST

/** An invoiced September stall order of ₹1,050 (one item). */
export function orderRow(o: Partial<RegisterOrderRow> = {}): RegisterOrderRow {
  return {
    id: "order-1",
    order_number: "ORD-1",
    created_at: "2026-09-25T06:00:00.000Z",
    status: "collected",
    fulfilment_method: "pickup",
    customer_name: "Asha Rao",
    shipping_address: null,
    place_of_supply: "29",
    invoice_number: "CB/26-27/0001",
    invoice_date: "2026-09-25T06:05:00.000Z",
    invoice_voided_at: null,
    subtotal: 1050,
    discount_amount: 0,
    delivery_charge: 0,
    total_amount: 1050,
    order_items: [{ name: "Frock", size: "3-4Y", color: "pink", price: 1050, quantity: 1 }],
    payments: [{ payment_method: "cash", status: "completed" }],
    ...o,
  };
}

/** September 2026: 0001 stall ₹1,050; 0002 online ₹1,140 (₹90 shipping); 0003 cancelled on 28 Sep. */
export function salesRegisterFixture(): SalesRegister {
  return buildSalesRegister({
    month: "2026-09",
    orders: [
      orderRow(),
      orderRow({
        id: "order-2",
        order_number: "ORD-2",
        invoice_number: "CB/26-27/0002",
        invoice_date: "2026-09-27T06:00:00.000Z",
        status: "delivered",
        fulfilment_method: "delivery",
        customer_name: "Ravi Kumar",
        place_of_supply: "29",
        shipping_address: { full_name: "Ravi Kumar", city: "Bengaluru", state: "Karnataka", postal_code: "560001" },
        delivery_charge: 90,
        total_amount: 1140,
        payments: [{ payment_method: "upi", status: "completed" }],
      }),
      orderRow({
        id: "order-3",
        order_number: "ORD-3",
        invoice_number: "CB/26-27/0003",
        invoice_date: "2026-09-28T05:00:00.000Z",
        status: "cancelled",
        invoice_voided_at: "2026-09-28T10:00:00.000Z",
        customer_name: "Meena Iyer",
      }),
    ],
    cancelledEarlier: [],
    missingNumbers: [],
    gstin: GSTIN,
    now: NOW,
  });
}
