import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Public, unguessable links to an order's bill PDF, sent to customers on
 * WhatsApp (`/bill/<orderId>/<signature>`). The signature is an HMAC of the
 * order id, so a link cannot be edited to reach another order; rotating
 * INVOICE_LINK_SECRET revokes every link at once. Server-only: the secret must
 * never reach the browser, so links are built in route handlers.
 */
const SITE_ORIGIN = "https://cozyberries.in";
const SIGNATURE_LENGTH = 22; // 132 bits of base64url

function getInvoiceLinkSecret(): string {
  const secret = process.env.INVOICE_LINK_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("INVOICE_LINK_SECRET is not set (32+ characters required)");
  }
  return secret;
}

export function signBill(orderId: string): string {
  return createHmac("sha256", getInvoiceLinkSecret())
    .update(`invoice-pdf:v1:${orderId}`)
    .digest("base64url")
    .slice(0, SIGNATURE_LENGTH);
}

export function verifyBillSignature(orderId: string, signature: string): boolean {
  const expected = Buffer.from(signBill(orderId));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function billUrl(orderId: string): string {
  return `${SITE_ORIGIN}/bill/${orderId}/${signBill(orderId)}`;
}
