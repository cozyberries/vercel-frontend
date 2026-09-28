"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

  useEffect(() => {
    setStatus(order?.status ?? "");
    setTracking(order?.tracking_number ?? "");
    setNotes(order?.delivery_notes ?? "");
  }, [order]);

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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>#{order.order_number || order.id.slice(0, 8)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium">{order.shipping_address?.full_name || "—"}</p>
            <p className="text-muted-foreground">
              {order.shipping_address?.phone || order.customer_phone || ""} · ₹{order.total_amount ?? 0}
            </p>
            <ul className="mt-1 text-muted-foreground">
              {order.items.map((it, i) => (
                <li key={it.id ?? i}>{it.sku || "item"}{it.size ? ` · ${it.size}` : ""} × {it.quantity ?? 1}</li>
              ))}
            </ul>
          </div>

          <label className="block">
            <span className="text-xs text-muted-foreground">Status</span>
            <select
              className="mt-1 h-9 w-full rounded-md border bg-background px-2"
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
            <span className="text-xs text-muted-foreground">Tracking number</span>
            <Input value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Delivery notes</span>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm" disabled={busy}
              onClick={() =>
                save.mutate({
                  ...(status && status !== order.status ? { status } : {}),
                  ...(tracking !== (order.tracking_number ?? "") ? { tracking_number: tracking || null } : {}),
                  ...(notes !== (order.delivery_notes ?? "") ? { delivery_notes: notes || null } : {}),
                })
              }
            >
              Save
            </Button>
            {canCreateShipment && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => createShipment.mutate()}>
                Create Delhivery shipment
              </Button>
            )}
            {isDelhivery && (
              <>
                <Button
                  size="sm" variant="outline"
                  onClick={() => window.open(`/admin/print/label/${order.order_number || order.id}?autoPrint=true`, "_blank")}
                >
                  Print label
                </Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => cancelShipment.mutate()}>
                  Cancel shipment
                </Button>
              </>
            )}
            {order.bill_url && (
              <Button size="sm" variant="outline" onClick={() => window.open(order.bill_url!, "_blank")}>
                Bill PDF
              </Button>
            )}
          </div>

          {isDelhivery && <TrackingPanel order={order} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
