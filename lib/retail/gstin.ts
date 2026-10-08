import { gstStateName } from "@/lib/invoice/state-codes";

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** The GSTIN check character (15th) for its first 14 characters. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export type GstinResult =
  | { ok: true; gstin: string; stateCode: string; stateName: string }
  | { ok: false; error: string };

/** Format, state code and check character. Spaces are dropped and letters upper-cased. */
export function validateGstin(raw: unknown): GstinResult {
  const gstin = typeof raw === "string" ? raw.replace(/\s+/g, "").toUpperCase() : "";
  if (!gstin) return { ok: false, error: "Enter the shop's GSTIN" };
  if (!PATTERN.test(gstin)) return { ok: false, error: "A GSTIN has 15 characters, like 29ABCDE1234F1ZW" };
  const stateCode = gstin.slice(0, 2);
  const stateName = gstStateName(stateCode);
  if (!stateName) return { ok: false, error: `${stateCode} is not a GST state code` };
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) {
    return { ok: false, error: "This GSTIN's last character doesn't match: check for a typo" };
  }
  return { ok: true, gstin, stateCode, stateName };
}
