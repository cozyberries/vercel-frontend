"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import SupabaseImage from "@/components/ui/supabase-image";
import Link from "next/link";
import {
  ChevronLeft,
  MapPin,
  Receipt,
  CheckCircle,
  Package,
  Truck,
  Wallet,
  RotateCcw,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/supabase-auth-provider";
import { orderService } from "@/lib/services/orders";
import { useOrderShipmentTracking } from "@/hooks/useApiQueries";
import { ShipmentTrackingSection } from "@/components/orders/ShipmentTrackingSection";
import { useReorder } from "@/hooks/useReorder";
import { getOrderStageInfo, STEPPER_STEPS, type OrderStageKey } from "@/lib/utils/order-stage";
import { UPI_ID, UPI_PHONE_NUMBER } from "@/lib/constants";
import type { Order } from "@/lib/types/order";

const STAGE_ICON: Record<OrderStageKey, typeof Receipt> = {
  order_placed: Receipt,
  payment_confirmed: CheckCircle,
  packed: Package,
  shipped: Package,
  out_for_delivery: Truck,
  delivered: CheckCircle,
  cancelled: Receipt,
  refunded: Receipt,
};

function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getContextLine(order: Order, stageKey: OrderStageKey): string {
  switch (stageKey) {
    case "order_placed":
      return "Order placed — confirming your payment";
    case "payment_confirmed":
      return "Payment confirmed — packing soon";
    case "packed":
      return "Packed — shipping soon";
    case "shipped":
      return "Shipped — on its way";
    case "out_for_delivery":
      return order.estimated_delivery_date
        ? `Arriving ${formatShortDate(order.estimated_delivery_date)}`
        : "Arriving soon";
    case "delivered":
      return order.actual_delivery_date ? `Delivered on ${formatShortDate(order.actual_delivery_date)}` : "Delivered";
    case "cancelled":
      return "Order cancelled";
    case "refunded":
      return "Order refunded";
    default:
      return "";
  }
}

export default function OrderDetailsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const orderId = params?.id as string;
  const reorder = useReorder();

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: tracking } = useOrderShipmentTracking(order?.id, !!order?.tracking_number);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }
    if (user && orderId) {
      fetchOrderDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, orderId]);

  const fetchOrderDetails = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await orderService.getOrder(orderId);
      setOrder(data.order);
    } catch (err) {
      console.error("Error fetching order details:", err);
      setError("Failed to load order details. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-cb-linen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cb-terracotta" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-cb-linen">
        <div className="container mx-auto px-4 py-20 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-cb-fg mb-2">Error Loading Order</h2>
          <p className="text-cb-muted-fg mb-4">{error || "Order not found"}</p>
          <div className="flex gap-4 justify-center">
            <Button onClick={fetchOrderDetails} className="rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white">
              Try Again
            </Button>
            <Button variant="outline" asChild className="rounded-full border-cb-border">
              <Link href="/orders">Back to Orders</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const stage = getOrderStageInfo(order.status, tracking?.currentStatus);
  const StageIcon = STAGE_ICON[stage.key];
  const contextLine = getContextLine(order, stage.key);
  const isPaymentPending = order.status === "payment_pending" || order.status === "verifying_payment";
  const showTrackOrder = stage.key === "shipped" || stage.key === "out_for_delivery";

  return (
    <div className="min-h-screen bg-cb-linen pb-10">
      <div className="bg-white border-b border-cb-border">
        <div className="container mx-auto max-w-2xl px-4 py-4 flex items-center gap-2">
          <Link href="/orders" aria-label="Back to orders" className="text-cb-fg">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold text-cb-fg">{order.order_number}</h1>
        </div>
      </div>

      <div className="container mx-auto max-w-2xl px-4 py-6 space-y-4">
        {/* Status + stepper */}
        <div className="bg-white rounded-2xl border border-cb-border p-5">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold mb-2 ${stage.pillClass}`}>
            <StageIcon className="h-3.5 w-3.5" />
            {stage.label}
          </span>
          <p className="text-sm font-semibold text-cb-terracotta-deep mb-5">{contextLine}</p>

          <div className="flex items-start">
            {STEPPER_STEPS.map((step, index) => {
              const Icon = STAGE_ICON[step.key];
              const isDone = stage.stepIndex !== null && index <= stage.stepIndex;
              const isLast = index === STEPPER_STEPS.length - 1;
              return (
                <div key={step.key} className={`flex flex-col items-center ${isLast ? "" : "flex-1"}`}>
                  <div className="flex w-full items-center">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        isDone ? "bg-cb-terracotta text-white" : "bg-cb-muted text-cb-muted-fg"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {!isLast && (
                      <span
                        className={`h-0.5 flex-1 ${
                          stage.stepIndex !== null && index < stage.stepIndex ? "bg-cb-terracotta" : "bg-cb-border"
                        }`}
                      />
                    )}
                  </div>
                  <span className={`mt-1.5 text-[11px] text-center leading-tight ${isDone ? "font-semibold text-cb-fg" : "text-cb-muted-fg"}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {isPaymentPending && (
            <div className="mt-5 rounded-xl bg-cb-peach p-4">
              <p className="flex items-center gap-1.5 text-sm font-bold text-cb-terracotta-deep mb-1">
                <Wallet className="h-4 w-4" />
                Complete your payment · ₹{order.total_amount.toFixed(0)}
              </p>
              <p className="text-sm text-cb-fg">
                Pay via any UPI app to <span className="font-bold">{UPI_ID}</span> or to{" "}
                <span className="font-bold">{UPI_PHONE_NUMBER}</span>. We&apos;ll confirm within a few hours — your
                order is held for you.
              </p>
            </div>
          )}

          {showTrackOrder && (
            <a
              href="#shipment-tracking"
              className="mt-5 flex items-center justify-center gap-2 rounded-full border border-cb-border py-3 text-sm font-semibold text-cb-fg"
            >
              <MapPin className="h-4 w-4" />
              Track order
            </a>
          )}
        </div>

        {/* Items */}
        <div className="bg-white rounded-2xl border border-cb-border p-5">
          <p className="text-sm font-bold text-cb-fg mb-3">
            {order.items.length} item{order.items.length === 1 ? "" : "s"}
          </p>
          <div className="space-y-3">
            {order.items.map((item, idx) => (
              <div key={`${item.id}-${item.size ?? ""}-${idx}`} className="flex items-center gap-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-cb-linen">
                  {item.image && <SupabaseImage src={item.image} preset="thumbnail" alt={item.name} fill className="object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-cb-fg truncate">{item.name}</p>
                  <p className="text-sm text-cb-muted-fg">
                    {[item.color, item.size && `Size ${item.size}`, `Qty ${item.quantity}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="text-sm font-bold text-cb-fg shrink-0">₹{(item.price * item.quantity).toFixed(0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Delivery address */}
        {order.shipping_address && (
          <div className="bg-white rounded-2xl border border-cb-border p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-cb-fg mb-3">
              <MapPin className="h-4 w-4 text-cb-terracotta-deep" />
              Delivery address
            </p>
            <p className="text-sm font-bold text-cb-fg">{order.shipping_address.full_name}</p>
            <p className="text-sm text-cb-muted-fg">
              {[order.shipping_address.address_line_1, order.shipping_address.area].filter(Boolean).join(", ")}
            </p>
            <p className="text-sm text-cb-muted-fg">
              {order.shipping_address.city} – {order.shipping_address.postal_code}
            </p>
          </div>
        )}

        {/* Bill details */}
        <div className="bg-white rounded-2xl border border-cb-border p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-cb-fg mb-3">
            <Receipt className="h-4 w-4 text-cb-terracotta-deep" />
            Bill details
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-cb-muted-fg">Item total</span>
              <span className="font-semibold text-cb-fg">₹{order.subtotal.toFixed(0)}</span>
            </div>
            {order.discount_code && (order.discount_amount ?? 0) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-cb-muted-fg">Discount ({order.discount_code})</span>
                <span className="font-semibold text-cb-terracotta">−₹{(order.discount_amount ?? 0).toFixed(0)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-cb-muted-fg">Delivery</span>
              <span className={`font-semibold ${order.delivery_charge === 0 ? "text-cb-success" : "text-cb-fg"}`}>
                {order.delivery_charge === 0 ? "Free" : `₹${order.delivery_charge.toFixed(0)}`}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-cb-border text-base">
              <span className="font-bold text-cb-fg">{isPaymentPending ? "Total payable" : "Total paid"}</span>
              <span className="font-bold text-cb-fg">₹{order.total_amount.toFixed(0)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              type="button"
              onClick={() => reorder(order.items)}
              className="flex-1 flex items-center justify-center gap-2 rounded-full bg-cb-peach py-3 text-sm font-semibold text-cb-terracotta-deep"
            >
              <RotateCcw className="h-4 w-4" />
              Reorder
            </button>
            <Link
              href={`/orders/${order.id}/invoice`}
              target="_blank"
              className="flex-1 flex items-center justify-center gap-2 rounded-full border border-cb-border py-3 text-sm font-semibold text-cb-fg"
            >
              <Download className="h-4 w-4" />
              Invoice
            </Link>
          </div>
        </div>

        {order.tracking_number && <ShipmentTrackingSection orderId={order.id} waybill={order.tracking_number} />}
      </div>
    </div>
  );
}
