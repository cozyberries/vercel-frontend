"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ActionSheet } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatOrderStatus } from "@/lib/utils/order-status";
import type { OrderStatus } from "@/lib/types/order";
import { api, ApiError, type AdminOrder } from "./api";
import TrackingPanel from "./tracking-panel";

const ALL_STATUSES: OrderStatus[] = [
  "payment_pending", "verifying_payment", "payment_confirmed", "processing",
  "ready_for_pickup", "collected", "shipped", "delivered", "cancelled", "refunded",
];

export default function OrderDetailDialog({
  order, onClose, onChanged,
}: {
  order: AdminOrder | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [tracking, setTracking] = useState("");
  const [notes, setNotes] = useState("");

  // Resync the local form fields only when the dialog opens/closes or a
  // genuinely different order is selected — keyed on the order id, not the
  // order object itself. A background list refetch (React Query's default
  // refetchOnWindowFocus, an invalidation after another admin's edit, etc.)
  // hands us a brand-new `order` object with the SAME id; if this effect
  // depended on the object identity it would fire on every such refetch and
  // silently wipe out whatever the admin was mid-typing.
  useEffect(() => {
    setStatus(order?.status ?? "");
    setTracking(order?.tracking_number ?? "");
    setNotes(order?.delivery_notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally id-keyed, see comment above
  }, [order?.id]);

  const onError = (e: unknown) =>
    toast.error(e instanceof ApiError ? e.message : "Request failed — check your connection");

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/admin/orders/${order!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => { toast.success("Order updated"); onChanged(); },
    onError,
  });

  const createShipment = useMutation({
    mutationFn: () =>
      api<{ waybill: string }>(`/api/admin/orders/${order!.id}/shipment`, { method: "POST" }),
    onSuccess: (d) => { toast.success(`Shipment created: ${d.waybill}`); onChanged(); },
    onError,
  });

  const cancelShipment = useMutation({
    mutationFn: () => api(`/api/admin/orders/${order!.id}/shipment`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Shipment cancelled"); onChanged(); },
    onError,
  });

  if (!order) return null;
  const isDelhivery = Boolean(order.tracking_number) &&
    (!order.carrier_name || order.carrier_name.toLowerCase().includes("delhivery"));
  const canCreateShipment =
    order.fulfilment_method !== "pickup" &&
    !isDelhivery &&
    (order.status === "payment_confirmed" || order.status === "processing");
  const busy = save.isPending || createShipment.isPending || cancelShipment.isPending;

  // Computed once per render so the Save button can be disabled — and the
  // mutation short-circuited — when nothing actually changed, instead of
  // sending an empty PATCH body that the API 400s ("Nothing to update").
  const changedFields: Record<string, unknown> = {};
  if (status && status !== order.status) changedFields.status = status;
  if (tracking !== (order.tracking_number ?? "")) changedFields.tracking_number = tracking || null;
  if (notes !== (order.delivery_notes ?? "")) changedFields.delivery_notes = notes || null;
  const hasChanges = Object.keys(changedFields).length > 0;

  return (
    <ActionSheet open onOpenChange={(open) => !open && onClose()} title={`#${order.order_number || order.id.slice(0, 8)}`}>
      <div className="space-y-3 text-sm">
        <div>
          <p className="font-medium text-cb-fg">{order.shipping_address?.full_name || "—"}</p>
          <p className="text-cb-muted-fg">
            {order.shipping_address?.phone || order.customer_phone || ""} · ₹{order.total_amount ?? 0}
          </p>
          <ul className="mt-1 text-cb-muted-fg">
            {order.items.map((it, i) => (
              <li key={it.id ?? i}>{it.sku || "item"}{it.size ? ` · ${it.size}` : ""} × {it.quantity ?? 1}</li>
            ))}
          </ul>
        </div>

        <label className="block">
          <span className="text-xs text-cb-muted-fg">Status</span>
          <select
            className="mt-1 h-10 w-full rounded-xl border border-cb-border bg-cb-white px-2"
            value={status}
            onChange={(e) => setStatus(e.target.value as OrderStatus)}
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s} disabled={s === "verifying_payment" && order.status !== "verifying_payment"}>
                {formatOrderStatus(s)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-cb-muted-fg">Tracking number</span>
          <Input className="rounded-xl" value={tracking} onChange={(e) => setTracking(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-cb-muted-fg">Delivery notes</span>
          <Input className="rounded-xl" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button className="rounded-full" disabled={busy || !hasChanges} onClick={() => save.mutate(changedFields)}>
            Save
          </Button>
          {canCreateShipment && (
            <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => createShipment.mutate()}>
              Create Delhivery shipment
            </Button>
          )}
          {isDelhivery && (
            <>
              <Button variant="outline" className="rounded-full"
                onClick={() => window.open(`/admin/print/label/${order.order_number || order.id}?autoPrint=true`, "_blank")}>
                Print label
              </Button>
              <Button variant="destructive" className="rounded-full" disabled={busy} onClick={() => cancelShipment.mutate()}>
                Cancel shipment
              </Button>
            </>
          )}
          {order.bill_url && (
            <Button variant="outline" className="rounded-full" onClick={() => window.open(order.bill_url!, "_blank")}>
              Bill PDF
            </Button>
          )}
        </div>

        {isDelhivery && <TrackingPanel order={order} />}
      </div>
    </ActionSheet>
  );
}
