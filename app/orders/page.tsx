"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ShoppingBag,
  Calendar,
  CreditCard,
  Truck,
  Package,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
  Filter,
  Search,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/components/supabase-auth-provider";
import { orderService } from "@/lib/services/orders";
import type { Order, OrderStatus } from "@/lib/types/order";

const statusIcons: Record<OrderStatus, React.ReactNode> = {
  payment_pending: <Clock className="w-4 h-4 text-orange-500" />,
  payment_confirmed: <CreditCard className="w-4 h-4 text-blue-500" />,
  processing: <Package className="w-4 h-4 text-blue-500" />,
  shipped: <Truck className="w-4 h-4 text-purple-500" />,
  delivered: <CheckCircle className="w-4 h-4 text-green-500" />,
  cancelled: <XCircle className="w-4 h-4 text-red-500" />,
  refunded: <XCircle className="w-4 h-4 text-gray-500" />,
};

const statusColors: Record<OrderStatus, string> = {
  payment_pending: "bg-orange-100 text-orange-800",
  payment_confirmed: "bg-blue-100 text-blue-800",
  processing: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-800",
};

export default function OrdersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [authTimeout, setAuthTimeout] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedOrders = await orderService.getUserOrders({ limit: 50 });
      setOrders(fetchedOrders);
    } catch (err) {
      console.error("Error fetching orders:", err);
      setError("Failed to load orders. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Add authentication timeout to prevent infinite loading
  useEffect(() => {
    const authTimeoutId = setTimeout(() => {
      if (loading) {
        setAuthTimeout(true);
        setIsLoading(false);
      }
    }, 10000); // 10 second timeout for auth

    return () => clearTimeout(authTimeoutId);
  }, [loading]);

  useEffect(() => {
    if (!loading && !user && !authTimeout) {
      router.push("/login");
      return;
    }

    if (user && !authTimeout) {
      fetchOrders();
    }
  }, [user, loading, router, fetchOrders, authTimeout]);

  useEffect(() => {
    filterOrders();
  }, [orders, statusFilter, searchQuery]);

  const filterOrders = () => {
    let filtered = orders;

    // Filter by status
    if (statusFilter !== "all") {
      filtered = filtered.filter((order) => order.status === statusFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.order_number.toLowerCase().includes(query) ||
          order.items.some((item) => item.name.toLowerCase().includes(query))
      );
    }

    setFilteredOrders(filtered);
  };

  const handlePayNow = (orderId: string) => {
    router.push(`/payment/${orderId}`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if ((loading && !authTimeout) || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
              <p>Loading your orders...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (authTimeout) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-20">
            <AlertCircle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              Authentication Timeout
            </h2>
            <p className="text-muted-foreground mb-4">
              Authentication is taking longer than expected. Please try
              refreshing the page or logging in again.
            </p>
            <div className="flex gap-4 justify-center">
              <Button onClick={() => window.location.reload()}>
                Refresh Page
              </Button>
              <Button variant="outline" asChild>
                <Link href="/login">Login Again</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-20">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error Loading Orders</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={fetchOrders}>Try Again</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4 sm:py-8">
        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
          <ShoppingBag className="w-6 h-6 sm:w-8 sm:h-8" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-light">My Orders</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Track and manage your orders
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10 sm:h-11"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent h-10 sm:h-11"
            >
              <option value="all">All Orders</option>
              <option value="payment_pending">Payment Pending</option>
              <option value="payment_confirmed">Payment Confirmed</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
        </div>

        {/* Orders List */}
        {filteredOrders.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {orders.length === 0 ? "No Orders Yet" : "No Orders Found"}
            </h2>
            <p className="text-muted-foreground mb-4">
              {orders.length === 0
                ? "You haven't placed any orders yet. Start shopping to see your orders here."
                : "No orders match your current filters. Try adjusting your search or filter criteria."}
            </p>
            {orders.length === 0 && (
              <Button asChild>
                <Link href="/products">Start Shopping</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6"
              >
                {/* Order Header */}
                <div className="flex flex-col gap-3 mb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base sm:text-lg truncate">
                        Order #{order.order_number}
                      </h3>
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground mt-1">
                        <Calendar className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="truncate">{formatDate(order.created_at)}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className="font-semibold text-sm sm:text-base">
                        ₹{order.total_amount.toFixed(2)}
                      </div>
                      <div className="text-xs sm:text-sm text-muted-foreground">
                        {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div
                      className={`inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
                        statusColors[order.status]
                      }`}
                    >
                      {statusIcons[order.status]}
                      <span className="truncate">{orderService.formatOrderStatus(order.status)}</span>
                    </div>
                  </div>
                </div>

                {/* Order Items */}
                <div className="space-y-2 sm:space-y-3 mb-4">
                  {order.items.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex items-center gap-2 sm:gap-3">
                      <div className="relative w-10 h-10 sm:w-12 sm:h-12 bg-muted rounded-md overflow-hidden flex-shrink-0">
                        {item.image && (
                          <Image
                            src={item.image}
                            alt={item.name}
                            fill
                            className="object-cover"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs sm:text-sm truncate">{item.name}</h4>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          Qty: {item.quantity} × ₹{item.price.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-xs sm:text-sm font-medium flex-shrink-0">
                        ₹{(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <p className="text-xs sm:text-sm text-muted-foreground pl-12 sm:pl-15">
                      +{order.items.length - 3} more item
                      {order.items.length - 3 !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>

                <Separator className="my-4" />

                {/* Order Actions */}
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    {order.tracking_number && (
                      <div className="text-xs sm:text-sm">
                        <span className="text-muted-foreground">Tracking: </span>
                        <span className="font-medium break-all">{order.tracking_number}</span>
                      </div>
                    )}
                    {order.estimated_delivery_date && (
                      <div className="text-xs sm:text-sm">
                        <span className="text-muted-foreground">Est. Delivery: </span>
                        <span className="font-medium">
                          {new Date(order.estimated_delivery_date).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
                    {order.status === "payment_pending" && (
                      <Button
                        onClick={() => handlePayNow(order.id)}
                        className="flex items-center justify-center gap-2 h-9 sm:h-10 text-sm"
                        size="sm"
                      >
                        <CreditCard className="w-4 h-4" />
                        Pay Now
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      asChild
                      className="flex items-center justify-center gap-2 h-9 sm:h-10 text-sm"
                      size="sm"
                    >
                      <Link href={`/orders/${order.id}`}>
                        View Details
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* Shipping Address Preview */}
                <div className="mt-4 p-3 bg-muted/30 rounded-md">
                  <h5 className="font-medium text-xs sm:text-sm mb-1">Shipping Address</h5>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {order.shipping_address.full_name} • {order.shipping_address.city}, {order.shipping_address.state}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More Button (for future pagination) */}
        {filteredOrders.length > 0 &&
          filteredOrders.length === orders.length &&
          orders.length >= 50 && (
            <div className="text-center mt-8">
              <Button variant="outline" onClick={fetchOrders}>
                Load More Orders
              </Button>
            </div>
          )}
      </div>
    </div>
  );
}
