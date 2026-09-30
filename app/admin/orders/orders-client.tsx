"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatOrderStatus } from "@/lib/utils/order-status";
import {
  PageHeader, FilterChips, ListCard, EmptyState, LoadingList, ErrorBanner, type FilterChip,
} from "@/components/admin/kit";
import {
  api, ApiError, listUrl, matchesSearch, PAGE_SIZE,
  type AdminOrdersListResponse, type OrderFilters,
} from "./api";
import OrderDetailDialog from "./order-detail-dialog";
import NotificationsPanel from "./notifications-panel";

const STATUSES = ["payment_pending", "verifying_payment", "payment_confirmed", "processing", "ready_for_pickup", "collected", "shipped", "delivered", "cancelled", "refunded"] as const;
const STATUS_CHIPS: FilterChip<string>[] = [{ value: "all", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: formatOrderStatus(s) }))];
const FULFILMENT_CHIPS: FilterChip<string>[] = [
  { value: "all", label: "All" }, { value: "delivery", label: "Delivery" }, { value: "pickup", label: "Pickup" },
];
const DAY_CHIPS: FilterChip<string>[] = [
  { value: "7", label: "7d" }, { value: "30", label: "30d" }, { value: "90", label: "90d" }, { value: "all", label: "All" },
];
const DEFAULT_FILTERS: OrderFilters = { status: "all", fulfilment: "all", days: 7, offset: 0 };

/** Seeds from ?status=&fulfilment=&days= so dashboard tiles can deep-link. Read in an effect: no useSearchParams. */
export function filtersFromLocation(): OrderFilters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  const p = new URLSearchParams(window.location.search);
  const status = p.get("status");
  const fulfilment = p.get("fulfilment");
  const days = p.get("days");
  return {
    status: status && (STATUSES as readonly string[]).includes(status) ? status : "all",
    fulfilment: fulfilment === "delivery" || fulfilment === "pickup" ? fulfilment : "all",
    days: days === "all" ? null : days && ["7", "30", "90"].includes(days) ? Number(days) : 7,
    offset: 0,
  };
}

export default function OrdersClient() {
  const [filters, setFilters] = useState<OrderFilters>(DEFAULT_FILTERS);
  const [seeded, setSeeded] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setFilters(filtersFromLocation());
    setSeeded(true);
  }, []);

  const { data, isPending, error, refetch, isFetching } = useQuery<AdminOrdersListResponse, ApiError>({
    queryKey: ["admin", "orders", filters],
    queryFn: () => api<AdminOrdersListResponse>(listUrl(filters)),
    enabled: seeded,
    staleTime: 30_000,
    // Defense in depth alongside the id-keyed resync in OrderDetailDialog: a
    // window-focus refetch here would hand the open sheet a new order object
    // for the same row, which must never wipe an admin's in-progress edit.
    refetchOnWindowFocus: false,
  });

  const orders = (data?.orders ?? []).filter((o) => matchesSearch(o, search));
  const total = data?.total ?? 0;
  const selected = orders.find((o) => o.id === selectedId) ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
  const set = (patch: Partial<OrderFilters>) => setFilters((f) => ({ ...f, ...patch, offset: 0 }));
  const authError = error && (error.status === 401 || error.status === 403);

  return (
    <div className="space-y-3">
      <PageHeader title="Orders" subtitle={`${total} in range`} />
      <NotificationsPanel />

      <FilterChips label="Status filter" chips={STATUS_CHIPS} value={filters.status} onChange={(v) => set({ status: v })} />
      <div className="flex flex-wrap items-center gap-3">
        <FilterChips label="Fulfilment filter" chips={FULFILMENT_CHIPS} value={filters.fulfilment} onChange={(v) => set({ fulfilment: v })} />
        <FilterChips
          label="Date range"
          chips={DAY_CHIPS}
          value={filters.days === null ? "all" : String(filters.days)}
          onChange={(v) => set({ days: v === "all" ? null : Number(v) })}
        />
      </div>

      <Input
        placeholder="Search order #, AWB, name, phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-xl bg-cb-white"
      />

      {error && (
        <ErrorBanner
          message={error.message}
          onRetry={() => void refetch()}
          retrying={isFetching}
          loginRedirect={authError ? "/admin/orders" : undefined}
        />
      )}
      {isPending && seeded && <LoadingList label="Loading orders" />}

      {!isPending && orders.length === 0 && !error && (
        <EmptyState title="No orders match" hint="Try a wider date range or clear the search." />
      )}

      <ul className="space-y-3">
        {orders.map((o) => (
          <ListCard
            key={o.id}
            testId={`order-${o.id}`}
            title={`#${o.order_number || o.id.slice(0, 8)}`}
            status={o.status}
            meta={`${o.shipping_address?.full_name || "—"} · ${o.items.length} item${o.items.length === 1 ? "" : "s"} · ₹${o.total_amount ?? 0}`}
            onClick={() => setSelectedId(o.id)}
          >
            <p className="flex justify-between text-xs text-cb-muted-fg">
              <span>{o.fulfilment_method === "pickup" ? "Stall pickup" : "Delivery"}</span>
              {o.tracking_number && <span>{o.carrier_name || "AWB"}: {o.tracking_number}</span>}
            </p>
          </ListCard>
        ))}
      </ul>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <Button size="sm" variant="outline" className="rounded-full" disabled={filters.offset === 0}
            onClick={() => setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - PAGE_SIZE) }))}>
            Previous
          </Button>
          <span className="text-cb-muted-fg">
            {filters.offset + 1}–{Math.min(filters.offset + PAGE_SIZE, total)} of {total}
          </span>
          <Button size="sm" variant="outline" className="rounded-full" disabled={filters.offset + PAGE_SIZE >= total}
            onClick={() => setFilters((f) => ({ ...f, offset: f.offset + PAGE_SIZE }))}>
            Next
          </Button>
        </div>
      )}

      <OrderDetailDialog order={selected} onClose={() => setSelectedId(null)} onChanged={refresh} />
    </div>
  );
}
