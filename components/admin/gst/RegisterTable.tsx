"use client";

import { useId } from "react";
import { ChartTable, type ChartColumn } from "@/components/admin/charts/ChartTable";

/** A titled card holding one small table of already-formatted values. */
export function RegisterTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: ChartColumn[];
  rows: Array<Record<string, string>>;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="min-w-0 rounded-2xl border border-cb-border bg-cb-white p-4">
      <h3 id={headingId} className="text-sm font-semibold text-cb-fg">
        {title}
      </h3>
      <div className="mt-2">
        {rows.length ? (
          <ChartTable caption={title} columns={columns} rows={rows} />
        ) : (
          <p className="text-sm text-cb-muted-fg">None this month</p>
        )}
      </div>
    </section>
  );
}
