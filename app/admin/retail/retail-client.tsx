"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionSheet, EmptyState, ErrorBanner, ListCard, LoadingList, PageHeader } from "@/components/admin/kit";
import { RetailerForm } from "@/components/admin/retail";
import { formatPaise } from "@/lib/gst/register-format";
import { monthLabel } from "@/lib/gst/register-month";
import type { RetailerListItem, RetailerListResponse } from "@/lib/retail/api-types";
import { retailFetch, sendJson } from "@/lib/retail/client";

export const RETAIL_KEY = ["admin", "retail"] as const;

export default function RetailClient() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const query = useQuery({ queryKey: RETAIL_KEY, queryFn: () => retailFetch<RetailerListResponse>("/api/admin/retail"), staleTime: 30_000 });
  const data = query.data;
  const status = (query.error as { status?: number } | null)?.status;

  return (
    <div>
      <PageHeader title="Retail shops" subtitle="Stock on sale-or-return" action={<Button size="sm" onClick={() => setAdding(true)}>Add shop</Button>} />
      {query.isError && (
        <ErrorBanner message={(query.error as Error).message} onRetry={() => void query.refetch()} retrying={query.isFetching}
          loginRedirect={status === 401 || status === 403 ? "/admin/retail" : undefined} />
      )}
      {data ? (
        <div className="grid gap-3">
          {data.missingLastPeriod.length > 0 && (
            <p role="status" className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              No sales report for {monthLabel(data.lastPeriod)}: {data.missingLastPeriod.join(", ")}
            </p>
          )}
          {data.items.length === 0 ? (
            <EmptyState title="No shops yet" hint="Add a shop to send it stock on sale-or-return." />
          ) : (
            <ul className="space-y-2">{data.items.map((item) => <ShopCard key={item.retailer.id} item={item} />)}</ul>
          )}
        </div>
      ) : (
        !query.isError && <LoadingList rows={3} label="Loading shops" />
      )}
      <ActionSheet open={adding} onOpenChange={setAdding} title="Add shop">
        <RetailerForm
          submitLabel="Add shop"
          onSubmit={async (body) => {
            await sendJson("/api/admin/retail", body);
            setAdding(false);
            await qc.invalidateQueries({ queryKey: RETAIL_KEY });
          }}
        />
      </ActionSheet>
    </div>
  );
}

function ShopCard({ item: { retailer: r, summary: s } }: { item: RetailerListItem }) {
  const router = useRouter();
  const plural = (n: number) => (n === 1 ? "batch" : "batches");
  return (
    <ListCard
      testId="retail-shop"
      title={r.trade_name || r.legal_name}
      meta={`${r.gstin}${r.active ? "" : " · inactive"}`}
      dimmed={!r.active}
      onClick={() => router.push(`/admin/retail/${r.id}`)}
    >
      <p className="text-sm text-cb-fg">{s.unitsHeld} pcs · {formatPaise(s.mrpValueHeldPaise)} at MRP</p>
      <p className="text-sm text-cb-fg">Owes {formatPaise(s.owedPaise)}</p>
      {s.redBatches > 0 ? (
        <p className="text-sm font-semibold text-red-700">{s.redBatches} {plural(s.redBatches)} past 6 months: invoice or take back</p>
      ) : s.amberBatches > 0 ? (
        <p className="text-sm text-amber-800">{s.amberBatches} {plural(s.amberBatches)} over 5 months old</p>
      ) : null}
      <p className="text-xs text-cb-muted-fg">{s.lastReportedPeriod ? `Last report: ${monthLabel(s.lastReportedPeriod)}` : "No report yet"}</p>
    </ListCard>
  );
}
