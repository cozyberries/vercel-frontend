import { ageBand, type AgeBand } from "./aging";
import { docTotalPaise } from "./pricing";
import type { BatchBalance, ConsignmentDoc, Retailer, RetailerPayment } from "./types";

export type HoldingBatch = BatchBalance & { band: AgeBand };

/** What a shop holds of one size, across batches (oldest first). */
export interface Holding {
  variantSlug: string;
  productName: string;
  size: string;
  held: number;
  mrpValuePaise: number;
  oldestSentOn: string;
  /** The oldest batch's band. */
  band: AgeBand;
  batches: HoldingBatch[];
}

const byAge = (a: BatchBalance, b: BatchBalance) => a.sent_on.localeCompare(b.sent_on) || a.batch_line_id.localeCompare(b.batch_line_id);

export function holdingsFrom(balances: BatchBalance[], today: string): Holding[] {
  const groups = new Map<string, BatchBalance[]>();
  for (const b of balances) {
    if (b.held <= 0) continue;
    groups.set(b.variant_slug, [...(groups.get(b.variant_slug) ?? []), b]);
  }
  return [...groups.values()]
    .map((list) => {
      const batches = [...list].sort(byAge).map((b) => ({ ...b, band: ageBand(b.sent_on, today) }));
      const first = batches[0];
      return {
        variantSlug: first.variant_slug,
        productName: first.product_name,
        size: first.size,
        held: batches.reduce((s, b) => s + b.held, 0),
        mrpValuePaise: batches.reduce((s, b) => s + b.held * b.mrp_paise, 0),
        oldestSentOn: first.sent_on,
        band: first.band,
        batches,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName) || a.size.localeCompare(b.size));
}

export interface RetailerSummary {
  unitsHeld: number;
  mrpValueHeldPaise: number;
  /** Issued (not cancelled) shop invoices. */
  invoicedPaise: number;
  paidPaise: number;
  owedPaise: number;
  /** Latest month with an issued sales report (including "nothing sold"). */
  lastReportedPeriod: string | null;
  amberBatches: number;
  redBatches: number;
  oldestSentOn: string | null;
}

export function retailerSummary(input: {
  retailer: Retailer;
  balances: BatchBalance[];
  docs: ConsignmentDoc[];
  payments: RetailerPayment[];
  today: string;
}): RetailerSummary {
  const held = input.balances.filter((b) => b.held > 0);
  const bands = held.map((b) => ageBand(b.sent_on, input.today));
  const sales = input.docs.filter((d) => d.kind === "sale" && d.status === "issued");
  const invoicedPaise = sales.reduce((s, d) => s + docTotalPaise(d, input.retailer.our_share_pct), 0);
  const paidPaise = input.payments.reduce((s, p) => s + p.amount_paise, 0);
  const periods = sales.map((d) => d.period).filter((p): p is string => Boolean(p)).sort();
  const sentDates = held.map((b) => b.sent_on).sort();
  return {
    unitsHeld: held.reduce((s, b) => s + b.held, 0),
    mrpValueHeldPaise: held.reduce((s, b) => s + b.held * b.mrp_paise, 0),
    invoicedPaise,
    paidPaise,
    owedPaise: invoicedPaise - paidPaise,
    lastReportedPeriod: periods.length ? periods[periods.length - 1] : null,
    amberBatches: bands.filter((b) => b === "amber").length,
    redBatches: bands.filter((b) => b === "red").length,
    oldestSentOn: sentDates[0] ?? null,
  };
}
