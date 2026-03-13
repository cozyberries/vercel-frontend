/** Delivery charge in INR when cart has items. Applied at checkout and when creating orders. */
export const DELIVERY_CHARGE_INR = 90;

/** Subtotal threshold (INR) above which delivery is free. */
export const FREE_DELIVERY_THRESHOLD = 1999;

/** GST rate (5%). Database prices now include GST. This constant is kept for reference. */
export const GST_RATE = 0.05;

/** UPI ID for receiving payments. Set NEXT_PUBLIC_UPI_ID in env; fallback for local/dev (empty string treated as missing). */
export const UPI_ID = process.env.NEXT_PUBLIC_UPI_ID || "cozyberriesofficial@okaxis";

/** Phone number registered with UPI. Set NEXT_PUBLIC_UPI_PHONE in env; fallback for local/dev (empty string treated as missing). */
export const UPI_PHONE_NUMBER = process.env.NEXT_PUBLIC_UPI_PHONE ||  "+91 74114 31101";

/** Static QR code image URL for UPI payments. */
export const STATIC_QR_CODE_URL =
  "https://aqvcyyhuqcjnhohaclib.supabase.co/storage/v1/object/public/media/qr-code/1.jpeg";

/** General UPI deep link to open any UPI-compatible payment app (no query params). */
export const UPI_GENERAL_DEEPLINK = "upi://pay";
