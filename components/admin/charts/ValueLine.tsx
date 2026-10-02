"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_COLORS, CHART_INK } from "./chart-colors";

export interface ValuePoint {
  label: string;
  value: number | null;
}

/** One measure over time. Buckets with no orders have no dot; the line joins the ones that do. */
export function ValueLine({
  data,
  name,
  format,
  formatAxis,
}: {
  data: ValuePoint[];
  name: string;
  format: (n: number | null) => string;
  formatAxis: (n: number) => string;
}) {
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: CHART_INK.grid }}
            tick={{ fontSize: 11, fill: CHART_INK.axis }}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis width={44} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: CHART_INK.axis }} tickFormatter={formatAxis} />
          <Tooltip
            cursor={{ stroke: CHART_INK.grid, strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              const point = payload?.[0]?.payload as ValuePoint | undefined;
              if (!active || !point) return null;
              return (
                <div className="rounded-lg border border-cb-border bg-cb-white px-3 py-2 text-xs text-cb-fg shadow-cb-md">
                  <p className="font-semibold">{String(label)}</p>
                  <p className="mt-0.5">
                    {name}: <span className="tabular-nums">{point.value === null ? "No orders" : format(point.value)}</span>
                  </p>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={CHART_COLORS.neutral}
            strokeWidth={2}
            dot={{ r: 4, fill: CHART_COLORS.neutral, stroke: CHART_INK.surface, strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
