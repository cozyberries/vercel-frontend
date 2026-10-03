"use client";

import { useId, useState } from "react";
import { EmptyState } from "@/components/admin/kit";
import type { StockSizeRow } from "@/lib/admin/stock-metrics";
import { salesLine, stockText } from "@/lib/admin/stock-format";

/** A titled list of sizes: the first `initial` rows, with "Show all N" to expand in place. */
export function StockList({
  title,
  rows,
  now,
  emptyTitle,
  initial = 10,
}: {
  title: string;
  rows: StockSizeRow[];
  now: Date;
  emptyTitle: string;
  initial?: number;
}) {
  const headingId = useId();
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, initial);
  return (
    <section aria-labelledby={headingId} className="min-w-0 rounded-2xl border border-cb-border bg-cb-white p-4">
      <h2 id={headingId} className="text-sm font-semibold text-cb-fg">
        {title}
      </h2>
      {rows.length === 0 ? (
        <div className="mt-3">
          <EmptyState title={emptyTitle} />
        </div>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-cb-border">
            {shown.map((r) => (
              <li key={r.variant_slug} className="py-2.5">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words text-cb-fg">
                    {r.product_name} · <span className="whitespace-nowrap font-medium">{r.size_label}</span>
                  </span>
                  <span className="shrink-0 font-medium text-cb-fg">{stockText(r)}</span>
                </div>
                <p className="mt-0.5 text-xs text-cb-muted-fg">{salesLine(r, now)}</p>
              </li>
            ))}
          </ul>
          {rows.length > initial && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-xs font-medium text-cb-terracotta-deep underline-offset-2 hover:underline"
            >
              {showAll ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
