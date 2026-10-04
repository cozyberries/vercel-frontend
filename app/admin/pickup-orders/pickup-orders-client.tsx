"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, PackageCheck, Search, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STALL } from "@/lib/config/business";
import { whatsappLink } from "@/lib/utils/whatsapp";
import { formatPriceOverride } from "@/lib/utils/admin-override";
import { SegmentedTabs, ListCard, EmptyState, LoadingList, ErrorBanner, type SegmentedTab } from "@/components/admin/kit";
import {
  billMessage, parsePickupTab, PICKUP_TAB_STATUSES, type PickupAction, type PickupOrderRow, type PickupTab,
} from "@/lib/orders/pickup";

const TAB_LABELS: Record<PickupTab, string> = {
  awaiting: "Awaiting ✅",
  handover: "To hand over",
  ready: "Ready",
  collected: "Collected today",
};
const TAB_ORDER: PickupTab[] = ["awaiting", "handover", "ready", "collected"];

const PAYMENT_LABEL: Record<string, string> = { upi: "UPI", cash: "Cash" };
/** A payment staff or the customer recorded that the owner has not confirmed yet. */
const CLAIM_LABEL: Record<string, string> = { upi: "UPI claimed", cash: "Cash recorded" };

function tabFromLocation(): PickupTab {
  if (typeof window === "undefined") return "handover";
  return parsePickupTab(new URLSearchParams(window.location.search).get("tab")) ?? "handover";
}

export default function PickupOrdersClient() {
  // Read ?tab= in an effect, not during render: on a client-side link click the
  // page renders before the router updates the URL, and on a full load the
  // server render (no window) would not match. Nothing is fetched until seeded.
  const [tab, setTab] = useState<PickupTab>("handover");
  const [seeded, setSeeded] = useState(false);
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<PickupOrderRow[]>([]);
  const [awaitingCount, setAwaitingCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  // Spec §5: a failed load shows ErrorBanner above the last good list (orders are kept).
  const [loadError, setLoadError] = useState<{ message: string; status?: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setTab(tabFromLocation());
    setSeeded(true);
  }, []);

  const load = useCallback(async () => {
    if (!seeded) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/admin/pickup-orders?${params}`, { credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw Object.assign(new Error(body?.error || "Failed to load pickup orders"), { status: res.status });
      }
      setOrders(body.orders ?? []);
      setAwaitingCount(typeof body.awaiting_count === "number" ? body.awaiting_count : null);
      setLoadError(null);
    } catch (err) {
      setLoadError({
        message: err instanceof Error ? err.message : "Failed to load pickup orders",
        status: (err as { status?: number }).status,
      });
    } finally {
      setLoading(false);
    }
  }, [tab, query, seeded]);

  useEffect(() => {
    if (!seeded) return;
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query, seeded]);

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
    order.bill_url
      ? whatsappLink(order.customer_phone, billMessage(order, order.bill_url))
      : null;

  const tabs: SegmentedTab<PickupTab>[] = TAB_ORDER.map((key) => ({
    key,
    label: TAB_LABELS[key],
    count: key === "awaiting" && awaitingCount ? awaitingCount : undefined,
  }));

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cb-muted-fg" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by phone or order number"
          className="rounded-xl bg-cb-white pl-9"
        />
      </div>

      {!query && <SegmentedTabs label="Pickup queue" tabs={tabs} value={tab} onChange={setTab} />}

      {loadError && (
        <ErrorBanner
          message={loadError.message}
          onRetry={() => void load()}
          retrying={loading}
          loginRedirect={loadError.status === 401 || loadError.status === 403 ? "/admin/pickup-orders" : undefined}
        />
      )}

      {loading && !loadError ? (
        <LoadingList label="Loading pickup orders" />
      ) : orders.length === 0 ? (
        loadError ? null : <EmptyState title="No pickup orders here" />
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => {
            const paidWith = order.payments.find((p) => p.status === "completed")?.payment_method;
            const awaitingConfirmation = PICKUP_TAB_STATUSES.awaiting.includes(order.status);
            const claimedWith = awaitingConfirmation
              ? order.payments.find((p) => p.status === "pending" || p.status === "processing")?.payment_method
              : undefined;
            const bill = billLink(order);
            const ready = readyLink(order);
            const busy = busyId === order.id;
            const canReady = order.status === "processing" || order.status === "payment_confirmed";
            const canCollect = canReady || order.status === "ready_for_pickup";
            return (
              <ListCard
                key={order.id}
                testId={`pickup-${order.id}`}
                title={order.customer_name ?? "Customer"}
                status={order.status}
                meta={`${order.customer_phone ? `+91 ${order.customer_phone}` : "no phone"} · ${order.order_number}`}
                actions={
                  canReady || canCollect || (order.status === "ready_for_pickup" && ready) || bill ? (
                    <>
                      {canReady && (
                        <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => act(order, "ready")}>
                          <Store className="mr-1.5 h-4 w-4" aria-hidden />
                          Mark ready
                        </Button>
                      )}
                      {canCollect && (
                        <Button className="rounded-full" disabled={busy} onClick={() => act(order, "collected")}>
                          <PackageCheck className="mr-1.5 h-4 w-4" aria-hidden />
                          Mark collected
                        </Button>
                      )}
                      {order.status === "ready_for_pickup" && ready && (
                        <Button variant="outline" className="rounded-full" asChild>
                          <a href={ready} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="mr-1.5 h-4 w-4" aria-hidden />
                            Send ready message
                          </a>
                        </Button>
                      )}
                      {bill && (
                        <Button variant="outline" className="rounded-full" asChild>
                          <a href={bill} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="mr-1.5 h-4 w-4" aria-hidden />
                            Send bill
                          </a>
                        </Button>
                      )}
                    </>
                  ) : undefined
                }
              >
                <ul>
                  {order.order_items.map((item, idx) => (
                    <li key={`${item.name}-${idx}`}>
                      {item.quantity} × {item.name}
                      {item.size ? ` · ${item.size}` : ""}
                      {item.color ? ` · ${item.color}` : ""}
                      {` — ₹${Number(item.price) * item.quantity}`}
                    </li>
                  ))}
                </ul>
                {order.price_override && (
                  <p className="mt-2 text-xs font-medium text-amber-800">{formatPriceOverride(order.price_override)}</p>
                )}
                <p className="mt-2 text-cb-muted-fg">
                  ₹{Number(order.total_amount).toFixed(0)}
                  {paidWith ? ` · ${PAYMENT_LABEL[paidWith] ?? paidWith}` : ""}
                  {claimedWith ? ` · ${CLAIM_LABEL[claimedWith] ?? claimedWith}` : ""}
                  {order.invoice_number ? ` · ${order.invoice_number}` : ""}
                </p>
                {awaitingConfirmation && (
                  <p className="mt-2 font-medium text-amber-800">{"Waiting for the owner's ✅ on Telegram"}</p>
                )}
              </ListCard>
            );
          })}
        </ul>
      )}
    </div>
  );
}
