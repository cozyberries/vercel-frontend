"use client";

import { useId, useState, type ReactNode } from "react";
import { ChartTable, type ChartColumn } from "./ChartTable";

export interface LegendItem {
  label: string;
  color: string;
}

export function ChartCard({
  title,
  legend,
  footnote,
  table,
  children,
}: {
  title: string;
  legend?: LegendItem[];
  footnote?: string;
  table?: { columns: ChartColumn[]; rows: Array<Record<string, string>> };
  children: ReactNode;
}) {
  const headingId = useId();
  const [showTable, setShowTable] = useState(false);
  return (
    <section aria-labelledby={headingId} className="min-w-0 rounded-2xl border border-cb-border bg-cb-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={headingId} className="text-sm font-semibold text-cb-fg">
          {title}
        </h3>
        {legend && legend.length > 1 && (
          <ul aria-label="Legend" className="flex gap-3 text-xs text-cb-muted-fg">
            {legend.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
                {l.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3">{showTable && table ? <ChartTable caption={title} {...table} /> : children}</div>
      {footnote && <p className="mt-2 text-xs text-cb-muted-fg">{footnote}</p>}
      {table && (
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="mt-2 text-xs font-medium text-cb-terracotta-deep underline-offset-2 hover:underline"
        >
          {showTable ? "View as chart" : "View as table"}
        </button>
      )}
    </section>
  );
}
