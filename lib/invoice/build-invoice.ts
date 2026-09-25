import { HSN_BABY_GARMENTS, SELLER, STALL } from "@/lib/config/business";
import { amountInWords } from "./amount-in-words";
import { computeGst, taxModeFor, type InvoiceLine, type InvoiceTotals, type TaxMode } from "./gst";
import { gstStateName } from "./state-codes";

/** The orders row (with embedded items and payments) that the invoice route selects. */
export interface InvoiceOrderRow {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  fulfilment_method: "delivery" | "pickup";
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: {
    full_name?: string | null;
    address_line_1?: string | null;
    area?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
  place_of_supply: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  subtotal: number;
  discount_amount: number | null;
  delivery_charge: number | null;
  total_amount: number;
  order_items: { name: string; size: string | null; color: string | null; price: number; quantity: number }[];
  payments: { payment_method: string; status: string }[];
}

export interface InvoiceDocument {
  /**
   * pending: not paid yet, an order summary only. issued: a tax invoice.
   * receipt: paid before invoice numbers existed. cancelled: cancelled or
   * refunded (the invoice number, if any, is kept).
   */
  status: "pending" | "issued" | "receipt" | "cancelled";
  invoiceNumber: string | null;
  invoiceDate: string | null;
  orderNumber: string;
  orderDate: string;
  seller: { legalName: string; tradeName: string; gstin: string; addressLines: string[]; stateName: string; stateCode: string };
  buyer: { name: string; phone: string | null; email: string | null };
  shipTo: { kind: "pickup"; label: string } | { kind: "delivery"; lines: string[] };
  placeOfSupply: { code: string | null; name: string };
  mode: TaxMode;
  lines: InvoiceLine[];
  totals: InvoiceTotals;
  amountInWords: string;
  paymentMethod: string | null;
}

const PAYMENT_LABEL: Record<string, string> = { upi: "UPI", cash: "Cash" };
const UNPAID = ["payment_pending", "verifying_payment"];
const VOIDED = ["cancelled", "refunded"];

export function buildInvoice(input: {
  order: InvoiceOrderRow;
  gstin: string;
  homeStateCode: string;
}): InvoiceDocument {
  const { order, gstin, homeStateCode } = input;
  const address = order.shipping_address;

  const mode = taxModeFor(order.place_of_supply, homeStateCode);
  const gst = computeGst({
    lines: order.order_items.map((item) => ({
      description: [item.name, item.size ? `Size ${item.size}` : null, item.color].filter(Boolean).join(" · "),
      hsn: HSN_BABY_GARMENTS,
      quantity: item.quantity,
      unitPrice: Number(item.price),
    })),
    discountRupees: Number(order.discount_amount ?? 0),
    deliveryChargeRupees: order.fulfilment_method === "pickup" ? 0 : Number(order.delivery_charge ?? 0),
    mode,
  });

  const completed = order.payments.find((p) => p.status === "completed");

  return {
    status: VOIDED.includes(order.status) ? "cancelled"
      : UNPAID.includes(order.status) ? "pending"
      : order.invoice_number ? "issued" : "receipt",
    invoiceNumber: order.invoice_number,
    invoiceDate: order.invoice_date,
    orderNumber: order.order_number,
    orderDate: order.created_at,
    seller: {
      legalName: SELLER.legalName,
      tradeName: SELLER.tradeName,
      gstin,
      addressLines: [...SELLER.addressLines],
      stateName: SELLER.stateName,
      stateCode: SELLER.stateCode,
    },
    buyer: {
      name: order.customer_name ?? address?.full_name ?? "Customer",
      phone: order.customer_phone,
      email: order.customer_email,
    },
    shipTo:
      order.fulfilment_method === "pickup" || !address
        ? { kind: "pickup", label: `Self-pickup at ${STALL.name}` }
        : {
            kind: "delivery",
            lines: [
              address.full_name,
              [address.address_line_1, address.area].filter(Boolean).join(", "),
              `${[address.city, address.state].filter(Boolean).join(", ")} ${address.postal_code ?? ""}`.trim(),
              address.country,
            ].filter((l): l is string => Boolean(l && l.trim())),
          },
    placeOfSupply: {
      code: order.place_of_supply,
      name: (order.place_of_supply && gstStateName(order.place_of_supply)) || address?.state?.trim() || "—",
    },
    mode,
    lines: gst.lines,
    totals: gst.totals,
    amountInWords: amountInWords(gst.totals.totalPaise),
    paymentMethod: completed ? PAYMENT_LABEL[completed.payment_method] ?? completed.payment_method : null,
  };
}
