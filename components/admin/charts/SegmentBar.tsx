export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  /** Printed in the legend instead of the raw value, e.g. "₹15,200". */
  valueLabel?: string;
}

/** Largest-remainder rounding, so the shown percentages always add up to 100. */
export function segmentPercents(values: number[]): number[] {
  const clean = values.map((v) => Math.max(0, v));
  const total = clean.reduce((s, v) => s + v, 0);
  if (total <= 0) return clean.map(() => 0);
  const raw = clean.map((v) => (v / total) * 100);
  const pcts = raw.map(Math.floor);
  let left = 100 - pcts.reduce((s, v) => s + v, 0);
  const byRemainder = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    pcts[i] += 1;
    left -= 1;
  }
  return pcts;
}

/** One bar split into labelled parts; every part prints its label, value and percentage. */
export function SegmentBar({ label, parts }: { label: string; parts: Segment[] }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (total <= 0) return null;
  const pcts = segmentPercents(parts.map((p) => p.value));
  return (
    <section aria-label={label} className="min-w-0 rounded-2xl border border-cb-border bg-cb-white p-4">
      <div aria-hidden className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.key} data-share-part style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} />
          ))}
      </div>
      <ul className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs">
        {parts.map((p, i) => (
          <li key={p.key} className="flex items-center gap-1.5 whitespace-nowrap text-cb-fg">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
            {p.label} <span className="font-medium">{p.valueLabel ?? p.value}</span>{" "}
            <span className="text-cb-muted-fg">· {pcts[i]}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
