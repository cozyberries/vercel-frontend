/**
 * The GSTIN is server-only: import this module from route handlers only,
 * never from a "use client" file. It is read lazily and has no fallback, the
 * same rule as getJwtSecret() in lib/jwt-auth.ts.
 */
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function getBusinessGstin(): string {
  const raw = process.env.BUSINESS_GSTIN?.trim();
  if (!raw) {
    throw new Error("BUSINESS_GSTIN is not set");
  }
  const value = raw.toUpperCase();
  if (!GSTIN_PATTERN.test(value)) {
    throw new Error("BUSINESS_GSTIN is not a valid 15-character GSTIN");
  }
  return value;
}

/** GST state code of the registration: the first two GSTIN digits. */
export function getHomeStateCode(): string {
  return getBusinessGstin().slice(0, 2);
}
