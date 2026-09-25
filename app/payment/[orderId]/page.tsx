"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Check,
  Clock,
  AlertCircle,
  Loader2,
  Wallet,
  MessageCircle,
  Copy,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/supabase-auth-provider";
import { useCart } from "@/components/cart-context";
import { UPI_ID, UPI_PHONE_NUMBER } from "@/lib/constants";
import { SOCIAL_CONTACTS } from "@/lib/constants/social";
import type { Order } from "@/lib/types/order";
import { toast } from "sonner";

interface UpiLinks {
  general: string;
  phonepe: string;
  gpay: string;
  paytm: string;
}

const STATUS_LABEL: Record<string, string> = {
  payment_pending: "Awaiting payment",
  verifying_payment: "Verifying payment",
  payment_confirmed: "Payment confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
  ready_for_pickup: "Ready for pickup",
  collected: "Collected",
};

export default function PaymentPage() {
  const { user, loading, impersonation } = useAuth();
  const { clearCart } = useCart();
  const router = useRouter();
  const params = useParams();
  const orderId = params?.orderId as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [upiLinks, setUpiLinks] = useState<UpiLinks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderLoading, setOrderLoading] = useState(true);
  const [recordingCash, setRecordingCash] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }

    if (user && orderId) {
      fetchOrderAndLinks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, orderId]);

  const fetchOrderAndLinks = async () => {
    try {
      setOrderLoading(true);

      const orderRes = await fetch(`/api/orders/${orderId}`);
      if (!orderRes.ok) throw new Error("Failed to fetch order");
      const orderData = await orderRes.json();
      setOrder(orderData.order);

      // Cart is only cleared once the order actually exists — it does, now.
      clearCart();

      if (orderData.order.status === "payment_pending") {
        const linksRes = await fetch(`/api/payments/upi-links?orderId=${orderId}`);
        if (linksRes.ok) {
          const linksData = await linksRes.json();
          setUpiLinks(linksData.links);
        }
      }
    } catch (err) {
      console.error("Error fetching order:", err);
      setError("Failed to load order details");
    } finally {
      setOrderLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Failed to copy. Please copy manually.");
    }
  };

  const recordCash = async () => {
    setRecordingCash(true);
    try {
      const res = await fetch("/api/payments/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Could not record the cash payment");
        return;
      }
      toast.success("Cash recorded — confirm it on Telegram");
      await fetchOrderAndLinks();
    } catch {
      toast.error("Network error — check the connection and try again");
    } finally {
      setRecordingCash(false);
    }
  };

  if (loading || orderLoading) {
    return (
      <div className="min-h-screen bg-cb-linen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cb-terracotta" />
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="min-h-screen bg-cb-linen">
        <div className="container mx-auto px-4 py-20 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-light text-cb-fg mb-4">Error</h1>
          <p className="text-cb-muted-fg mb-8">{error}</p>
          <Button asChild className="rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white">
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const isAwaitingPayment = order.status === "payment_pending";
  const whatsappMessage = encodeURIComponent(
    `Hi CozyBerries, I've paid for order ${order.order_number} (₹${order.total_amount.toFixed(0)}). Sharing my payment screenshot.`
  );
  const whatsappHref = `https://wa.me/${SOCIAL_CONTACTS.WHATSAPP_NUMBER_CLEAN}?text=${whatsappMessage}`;

  return (
    <div className="min-h-screen bg-cb-linen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-cb-peach mx-auto mb-6">
          <Check className="h-10 w-10 text-cb-terracotta-deep" />
        </div>

        <h1 className="text-3xl font-light text-cb-fg mb-3">
          {isAwaitingPayment ? "Order placed!" : "Order update"}
        </h1>

        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="rounded-full bg-cb-linen border border-cb-border px-3 py-1 text-sm font-bold text-cb-fg">
            {order.order_number}
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-cb-peach px-3 py-1 text-sm font-semibold text-cb-terracotta-deep">
            {isAwaitingPayment && <Clock className="h-3.5 w-3.5" />}
            {STATUS_LABEL[order.status] ?? order.status}
          </span>
        </div>

        {isAwaitingPayment ? (
          <>
            <p className="text-cb-muted-fg mb-6">
              Your order is held for you. Pay <span className="font-bold text-cb-fg">₹{order.total_amount.toFixed(0)}</span>{" "}
              from any UPI app and we&apos;ll confirm it within a few hours.
            </p>

            <div className="space-y-3 mb-4">
              {impersonation.active && (
                <Button
                  className="w-full h-12 rounded-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
                  disabled={recordingCash}
                  onClick={recordCash}
                >
                  {recordingCash ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                  Received cash ₹{order.total_amount.toFixed(0)}
                </Button>
              )}
              <Button
                className="w-full h-12 rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white gap-2"
                disabled={!upiLinks}
                onClick={() => {
                  if (upiLinks) window.location.href = upiLinks.general;
                }}
              >
                <Wallet className="h-4 w-4" />
                Pay ₹{order.total_amount.toFixed(0)} via UPI app
              </Button>

              <Button asChild variant="outline" className="w-full h-12 rounded-full bg-cb-peach/60 border-none text-cb-terracotta-deep gap-2">
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  Send screenshot on WhatsApp
                </a>
              </Button>
            </div>

            <div className="rounded-2xl bg-white border border-cb-border p-4 space-y-3 text-left mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cb-linen text-cb-terracotta-deep font-bold">
                    ₹
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-cb-muted-fg">UPI ID</p>
                    <p className="font-bold text-cb-fg truncate">{UPI_ID}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(UPI_ID)}
                  className="flex items-center gap-1 text-sm font-semibold text-cb-terracotta-deep shrink-0"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cb-linen text-cb-terracotta-deep">
                    <Phone className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-cb-muted-fg">Phone (UPI / call)</p>
                    <p className="font-bold text-cb-fg truncate">{UPI_PHONE_NUMBER}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(UPI_PHONE_NUMBER)}
                  className="flex items-center gap-1 text-sm font-semibold text-cb-terracotta-deep shrink-0"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="text-cb-muted-fg mb-6">
            {order.fulfilment_method === "pickup"
              ? "Thanks! We'll message you on WhatsApp when it's ready to collect at our stall."
              : "Thanks for your order — we're taking it from here. You can track its progress anytime in My Orders."}
          </p>
        )}

        <p className="text-sm text-cb-muted-fg mb-6">
          Track the status anytime in{" "}
          <Link href={`/orders/${order.id}`} className="font-semibold text-cb-terracotta-deep hover:underline">
            My Orders
          </Link>
          .
        </p>

        <Button asChild variant="outline" className="rounded-full border-cb-border">
          <Link href="/products">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}
