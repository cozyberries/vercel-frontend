import { CHART_COLORS } from "./chart-colors";

/** One bar split into Stall and Online, both labelled with rupees and a percentage that adds to 100. */
export function ShareBar({ stall, online, format }: { stall: number; online: number; format: (n: number) => string }) {
  const total = stall + online;
  if (total <= 0) return null;
  const stallPct = Math.round((stall / total) * 100);
  const parts = [
    { key: "stall", label: "Stall", value: stall, pct: stallPct, color: CHART_COLORS.stall },
    { key: "online", label: "Online", value: online, pct: 100 - stallPct, color: CHART_COLORS.online },
  ];
  return (
    <section aria-label="Stall vs online sales" className="rounded-2xl border border-cb-border bg-cb-white p-4">
      <div aria-hidden className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.key} data-share-part style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} />
          ))}
      </div>
      <ul className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5 whitespace-nowrap text-cb-fg">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
            {p.label} <span className="font-medium">{format(p.value)}</span> <span className="text-cb-muted-fg">· {p.pct}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
