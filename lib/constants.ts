/** Delivery charge in INR when cart has items. Applied at checkout and when creating orders. */
export const DELIVERY_CHARGE_INR = 100;

/** Subtotal threshold (INR) above which delivery is free. */
export const FREE_DELIVERY_THRESHOLD = 2999;

/** GST rate (5%). Used in cart summary and can be aligned with checkout. */
export const GST_RATE = 0.05;

/** Human-readable GST percentage label derived from GST_RATE. */
export const GST_PERCENT_LABEL = `GST (${(GST_RATE * 100).toFixed(0)}%)`;

/** UPI ID for receiving payments. Set NEXT_PUBLIC_UPI_ID in env; fallback for local/dev. */
export const UPI_ID = process.env.NEXT_PUBLIC_UPI_ID ?? "aaminarummana-1@okaxis";

/** Phone number registered with UPI. Set NEXT_PUBLIC_UPI_PHONE in env; fallback for local/dev. */
export const UPI_PHONE_NUMBER = process.env.NEXT_PUBLIC_UPI_PHONE ?? "7305500796";

/** Static QR code image URL for UPI payments. */
export const STATIC_QR_CODE_URL =
  "https://res.cloudinary.com/dxokykvty/image/upload/v1772334267/1_p7t8a2_1b4b84.jpg";

/** General UPI deep link to open any UPI-compatible payment app (no query params). */
export const UPI_GENERAL_DEEPLINK = "upi://pay";
