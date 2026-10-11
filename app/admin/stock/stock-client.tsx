"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ErrorBanner, LoadingList, PageHeader, SegmentedTabs, StatGrid, StatTile, type SegmentedTab } from "@/components/admin/kit";
import { ChartCard } from "@/components/admin/charts/ChartCard";
import { RankBars } from "@/components/admin/charts/RankBars";
import { SegmentBar } from "@/components/admin/charts/SegmentBar";
import { STATUS_COLORS } from "@/components/admin/charts/chart-colors";
import { SizeGapGrid, StockFinder, StockList } from "@/components/admin/stock";
import type { StockMetrics } from "@/lib/admin/stock-metrics";
import { readStockParams, writeStockParams, type FindFilters, type StockView } from "@/lib/admin/stock-find";
import { formatCount, formatRupees } from "@/lib/admin/sales-format";
import { formatIstTime } from "@/lib/admin/stock-format";

const VIEW_TABS: SegmentedTab<StockView>[] = [
  { key: "overview", label: "Overview" },
  { key: "find", label: "Find" },
];

/** Find is used at the stall while a customer waits: refresh it every minute so a ✅'d sale shows. */
export function stockRefetchInterval(view: StockView): number | false {
  return view === "find" ? 60_000 : false;
}

async function fetchStock(): Promise<StockMetrics> {
  const res = await fetch("/api/admin/stock", { credentials: "same-origin", cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || "Couldn't load stock"), { status: res.status });
  return body.metrics as StockMetrics;
}

export default function StockClient() {
  const [view, setView] = useState<StockView>("overview");
  const [filters, setFilters] = useState<FindFilters>({ gender: "any", size: null });

  // Seeds from ?view=&gender=&size= so the stall phone's bookmark opens Find. Read in an effect: no useSearchParams.
  useEffect(() => {
    const params = readStockParams(window.location.search);
    setView(params.view);
    setFilters(params.filters);
  }, []);

  const query = useQuery({
    queryKey: ["admin", "stock"],
    queryFn: fetchStock,
    staleTime: 30_000,
    // The app's QueryProvider turns focus refetch off by default; stock should refresh when the tab comes back.
    refetchOnWindowFocus: true,
    refetchInterval: stockRefetchInterval(view),
    placeholderData: keepPreviousData,
  });

  const show = (nextView: StockView, nextFilters: FindFilters) => {
    // Data loaded on Overview can be minutes old; Find must not over-promise home stock.
    if (nextView === "find" && view === "overview") void query.refetch();
    setView(nextView);
    setFilters(nextFilters);
    window.history.replaceState(window.history.state, "", writeStockParams(window.location.href, nextView, nextFilters));
  };

  const m = query.data;
  const status = (query.error as { status?: number } | null)?.status;

  return (
    <div>
      <PageHeader title="Stock" subtitle={m ? `as of ${formatIstTime(m.generated_at)}` : undefined} />
      <div className="mb-3">
        <SegmentedTabs tabs={VIEW_TABS} value={view} onChange={(v) => show(v, filters)} label="Stock view" />
      </div>
      {query.isError && (
        <ErrorBanner
          message={(query.error as Error).message}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          loginRedirect={status === 401 || status === 403 ? "/admin/stock" : undefined}
        />
      )}
      {m ? (
        view === "find" ? (
          <StockFinder products={m.products} filters={filters} onChange={(f) => show("find", f)} />
        ) : (
          <StockBody metrics={m} />
        )
      ) : (
        !query.isError && <LoadingList rows={3} label="Loading stock" />
      )}
    </div>
  );
}

function StockBody({ metrics: m }: { metrics: StockMetrics }) {
  const now = new Date(m.generated_at);
  const k = m.kpis;
  return (
    <div className="grid grid-cols-1 gap-3">
      <StatGrid>
        <StatTile label="Units on hand" value={formatCount(k.units)} />
        <StatTile label="Stock value" value={formatRupees(k.value)} hint="at selling price" />
        <StatTile label="Out of stock" value={formatCount(k.out)} hint="sizes" />
        <StatTile label="Low (1–2 left)" value={formatCount(k.low)} hint="sizes" />
      </StatGrid>
      <SegmentBar
        label="Stock health"
        parts={[
          { key: "in", label: "In stock", value: k.in, color: STATUS_COLORS.in },
          { key: "low", label: "Low", value: k.low, color: STATUS_COLORS.low },
          { key: "out", label: "Out", value: k.out, color: STATUS_COLORS.out },
        ]}
      />
      <StockList title="Restock next" rows={m.restock} now={now} emptyTitle="Nothing to restock — every size has 3 or more" />
      <StockList title="Not selling" rows={m.not_selling} now={now} emptyTitle="Every size in stock sold in the last 60 days" />
      <ChartCard title="Stock by category">
        <RankBars
          rows={m.categories.map((c) => ({
            key: c.slug ?? c.name,
            name: c.name,
            value: c.units,
            units: c.units,
            detail: `${formatCount(c.units)} units · ${formatRupees(c.value)}`,
          }))}
          format={formatCount}
        />
      </ChartCard>
      <SizeGapGrid products={m.products} />
    </div>
  );
}
