"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageCircle, PackageCheck, Search, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STALL } from "@/lib/config/business";
import { whatsappLink } from "@/lib/utils/whatsapp";
import { formatOrderStatus, getOrderStatusColor } from "@/lib/utils/order-status";
import type { PickupAction, PickupOrderRow, PickupTab } from "@/lib/orders/pickup";

const TABS: { key: PickupTab; label: string }[] = [
  { key: "handover", label: "To hand over" },
  { key: "ready", label: "Ready" },
  { key: "collected", label: "Collected today" },
];

const PAYMENT_LABEL: Record<string, string> = { upi: "UPI", cash: "Cash" };

export default function PickupOrdersClient() {
  const [tab, setTab] = useState<PickupTab>("handover");
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<PickupOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/admin/pickup-orders?${params}`, { credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to load pickup orders");
      setOrders(body.orders ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load pickup orders");
    } finally {
      setLoading(false);
    }
  }, [tab, query]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const readyLink = (order: PickupOrderRow) =>
    whatsappLink(
      order.customer_phone,
      `Hi${order.customer_name ? ` ${order.customer_name}` : ""}! Your CozyBerries order ${order.order_number} is ready to collect at ${STALL.name}, ${STALL.addressLines.join(", ")}. Hours: ${STALL.hours}.`
    );

  const act = async (order: PickupOrderRow, action: PickupAction) => {
    setBusyId(order.id);
    try {
      const res = await fetch(`/api/admin/pickup-orders/${order.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Update failed");
      if (action === "ready") {
        const link = readyLink(order);
        if (link) window.open(link, "_blank", "noopener,noreferrer");
      }
      toast.success(action === "ready" ? "Marked ready" : "Marked collected");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const billLink = (order: PickupOrderRow) =>
    whatsappLink(
      order.customer_phone,
      `Your CozyBerries bill for order ${order.order_number}${order.invoice_number ? ` (invoice ${order.invoice_number})` : ""}: ${window.location.origin}/orders/${order.id}/invoice`
    );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by phone or order number"
          className="pl-9"
        />
      </div>

      {!query && (
        <div className="grid grid-cols-3 gap-2" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3 py-2 text-sm font-semibold ${
                tab === t.key ? "bg-cb-terracotta text-white" : "bg-cb-linen text-cb-fg"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-cb-terracotta" />
        </div>
      ) : orders.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No pickup orders here.</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => {
            const paidWith = order.payments.find((p) => p.status === "completed")?.payment_method;
            const bill = billLink(order);
            const busy = busyId === order.id;
            return (
              <li key={order.id} className="rounded-2xl border border-cb-border bg-white p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-bold text-cb-fg">{order.customer_name ?? "Customer"}</p>
                    <p className="text-sm text-cb-muted-fg">
                      {order.customer_phone ? `+91 ${order.customer_phone}` : "no phone"} · {order.order_number}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getOrderStatusColor(order.status)}`}>
                    {formatOrderStatus(order.status)}
                  </span>
                </div>
                <ul className="mb-3 text-sm text-cb-fg">
                  {order.order_items.map((item, idx) => (
                    <li key={`${item.name}-${idx}`}>
                      {item.quantity} × {item.name}
                      {item.size ? ` · ${item.size}` : ""}
                      {item.color ? ` · ${item.color}` : ""}
                      {` — ₹${Number(item.price) * item.quantity}`}
                    </li>
                  ))}
                </ul>
                <p className="mb-3 text-sm text-cb-muted-fg">
                  ₹{Number(order.total_amount).toFixed(0)}
                  {paidWith ? ` · ${PAYMENT_LABEL[paidWith] ?? paidWith}` : ""}
                  {order.invoice_number ? ` · ${order.invoice_number}` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(order.status === "processing" || order.status === "payment_confirmed") && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(order, "ready")}>
                      <Store className="h-4 w-4 mr-1.5" />
                      Mark ready
                    </Button>
                  )}
                  {(order.status === "processing" || order.status === "payment_confirmed" || order.status === "ready_for_pickup") && (
                    <Button size="sm" disabled={busy} onClick={() => act(order, "collected")}>
                      <PackageCheck className="h-4 w-4 mr-1.5" />
                      Mark collected
                    </Button>
                  )}
                  {order.status === "ready_for_pickup" && readyLink(order) && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={readyLink(order)!} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-4 w-4 mr-1.5" />
                        Send ready message
                      </a>
                    </Button>
                  )}
                  {bill && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={bill} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-4 w-4 mr-1.5" />
                        Send bill
                      </a>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
