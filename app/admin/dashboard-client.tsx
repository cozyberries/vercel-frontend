"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader, StatGrid, StatTile, LoadingList, ErrorBanner } from "@/components/admin/kit";
import type { DashboardActions } from "@/lib/admin/dashboard-actions";

async function fetchActions(): Promise<{ actions: DashboardActions; cached: boolean }> {
  const res = await fetch("/api/admin/dashboard/actions", { credentials: "same-origin", cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || "Failed to load dashboard"), { status: res.status });
  return body;
}

export default function DashboardClient() {
  const query = useQuery({
    queryKey: ["admin", "dashboard", "actions"],
    queryFn: fetchActions,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const a = query.data?.actions;
  const status = (query.error as { status?: number } | null)?.status;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="What needs doing right now" />
      {query.isError && (
        <ErrorBanner
          message={(query.error as Error).message}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          loginRedirect={status === 401 || status === 403 ? "/admin" : undefined}
        />
      )}
      {query.isPending ? (
        <LoadingList rows={2} label="Loading dashboard" />
      ) : a ? (
        <StatGrid>
          <StatTile label="Awaiting ✅" value={a.awaiting} tone="attention" href="/admin/pickup-orders?tab=awaiting" />
          <StatTile label="To ship" value={a.to_ship} tone="attention" href="/admin/orders?fulfilment=delivery&status=processing&days=all" />
          <StatTile label="Ready for pickup" value={a.ready_for_pickup} href="/admin/pickup-orders?tab=ready" />
          <StatTile label="Collected today" value={a.collected_today} href="/admin/pickup-orders?tab=collected" />
        </StatGrid>
      ) : null}
    </div>
  );
}
