"use client";

import { useId, useState } from "react";
import { EmptyState, FilterChips, type FilterChip } from "@/components/admin/kit";
import { STATUS_COLORS } from "@/components/admin/charts/chart-colors";
import { productsWithGaps, type StockProductRow } from "@/lib/admin/stock-metrics";

type GapFilter = "gaps" | "all";

const FILTERS: FilterChip<GapFilter>[] = [
  { value: "gaps", label: "With gaps" },
  { value: "all", label: "All products" },
];

const STATE_WORD = { in: "in stock", low: "low", out: "out" } as const;

/** Each product's sizes as chips: "size · stock", a status edge, and the state in words for screen readers. */
export function SizeGapGrid({ products }: { products: StockProductRow[] }) {
  const headingId = useId();
  const [filter, setFilter] = useState<GapFilter>("gaps");
  const shown = filter === "gaps" ? productsWithGaps(products) : products;
  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-3 rounded-2xl border border-cb-border bg-cb-white p-4">
      <h2 id={headingId} className="text-sm font-semibold text-cb-fg">
        Size gaps
      </h2>
      <FilterChips chips={FILTERS} value={filter} onChange={setFilter} label="Size gaps filter" />
      {shown.length === 0 ? (
        <EmptyState title="No size runs are broken" />
      ) : (
        <ul className="divide-y divide-cb-border">
          {shown.map((p) => (
            <li key={p.slug} className="py-2.5">
              <p className="break-words text-sm text-cb-fg">
                {p.name}
              </p>
              <ul aria-label={`${p.name} sizes`} className="mt-1.5 flex flex-wrap gap-1.5">
                {p.sizes.map((s) => (
                  <li
                    key={s.variant_slug}
                    data-state={s.state}
                    className="rounded-md border border-cb-border bg-cb-white py-0.5 pl-1.5 pr-2 text-xs text-cb-fg"
                    style={{ borderLeftColor: STATUS_COLORS[s.state], borderLeftWidth: 3 }}
                  >
                    {s.size_label} · {s.stock}
                    <span className="sr-only"> ({STATE_WORD[s.state]})</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
