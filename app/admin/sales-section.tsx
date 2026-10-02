"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  EmptyState,
  ErrorBanner,
  FilterChips,
  LoadingList,
  StatGrid,
  StatTile,
  type FilterChip,
} from "@/components/admin/kit";
import {
  CHART_COLORS,
  ChartCard,
  RankBars,
  ShareBar,
  StackedColumns,
  ValueLine,
  type ChartColumn,
  type StackedPoint,
} from "@/components/admin/charts";
import {
  DEFAULT_SALES_RANGE,
  parseSalesRange,
  SALES_RANGE_COPY,
  SALES_RANGES,
  type SalesRange,
} from "@/lib/admin/sales-range";
import type { SalesMetrics } from "@/lib/admin/sales-metrics";
import {
  emptyTitle,
  formatCount,
  formatItemsPerOrder,
  formatRupees,
  formatRupeesCompact,
  kpiHint,
} from "@/lib/admin/sales-format";

const RANGE_CHIPS: FilterChip<SalesRange>[] = SALES_RANGES.map((value) => ({ value, label: SALES_RANGE_COPY[value].chip }));
const LEGEND = [
  { label: "Stall", color: CHART_COLORS.stall },
  { label: "Online", color: CHART_COLORS.online },
];
const LINE_FOOTNOTE = "Line value before order discounts and delivery, so these won't add up to Sales.";
const PERIOD_LABEL = { day: "Day", week: "Week of", month: "Month" } as const;

/** Seeds from ?range= so a refresh or a shared link keeps the period. Read in an effect: no useSearchParams. */
export function rangeFromLocation(): SalesRange {
  if (typeof window === "undefined") return DEFAULT_SALES_RANGE;
  return parseSalesRange(new URLSearchParams(window.location.search).get("range")) ?? DEFAULT_SALES_RANGE;
}

function writeRangeToLocation(range: SalesRange) {
  const url = new URL(window.location.href);
  url.searchParams.set("range", range);
  window.history.replaceState(window.history.state, "", url);
}

async function fetchSales(range: SalesRange): Promise<SalesMetrics> {
  const res = await fetch(`/api/admin/dashboard/sales?range=${range}`, { credentials: "same-origin", cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || "Couldn't load sales"), { status: res.status });
  return body.metrics as SalesMetrics;
}

export default function SalesSection() {
  const [range, setRange] = useState<SalesRange>(DEFAULT_SALES_RANGE);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    setRange(rangeFromLocation());
    setSeeded(true);
  }, []);

  const query = useQuery({
    queryKey: ["admin", "dashboard", "sales", range],
    queryFn: () => fetchSales(range),
    enabled: seeded,
    staleTime: 60_000,
    // The app's QueryProvider turns focus refetch off by default; trends should refresh when the tab comes back.
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });
  const status = (query.error as { status?: number } | null)?.status;

  const choose = (next: SalesRange) => {
    setRange(next);
    writeRangeToLocation(next);
  };

  return (
    <section aria-labelledby="sales-heading" className="mt-6 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 id="sales-heading" className="text-base font-semibold text-cb-fg">
          Sales
        </h2>
        {query.isFetching && query.isPlaceholderData && (
          <span role="status" className="text-xs text-cb-muted-fg">
            Updating…
          </span>
        )}
      </div>
      <FilterChips chips={RANGE_CHIPS} value={range} onChange={choose} label="Sales period" />
      {query.isError ? (
        // No body on error: the old range's numbers must not sit under the new chip.
        <ErrorBanner
          message={(query.error as Error).message}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          loginRedirect={status === 401 || status === 403 ? "/admin" : undefined}
        />
      ) : query.data ? (
        <SalesBody metrics={query.data} />
      ) : (
        <LoadingList rows={3} label="Loading sales" />
      )}
    </section>
  );
}

function SalesBody({ metrics: m }: { metrics: SalesMetrics }) {
  const k = m.kpis;
  return (
    <div className="space-y-3">
      <StatGrid>
        <StatTile label="Sales" value={formatRupees(k.sales.value)} hint={kpiHint(m, k.sales)} />
        <StatTile label="Orders" value={formatCount(k.orders.value)} hint={kpiHint(m, k.orders)} />
        <StatTile label="Avg order" value={formatRupees(k.aov.value)} hint={kpiHint(m, k.aov)} />
        <StatTile label="Items per order" value={formatItemsPerOrder(k.items_per_order.value)} hint={kpiHint(m, k.items_per_order)} />
      </StatGrid>
      {k.orders.value === 0 ? <EmptyState title={emptyTitle(m.range)} /> : <SalesCharts metrics={m} />}
    </div>
  );
}

function stackTable(period: string, rows: StackedPoint[], format: (n: number) => string) {
  const columns: ChartColumn[] = [
    { key: "label", label: period },
    { key: "stall", label: "Stall", numeric: true },
    { key: "online", label: "Online", numeric: true },
    { key: "total", label: "Total", numeric: true },
  ];
  return {
    columns,
    rows: rows.map((r) => ({ label: r.label, stall: format(r.stall), online: format(r.online), total: format(r.stall + r.online) })),
  };
}

function SalesCharts({ metrics: m }: { metrics: SalesMetrics }) {
  const period = PERIOD_LABEL[m.bucket];
  const salesData = m.series.map((s) => ({ label: s.label, stall: s.stall_sales, online: s.online_sales }));
  const ordersData = m.series.map((s) => ({ label: s.label, stall: s.stall_orders, online: s.online_orders }));
  const aovData = m.series.map((s) => ({ label: s.label, value: s.aov }));
  return (
    <>
      <ShareBar stall={m.channel.stall.sales} online={m.channel.online.sales} format={formatRupees} />
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <ChartCard title="Sales over time" legend={LEGEND} table={stackTable(period, salesData, formatRupees)}>
          <StackedColumns data={salesData} format={formatRupees} formatAxis={formatRupeesCompact} />
        </ChartCard>
        <ChartCard title="Orders over time" legend={LEGEND} table={stackTable(period, ordersData, formatCount)}>
          <StackedColumns data={ordersData} format={formatCount} formatAxis={formatCount} />
        </ChartCard>
        <ChartCard
          title="Average order value"
          table={{
            columns: [
              { key: "label", label: period },
              { key: "value", label: "Avg order", numeric: true },
            ],
            rows: aovData.map((r) => ({ label: r.label, value: formatRupees(r.value) })),
          }}
        >
          <ValueLine data={aovData} name="Avg order" format={formatRupees} formatAxis={formatRupeesCompact} />
        </ChartCard>
        <ChartCard title="Top products" footnote={LINE_FOOTNOTE}>
          <RankBars
            rows={m.top_products.map((p) => ({ key: p.slug ?? p.name, name: p.name, value: p.value, units: p.units }))}
            format={formatRupees}
          />
        </ChartCard>
        <ChartCard title="Categories" footnote={LINE_FOOTNOTE}>
          <RankBars
            rows={m.categories.map((c) => ({ key: c.slug ?? c.name, name: c.name, value: c.value, units: c.units }))}
            format={formatRupees}
          />
        </ChartCard>
      </div>
    </>
  );
}
