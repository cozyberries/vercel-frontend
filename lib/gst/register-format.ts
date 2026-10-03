import { istParts } from "@/lib/admin/sales-range";

const pad = (n: number) => String(n).padStart(2, "0");
const IST_OFFSET_MS = 330 * 60 * 1000;
const RUPEES = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₹1,234.50"; "-₹1,234.50" for a negative amount. Adding 0 turns -0 into 0, so a zero never prints as "-₹0.00". */
export function formatPaise(paise: number): string {
  return RUPEES.format(paise / 100 + 0);
}

/** Rupees as a number for a spreadsheet cell. */
export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100 + 0;
}

/** dd-mm-yyyy of the IST calendar day of an instant. */
export function formatIstDate(iso: string): string {
  const { y, m, day } = istParts(new Date(iso));
  return `${pad(day)}-${pad(m + 1)}-${y}`;
}

/** "03-10-2026 14:05 IST". */
export function formatIstDateTime(iso: string): string {
  const ist = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return `${formatIstDate(iso)} ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())} IST`;
}

/** A spreadsheet date: UTC midnight of the IST calendar day, so the cell shows that day in every timezone. */
export function istDateCell(iso: string): Date {
  const { y, m, day } = istParts(new Date(iso));
  return new Date(Date.UTC(y, m, day));
}

/** "29-Karnataka"; "—" when the place of supply is unknown. */
export function placeOfSupplyLabel(pos: { code: string | null; name: string }): string {
  return pos.code ? `${pos.code}-${pos.name}` : "—";
}

/** The Status cell of an invoice cancelled within its month. */
export function cancellationNote(cancelledAt: string | null, valuePaise: number): string {
  const when = cancelledAt ? `Cancelled ${formatIstDate(cancelledAt)}` : "Cancelled, date not recorded";
  return `${when} (was ${formatPaise(valuePaise)})`;
}

/** cozyberries-sales-register-2026-09.xlsx; an unfinished month adds its last day: …-2026-10-upto-03.xlsx. */
export function registerFileName(month: string, period: { to: string; unfinished: boolean }): string {
  const upTo = period.unfinished ? `-upto-${period.to.slice(0, 2)}` : "";
  return `cozyberries-sales-register-${month}${upTo}.xlsx`;
}
