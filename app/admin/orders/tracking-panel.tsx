"use client";

import { useQuery } from "@tanstack/react-query";
import type { OrderShipmentTrackingData } from "@/lib/types/delhivery-tracking";
import { api, type AdminOrder } from "./api";

export default function TrackingPanel({ order }: { order: AdminOrder }) {
  const waybill = order.tracking_number!;
  const { data, isPending, error, refetch } = useQuery<{ tracking: OrderShipmentTrackingData; cached: boolean }>({
    queryKey: ["admin", "delhivery", "tracking", waybill],
    queryFn: () =>
      api(`/api/admin/shipping/tracking?waybill=${encodeURIComponent(waybill)}&order_id=${order.id}`),
    refetchInterval: 90_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const scans = data?.tracking.scans ?? [];
  return (
    <div className="rounded-md border p-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">
          Delhivery {waybill} — {data?.tracking.currentStatus || order.delhivery_latest_status || "…"}
        </p>
        <button className="text-xs underline" onClick={() => refetch()}>Refresh</button>
      </div>
      {isPending && <p className="text-xs text-muted-foreground">Loading tracking…</p>}
      {error && <p className="text-xs text-destructive">{(error as Error).message}</p>}
      <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
        {scans.slice(0, 5).map((s, i) => (
          <li key={i}>
            {s.status}{s.location ? ` — ${s.location}` : ""}{s.timestamp ? ` · ${new Date(s.timestamp).toLocaleString("en-IN", { hour12: false })}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
