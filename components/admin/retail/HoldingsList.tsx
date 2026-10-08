"use client";

import { EmptyState, ListCard } from "@/components/admin/kit";
import { formatPaise } from "@/lib/gst/register-format";
import { invoiceDeadline } from "@/lib/retail/aging";
import { formatDay } from "@/lib/retail/dates";
import type { Holding } from "@/lib/retail/holdings";

const BAND_CLASS = { ok: "text-cb-muted-fg", amber: "text-amber-800", red: "font-semibold text-red-700" } as const;

export function HoldingsList({ holdings }: { holdings: Holding[] }) {
  if (holdings.length === 0) return <EmptyState title="The shop holds no stock" hint="Use Send stock to give it pieces on sale-or-return." />;
  return (
    <ul className="space-y-2">
      {holdings.map((h) => (
        <ListCard key={h.variantSlug} testId="retail-holding" title={`${h.productName} (${h.size})`} meta={`${h.held} held · ${formatPaise(h.mrpValuePaise)} at MRP`}>
          <ul className="mt-1 space-y-1 text-sm">
            {h.batches.map((b) => (
              <li key={b.batch_line_id}>
                <span className="text-cb-fg">{b.held} of {b.sent} · MRP {formatPaise(b.mrp_paise)} · sent {formatDay(b.sent_on)} ({b.challan_number})</span>
                {b.band !== "ok" && <span className={`block ${BAND_CLASS[b.band]}`}>Invoice or take back by {formatDay(invoiceDeadline(b.sent_on))}</span>}
              </li>
            ))}
          </ul>
        </ListCard>
      ))}
    </ul>
  );
}
