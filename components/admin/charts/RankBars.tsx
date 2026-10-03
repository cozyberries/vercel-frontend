import { CHART_COLORS } from "./chart-colors";

export interface RankRow {
  key: string;
  name: string;
  value: number;
  units: number;
  /** Printed instead of "value · N units", e.g. "248 units · ₹1,23,400". */
  detail?: string;
}

/** Ranked horizontal bars in plain HTML: every row prints its value and units, so no table toggle is needed. */
export function RankBars({ rows, format }: { rows: RankRow[]; format: (n: number) => string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <ol className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-cb-fg" title={r.name}>
              {r.name}
            </span>
            <span className="shrink-0 text-xs text-cb-muted-fg">
              {r.detail ?? (
                <>
                  <span className="font-medium text-cb-fg">{format(r.value)}</span> · {r.units} {r.units === 1 ? "unit" : "units"}
                </>
              )}
            </span>
          </div>
          <div aria-hidden className="mt-1 h-2 rounded-full bg-cb-linen">
            <div
              data-bar
              className="h-2 rounded-full"
              style={{ width: `${max > 0 ? Math.max(2, (r.value / max) * 100) : 0}%`, backgroundColor: CHART_COLORS.neutral }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
