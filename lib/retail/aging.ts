import { addMonths } from "./dates";

export type AgeBand = "ok" | "amber" | "red";

/** Section 31(7) CGST Act: goods sent on sale-or-return must be invoiced six months after removal at the latest. */
export const SALE_OR_RETURN_MONTHS = 6;
export const AGE_WARNING_MONTHS = 5;

export function invoiceDeadline(sentOn: string): string {
  return addMonths(sentOn, SALE_OR_RETURN_MONTHS);
}

/** Both dates YYYY-MM-DD (IST calendar days). */
export function ageBand(sentOn: string, today: string): AgeBand {
  if (today >= invoiceDeadline(sentOn)) return "red";
  if (today >= addMonths(sentOn, AGE_WARNING_MONTHS)) return "amber";
  return "ok";
}
