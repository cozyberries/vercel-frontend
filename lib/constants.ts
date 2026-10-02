/** Delivery charge in INR when cart has items. Applied at checkout and when creating orders. */
export const DELIVERY_CHARGE_INR = 90;

/** Subtotal threshold (INR) above which delivery is free. */
export const FREE_DELIVERY_THRESHOLD = 1999;

/** GST rate (5%). Database prices now include GST. This constant is kept for reference. */
export const GST_RATE = 0.05;

/**
 * UPI ID shown to customers: the IDFC FIRST Bank current account. The QR and app links come from
 * the server (`UPI_ID` env, `lib/payments/upi.ts`); keep the two pointing at the same account.
 */
export const UPI_ID = process.env.NEXT_PUBLIC_UPI_ID?.trim() || "cozyberries@idfcbank";

/** General UPI deep link to open any UPI-compatible payment app (no query params). */
export const UPI_GENERAL_DEEPLINK = "upi://pay";
