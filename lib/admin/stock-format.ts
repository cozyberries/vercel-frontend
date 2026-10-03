import { istParts, MONTHS } from "./sales-range";
import type { StockSizeRow } from "./stock-metrics";

const IST_OFFSET_MS = 330 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

/** "28 Sep" in IST, or "28 Sep 2025" when the year differs from now's IST year. */
export function formatShortDate(iso: string, now: Date): string {
  const d = istParts(new Date(iso));
  const n = istParts(now);
  return d.y === n.y ? `${d.day} ${MONTHS[d.m]}` : `${d.day} ${MONTHS[d.m]} ${d.y}`;
}

/** "10:00", 24-hour IST. */
export function formatIstTime(iso: string): string {
  const ist = new Date(Date.parse(iso) + IST_OFFSET_MS);
  return `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}

/** "sold 3 in 30 days · last sold 28 Sep", or "never sold". */
export function salesLine(row: Pick<StockSizeRow, "sold_30d" | "last_sold_at">, now: Date): string {
  if (row.last_sold_at === null) return "never sold";
  return `sold ${row.sold_30d} in 30 days · last sold ${formatShortDate(row.last_sold_at, now)}`;
}

/** "0 left" / "2 left" for out and low sizes, "14 on hand" for sizes in stock. */
export function stockText(row: Pick<StockSizeRow, "stock" | "state">): string {
  return row.state === "in" ? `${row.stock} on hand` : `${row.stock} left`;
}
