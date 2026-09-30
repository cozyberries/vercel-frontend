"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPrice } from "@/lib/utils";
import { StatusPill, ListCard, ActionSheet, EmptyState, LoadingList, ErrorBanner } from "@/components/admin/kit";
import { useOnBehalfOrders, ON_BEHALF_ORDERS_PAGE_SIZE } from "@/hooks/useApiQueries";
import type { OnBehalfOrder } from "@/lib/types/admin-on-behalf-orders";

type Row = OnBehalfOrder;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function Person({ email, full_name }: { email?: string | null; full_name?: string | null }) {
  return (
    <span className="flex flex-col">
      <span className="text-sm text-cb-fg">{email ?? "—"}</span>
      {full_name && <span className="text-xs text-cb-muted-fg">{full_name}</span>}
    </span>
  );
}

export default function OnBehalfOrdersClient() {
  // Offset lives in component state so TanStack Query caches each page by key.
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Row | null>(null);
  const query = useOnBehalfOrders(offset, ON_BEHALF_ORDERS_PAGE_SIZE);
  const orders = query.data?.orders ?? [];
  const total = query.data?.total ?? 0;
  const isRefetching = query.isFetching && !query.isPending;
  const errorStatus = (query.error as { status?: number } | null)?.status;
  // Spec §5: a failed fetch shows the banner above the last good list; 401/403 offers "Log in again".
  const banner = query.error ? (
    <ErrorBanner
      message={query.error instanceof Error ? query.error.message : "Failed to load orders"}
      onRetry={() => void query.refetch()}
      retrying={isRefetching}
      loginRedirect={errorStatus === 401 || errorStatus === 403 ? "/admin/on-behalf-orders" : undefined}
    />
  ) : null;

  if (query.isPending) return <LoadingList label="Loading on-behalf orders" />;
  if (query.error && !query.data) return banner;
  if (orders.length === 0) {
    return (
      <div className="space-y-3">
        {banner}
        <EmptyState title="No orders placed on behalf yet" hint="Impersonate a customer and place an order in their session." />
        <Button asChild variant="outline" className="w-full rounded-full">
          <Link href="/admin/impersonate">Impersonate a user</Link>
        </Button>
      </div>
    );
  }

  const canPrev = offset > 0;
  const canNext = offset + orders.length < total;

  return (
    <div className="space-y-4">
      {banner}
      <div className="hidden overflow-hidden rounded-2xl border border-cb-border bg-cb-white lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Placed by</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id} className="cursor-pointer" onClick={() => setSelected(o)}>
                <TableCell className="font-medium">#{o.order_number}</TableCell>
                <TableCell><Person {...o.customer} /></TableCell>
                <TableCell><Person {...(o.placed_by_admin ?? {})} /></TableCell>
                <TableCell className="text-sm">{formatDate(o.created_at)}</TableCell>
                <TableCell className="text-right text-sm">{formatPrice(o.total_amount, undefined, o.currency)}</TableCell>
                <TableCell><StatusPill status={o.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-3 lg:hidden">
        {orders.map((o) => (
          <ListCard
            key={o.id}
            testId={`on-behalf-${o.id}`}
            title={`#${o.order_number}`}
            status={o.status}
            meta={`${o.customer.full_name ?? o.customer.email ?? "—"} · ${formatDate(o.created_at)} · ${formatPrice(o.total_amount, undefined, o.currency)}`}
            onClick={() => setSelected(o)}
          />
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs text-cb-muted-fg">
          Showing {total === 0 ? 0 : offset + 1}–{offset + orders.length} of {total}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-full" disabled={!canPrev || isRefetching}
            onClick={() => setOffset((p) => Math.max(0, p - ON_BEHALF_ORDERS_PAGE_SIZE))}>
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
            Previous
          </Button>
          <Button variant="outline" size="sm" className="rounded-full" disabled={!canNext || isRefetching}
            onClick={() => setOffset((p) => p + ON_BEHALF_ORDERS_PAGE_SIZE)}>
            Next
            <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <ActionSheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)} title={selected ? `#${selected.order_number}` : ""}>
        {selected && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-cb-muted-fg">Customer</dt>
            <dd><Person {...selected.customer} /></dd>
            <dt className="text-cb-muted-fg">Placed by</dt>
            <dd><Person {...(selected.placed_by_admin ?? {})} /></dd>
            <dt className="text-cb-muted-fg">Date</dt>
            <dd>{formatDate(selected.created_at)}</dd>
            <dt className="text-cb-muted-fg">Total</dt>
            <dd>{formatPrice(selected.total_amount, undefined, selected.currency)}</dd>
            <dt className="text-cb-muted-fg">Status</dt>
            <dd><StatusPill status={selected.status} /></dd>
          </dl>
        )}
      </ActionSheet>
    </div>
  );
}
