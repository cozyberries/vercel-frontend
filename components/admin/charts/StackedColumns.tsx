"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_COLORS, CHART_INK } from "./chart-colors";

export interface StackedPoint {
  label: string;
  stall: number;
  online: number;
}

const SERIES = [
  { key: "stall", label: "Stall", color: CHART_COLORS.stall },
  { key: "online", label: "Online", color: CHART_COLORS.online },
] as const;

/** Stall + Online stacked per bucket. The 2px surface stroke is the gap between segments. */
export function StackedColumns({
  data,
  format,
  formatAxis,
}: {
  data: StackedPoint[];
  format: (n: number) => string;
  formatAxis: (n: number) => string;
}) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: CHART_INK.grid }}
            tick={{ fontSize: 11, fill: CHART_INK.axis }}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: CHART_INK.axis }}
            tickFormatter={formatAxis}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: CHART_INK.cursor }}
            content={({ active, payload, label }) => (
              <StackTooltip active={active} payload={payload} label={label} format={format} />
            )}
          />
          <Bar dataKey="stall" stackId="channel" fill={CHART_COLORS.stall} stroke={CHART_INK.surface} strokeWidth={2} maxBarSize={28} isAnimationActive={false} />
          <Bar dataKey="online" stackId="channel" fill={CHART_COLORS.online} stroke={CHART_INK.surface} strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StackTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  label?: unknown;
  format: (n: number) => string;
}) {
  const point = payload?.[0]?.payload as StackedPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="min-w-36 rounded-lg border border-cb-border bg-cb-white px-3 py-2 text-xs text-cb-fg shadow-cb-md">
      <p className="font-semibold">{String(label)}</p>
      {SERIES.map((s) => (
        <p key={s.key} className="mt-0.5 flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
          {s.label}
          <span className="ml-auto pl-3 tabular-nums">{format(point[s.key])}</span>
        </p>
      ))}
      <p className="mt-1 flex border-t border-cb-border pt-1">
        Total
        <span className="ml-auto pl-3 tabular-nums">{format(point.stall + point.online)}</span>
      </p>
    </div>
  );
}
