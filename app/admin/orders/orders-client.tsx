"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatOrderStatus, getOrderStatusColor } from "@/lib/utils/order-status";
import {
  api, listUrl, matchesSearch, PAGE_SIZE,
  type AdminOrdersListResponse, type OrderFilters,
} from "./api";
import OrderDetailDialog from "./order-detail-dialog";
import NotificationsPanel from "./notifications-panel";

const STATUS_FILTERS = ["all", "payment_pending", "verifying_payment", "payment_confirmed", "processing", "ready_for_pickup", "collected", "shipped", "delivered", "cancelled", "refunded"] as const;
const DAY_PRESETS: { label: string; days: number | null }[] = [
  { label: "7d", days: 7 }, { label: "30d", days: 30 }, { label: "90d", days: 90 }, { label: "All", days: null },
];

export default function OrdersClient() {
  const [filters, setFilters] = useState<OrderFilters>({ status: "all", fulfilment: "all", days: 7, offset: 0 });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isPending, error } = useQuery<AdminOrdersListResponse>({
    queryKey: ["admin", "orders", filters],
    queryFn: () => api<AdminOrdersListResponse>(listUrl(filters)),
    staleTime: 30_000,
  });

  const orders = (data?.orders ?? []).filter((o) => matchesSearch(o, search));
  const total = data?.total ?? 0;
  const selected = orders.find((o) => o.id === selectedId) ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Orders</h1>
        <NotificationsPanel />
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Status filter"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, offset: 0 }))}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{s === "all" ? "All statuses" : formatOrderStatus(s)}</option>
          ))}
        </select>
        <select
          aria-label="Fulfilment filter"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={filters.fulfilment}
          onChange={(e) => setFilters((f) => ({ ...f, fulfilment: e.target.value, offset: 0 }))}
        >
          <option value="all">Delivery + pickup</option>
          <option value="delivery">Delivery</option>
          <option value="pickup">Pickup</option>
        </select>
        <div className="flex gap-1">
          {DAY_PRESETS.map((p) => (
            <Button
              key={p.label}
              size="sm"
              variant={filters.days === p.days ? "default" : "outline"}
              onClick={() => setFilters((f) => ({ ...f, days: p.days, offset: 0 }))}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <Input
        placeholder="Search order #, AWB, name, phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isPending && <p className="text-sm text-muted-foreground">Loading orders…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      <ul className="space-y-2">
        {orders.map((o) => (
          <li key={o.id}>
            <button
              className="w-full rounded-lg border p-3 text-left hover:bg-accent"
              onClick={() => setSelectedId(o.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm">#{o.order_number || o.id.slice(0, 8)}</span>
                <Badge className={getOrderStatusColor(o.status)}>{formatOrderStatus(o.status)}</Badge>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                <span>{o.shipping_address?.full_name || "—"} · {o.items.length} item{o.items.length === 1 ? "" : "s"}</span>
                <span>₹{o.total_amount ?? 0}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{o.fulfilment_method === "pickup" ? "Stall pickup" : "Delivery"}</span>
                {o.tracking_number && <span>{o.carrier_name || "AWB"}: {o.tracking_number}</span>}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {!isPending && orders.length === 0 && (
        <p className="text-sm text-muted-foreground">No orders match.</p>
      )}

      <div className="flex items-center justify-between text-sm">
        <Button
          size="sm" variant="outline"
          disabled={filters.offset === 0}
          onClick={() => setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - PAGE_SIZE) }))}
        >
          Previous
        </Button>
        <span className="text-muted-foreground">
          {filters.offset + 1}–{Math.min(filters.offset + PAGE_SIZE, total)} of {total}
        </span>
        <Button
          size="sm" variant="outline"
          disabled={filters.offset + PAGE_SIZE >= total}
          onClick={() => setFilters((f) => ({ ...f, offset: f.offset + PAGE_SIZE }))}
        >
          Next
        </Button>
      </div>

      <OrderDetailDialog order={selected} onClose={() => setSelectedId(null)} onChanged={refresh} />
    </div>
  );
}
