"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import SupabaseImage from "@/components/ui/supabase-image";
import Link from "next/link";
import {
  Package,
  Clock,
  CheckCircle,
  Truck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Star,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useAuth } from "@/components/supabase-auth-provider";
import { orderService } from "@/lib/services/orders";
import type { Order } from "@/lib/types/order";
import { getOrderStageInfo, type OrderStageKey } from "@/lib/utils/order-stage";
import { useReorder } from "@/hooks/useReorder";
import RatingForm from "@/components/rating/RatingForm";
import { useRating } from "@/components/rating-context";
import { sendNotification } from "@/lib/utils/notify";
import { sendActivity } from "@/lib/utils/activities";
import { toast } from "sonner";
import { SOCIAL_CONTACTS } from "@/lib/constants/social";

interface RatingFormData {
  user_id: string;
  product_slug: string;
  rating: number;
  comment: string;
  imageFiles?: File[];
}

const STAGE_ICON: Record<OrderStageKey, typeof Clock> = {
  order_placed: Clock,
  payment_confirmed: CheckCircle,
  packed: Package,
  shipped: Package,
  out_for_delivery: Truck,
  delivered: CheckCircle,
  cancelled: Clock,
  refunded: Clock,
};

function formatPlacedDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export default function OrdersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const isMountedRef = useRef(true);
  const fetchingRef = useRef(false);
  const reorder = useReorder();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<"all" | "active" | "delivered">("all");
  const [authTimeout, setAuthTimeout] = useState(false);
  const [hasInitialFetch, setHasInitialFetch] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [hasMoreOrders, setHasMoreOrders] = useState(true);
  const { reviews, fetchReviews, setProductSlug } = useRating();

  const fetchOrders = useCallback(async (offset = 0, append = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const fetchedOrders = await orderService.getUserOrders({ limit: 50, offset });
      if (append) {
        setOrders((prev) => {
          const existingIds = new Set(prev.map((o) => o.id));
          const newOrders = fetchedOrders.filter((o) => !existingIds.has(o.id));
          return [...prev, ...newOrders];
        });
      } else {
        setOrders(fetchedOrders);
        setHasInitialFetch(true);
      }
      setHasMoreOrders(fetchedOrders.length === 50);
      setCurrentOffset(offset + fetchedOrders.length);
      setIsLoading(false);
    } catch (err) {
      console.error("Error fetching orders:", err);
      setError("Failed to load orders. Please try again.");
      setIsLoading(false);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const authTimeoutId = setTimeout(() => {
      if (loading && isMountedRef.current) {
        setAuthTimeout(true);
        setIsLoading(false);
      }
    }, 6000);
    return () => clearTimeout(authTimeoutId);
  }, [loading]);

  useEffect(() => {
    if (user && !hasInitialFetch) {
      fetchOrders();
    }
  }, [user, hasInitialFetch, fetchOrders]);

  const filteredOrders =
    statusTab === "delivered"
      ? orders.filter((o) => o.status === "delivered")
      : statusTab === "active"
        ? orders.filter((o) => !["delivered", "cancelled", "refunded"].includes(o.status))
        : orders;

  const isProductRated = useCallback(
    (productId: string) => reviews.some((review) => review.product_slug === productId && review.user_id === user?.id),
    [reviews, user]
  );

  const handleSubmitRating = async (data: RatingFormData) => {
    try {
      const formData = new FormData();
      formData.append("user_id", data.user_id);
      formData.append("product_slug", data.product_slug);
      formData.append("rating", String(data.rating));
      if (data.comment) formData.append("comment", data.comment);
      if (data.imageFiles?.length) {
        for (const file of data.imageFiles) formData.append("images", file);
      }
      const response = await fetch("/api/ratings", { method: "POST", body: formData });
      if (response.ok) {
        setShowForm(false);
        await fetchReviews();
        await sendNotification("Rating Submitted", `User ${user?.id ?? "unknown"} submitted a rating for #${data.product_slug}`, "success");
        await sendActivity("rating_submission_success", `User ${user?.id ?? "unknown"} submitted a rating for #${data.product_slug}`, data.product_slug);
        toast.success("Rating submitted successfully");
      } else {
        toast.error("Failed to submit rating");
        await sendActivity("rating_submission_failed", `User ${user?.id ?? "unknown"} failed to submit a rating for #${data.product_slug}`, data.product_slug);
      }
    } catch (error) {
      console.error("Error submitting rating:", error);
    }
  };

  if ((loading && !user && !authTimeout) || (isLoading && user)) {
    return (
      <div className="min-h-screen bg-cb-linen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cb-terracotta" />
      </div>
    );
  }

  if (authTimeout && !user) {
    return (
      <div className="min-h-screen bg-cb-linen">
        <div className="container mx-auto px-4 py-20 text-center">
          <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-cb-fg mb-2">Authentication Timeout</h2>
          <p className="text-cb-muted-fg mb-4">Please try refreshing the page or logging in again.</p>
          <div className="flex gap-4 justify-center">
            <Button onClick={() => window.location.reload()} className="rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white">
              Refresh Page
            </Button>
            <Button variant="outline" asChild className="rounded-full border-cb-border">
              <Link href="/login">Login Again</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-cb-linen">
        <div className="container mx-auto px-4 py-20 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-cb-fg mb-2">Error Loading Orders</h2>
          <p className="text-cb-muted-fg mb-4">{error}</p>
          <Button
            className="rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white"
            onClick={() => {
              setCurrentOffset(0);
              setHasMoreOrders(true);
              fetchOrders(0, false);
            }}
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (showForm) {
    return <RatingForm onSubmitRating={handleSubmitRating} onCancel={() => setShowForm(false)} redirectTo="/orders" />;
  }

  return (
    <div className="min-h-screen bg-cb-linen">
      <div className="bg-white border-b border-cb-border">
        <div className="container mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => router.back()} aria-label="Go back" className="text-cb-fg">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-cb-fg">My Orders</h1>
          </div>
          <a
            href={`https://wa.me/${SOCIAL_CONTACTS.WHATSAPP_NUMBER_CLEAN}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-cb-peach px-3 py-1.5 text-sm font-semibold text-cb-terracotta-deep"
          >
            Help
          </a>
        </div>
      </div>

      <div className="container mx-auto max-w-2xl px-4 py-4">
        {user && (
          <div className="flex gap-2 mb-4">
            {(["all", "active", "delivered"] as const).map((tab) => (
              <Chip key={tab} active={statusTab === tab} onClick={() => setStatusTab(tab)}>
                {tab === "all" ? "All" : tab === "active" ? "Active" : "Delivered"}
              </Chip>
            ))}
          </div>
        )}

        {!user && !loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-5 flex h-[70px] w-[70px] items-center justify-center rounded-full bg-white">
              <Package className="h-7 w-7 text-cb-fg" />
            </div>
            <h2 className="text-lg font-semibold text-cb-fg mb-2">Log in to see your orders</h2>
            <p className="text-sm text-cb-muted-fg mb-6 max-w-[280px]">Track and manage your orders once you&apos;re logged in.</p>
            <Button asChild className="rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white h-12 px-6 text-[15px] font-semibold">
              <Link href="/login?redirect=/orders">Log in or sign up</Link>
            </Button>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-5 flex h-[70px] w-[70px] items-center justify-center rounded-full bg-white">
              <Package className="h-7 w-7 text-cb-fg" />
            </div>
            <h2 className="text-lg font-semibold text-cb-fg mb-2">
              {orders.length === 0 ? `No ${statusTab === "all" ? "" : statusTab + " "}orders here yet.` : "No orders in this tab"}
            </h2>
            <p className="text-sm text-cb-muted-fg mb-6 max-w-[280px]">
              {orders.length === 0 ? "Start shopping to see your orders here." : "Try a different tab."}
            </p>
            {orders.length === 0 && (
              <Button asChild className="rounded-full bg-cb-peach text-cb-terracotta-deep hover:bg-cb-mauve-tint h-12 px-6 text-[15px] font-semibold">
                <Link href="/products">Browse products</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) =>
              statusTab === "delivered" ? (
                <DeliveredOrderCard
                  key={order.id}
                  order={order}
                  isProductRated={isProductRated}
                  onRate={(productSlug) => {
                    setShowForm(true);
                    setProductSlug(productSlug);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  onReorder={() => reorder(order.items)}
                />
              ) : (
                <CompactOrderRow key={order.id} order={order} />
              )
            )}
          </div>
        )}

        {filteredOrders.length > 0 && filteredOrders.length === orders.length && hasMoreOrders && (
          <div className="text-center mt-8">
            <Button variant="outline" className="rounded-full border-cb-border" onClick={() => fetchOrders(currentOffset, true)} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load More Orders"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function CompactOrderRow({ order }: { order: Order }) {
  const stage = getOrderStageInfo(order.status);
  const Icon = STAGE_ICON[stage.key];
  return (
    <Link href={`/orders/${order.id}`} className="block bg-white rounded-2xl border border-cb-border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0 break-words">
          <p className="font-bold text-cb-fg text-sm sm:text-base">{order.order_number}</p>
          <p className="text-sm text-cb-muted-fg">Placed {formatPlacedDate(order.created_at)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${stage.pillClass}`}>
            <Icon className="h-3.5 w-3.5" />
            {stage.label}
          </span>
          <ChevronRight className="h-4 w-4 text-cb-muted-fg" />
        </div>
      </div>
    </Link>
  );
}

function DeliveredOrderCard({
  order,
  isProductRated,
  onRate,
  onReorder,
}: {
  order: Order;
  isProductRated: (productId: string) => boolean;
  onRate: (productSlug: string) => void;
  onReorder: () => void;
}) {
  const stage = getOrderStageInfo(order.status);
  const Icon = STAGE_ICON[stage.key];
  return (
    <div className="bg-white rounded-2xl border border-cb-border overflow-hidden">
      <Link href={`/orders/${order.id}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0 break-words">
          <p className="font-bold text-cb-fg text-sm sm:text-base">{order.order_number}</p>
          <p className="text-sm text-cb-muted-fg">Placed {formatPlacedDate(order.created_at)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${stage.pillClass}`}>
            <Icon className="h-3.5 w-3.5" />
            {stage.label}
          </span>
          <ChevronRight className="h-4 w-4 text-cb-muted-fg" />
        </div>
      </Link>

      <div className="px-4 pb-3 space-y-3 border-t border-cb-border pt-3">
        {order.items.map((item, idx) => (
          <div key={`${item.id}-${item.size ?? ""}-${idx}`} className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-cb-linen">
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

        {order.actual_delivery_date && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-cb-success">
            <CheckCircle className="h-4 w-4" />
            Delivered on {formatShortDate(order.actual_delivery_date)}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cb-border bg-cb-linen px-4 py-3">
        <p className="text-sm text-cb-muted-fg">
          {order.items.length} item{order.items.length === 1 ? "" : "s"} · Total <span className="font-bold text-cb-fg">₹{order.total_amount.toFixed(0)}</span>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {order.items.length > 0 && (
            <button
              type="button"
              onClick={() => onRate(order.items[0].id)}
              disabled={isProductRated(order.items[0].id)}
              className="flex items-center gap-1 text-sm font-semibold text-cb-terracotta-deep disabled:opacity-50"
            >
              <Star className="h-3.5 w-3.5" />
              {isProductRated(order.items[0].id) ? "Rated" : "Rate"}
            </button>
          )}
          <button
            type="button"
            onClick={onReorder}
            className="flex items-center gap-1.5 rounded-full bg-cb-peach px-3 py-1.5 text-sm font-semibold text-cb-terracotta-deep"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reorder
          </button>
        </div>
      </div>
    </div>
  );
}
