"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ErrorBanner, LoadingList, PageHeader, StatGrid, StatTile } from "@/components/admin/kit";
import { ChartCard } from "@/components/admin/charts/ChartCard";
import { RankBars } from "@/components/admin/charts/RankBars";
import { SegmentBar } from "@/components/admin/charts/SegmentBar";
import { STATUS_COLORS } from "@/components/admin/charts/chart-colors";
import { SizeGapGrid, StockList } from "@/components/admin/stock";
import type { StockMetrics } from "@/lib/admin/stock-metrics";
import { formatCount, formatRupees } from "@/lib/admin/sales-format";
import { formatIstTime } from "@/lib/admin/stock-format";

async function fetchStock(): Promise<StockMetrics> {
  const res = await fetch("/api/admin/stock", { credentials: "same-origin", cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || "Couldn't load stock"), { status: res.status });
  return body.metrics as StockMetrics;
}

export default function StockClient() {
  const query = useQuery({
    queryKey: ["admin", "stock"],
    queryFn: fetchStock,
    staleTime: 30_000,
    // The app's QueryProvider turns focus refetch off by default; stock should refresh when the tab comes back.
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });
  const m = query.data;
  const status = (query.error as { status?: number } | null)?.status;

  return (
    <div>
      <PageHeader title="Stock" subtitle={m ? `as of ${formatIstTime(m.generated_at)}` : undefined} />
      {query.isError && (
        <ErrorBanner
          message={(query.error as Error).message}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          loginRedirect={status === 401 || status === 403 ? "/admin/stock" : undefined}
        />
      )}
      {m ? <StockBody metrics={m} /> : !query.isError && <LoadingList rows={3} label="Loading stock" />}
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
