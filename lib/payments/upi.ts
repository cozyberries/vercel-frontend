/**
 * UPI payment links and QR payloads (server-only: reads the UPI_* env vars).
 *
 * With a merchant block the link carries the same fields as the bank-issued
 * merchant QR (IDFC FIRST Bank, cozyberries@idfcbank), so UPI apps treat it as
 * a payment to a registered merchant rather than person-to-person. The amount
 * and order reference are appended, which locks the amount the customer pays.
 */

type Env = Record<string, string | undefined>;

export interface UpiMerchant {
  /** `mc`: merchant category code (5641 = children's and infants' wear). */
  code: string;
  /** `mid` */
  merchantId: string;
  /** `mtid` */
  terminalId: string;
  /** `orgid` */
  orgId: string;
}

export interface UpiPayee {
  /** `pa` */
  upiId: string;
  /** `pn` */
  payeeName: string;
  merchant: UpiMerchant | null;
}

export interface UpiLinks {
  general: string;
  phonepe: string;
  gpay: string;
  paytm: string;
}

const UPI_ID_PATTERN = /^[\w.-]+@[\w.-]+$/;
/** NPCI allows up to 35 characters in `tr`; letters and digits are safe in every app. */
const MAX_REFERENCE_LENGTH = 35;

/** `vercel env pull` writes values with a trailing newline; never let it reach a UPI link. */
const read = (env: Env, key: string) => env[key]?.trim() ?? "";

export function readUpiPayee(env: Env = process.env): UpiPayee | null {
  const upiId = read(env, "UPI_ID");
  const payeeName = read(env, "UPI_PAYEE_NAME");
  if (!UPI_ID_PATTERN.test(upiId) || !payeeName) return null;

  const code = read(env, "UPI_MERCHANT_CODE");
  return {
    upiId,
    payeeName,
    merchant: code
      ? {
          code,
          merchantId: read(env, "UPI_MERCHANT_ID"),
          terminalId: read(env, "UPI_TERMINAL_ID"),
          orgId: read(env, "UPI_ORG_ID"),
        }
      : null,
  };
}

export function buildUpiPayUrl(
  payee: UpiPayee,
  payment: { amount: number; reference: string; note: string }
): string {
  const { merchant } = payee;
  const reference = payment.reference.replace(/[^A-Za-z0-9]/g, "").slice(0, MAX_REFERENCE_LENGTH);
  // pa (payee address) must NOT have @ encoded — UPI apps reject %40
  const params = [
    merchant && "ver=01",
    merchant && "mode=01",
    merchant?.orgId && `orgid=${encodeURIComponent(merchant.orgId)}`,
    `pa=${payee.upiId}`,
    `pn=${encodeURIComponent(payee.payeeName)}`,
    merchant && `mc=${encodeURIComponent(merchant.code)}`,
    merchant?.merchantId && `mid=${encodeURIComponent(merchant.merchantId)}`,
    merchant?.terminalId && `mtid=${encodeURIComponent(merchant.terminalId)}`,
    merchant && "qrMedium=04",
    `tr=${reference}`,
    `am=${Math.round(payment.amount).toFixed(2)}`,
    "cu=INR",
    `tn=${encodeURIComponent(payment.note)}`,
  ];
  return `upi://pay?${params.filter(Boolean).join("&")}`;
}

export function upiAppLinks(upiUrl: string): UpiLinks {
  const query = upiUrl.slice(upiUrl.indexOf("?"));
  return {
    general: upiUrl,
    phonepe: `phonepe://pay${query}`,
    gpay: `tez://upi/pay${query}`,
    paytm: `paytmmp://pay${query}`,
  };
}
