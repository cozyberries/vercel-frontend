"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ShoppingBag,
  Calendar,
  CreditCard,
  Truck,
  Package,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  Phone,
  Mail,
  Copy,
  ExternalLink,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/components/supabase-auth-provider";
import { orderService } from "@/lib/services/orders";
import { toImageSrc } from "@/lib/utils/image";
import type {
  Order,
  Payment,
  OrderStatus,
  PaymentStatus,
} from "@/lib/types/order";

const statusIcons: Record<OrderStatus, React.ReactNode> = {
  payment_pending: <Clock className="w-5 h-5 text-orange-500" />,
  payment_confirmed: <CreditCard className="w-5 h-5 text-blue-500" />,
  processing: <Package className="w-5 h-5 text-blue-500" />,
  shipped: <Truck className="w-5 h-5 text-purple-500" />,
  delivered: <CheckCircle className="w-5 h-5 text-green-500" />,
  cancelled: <XCircle className="w-5 h-5 text-red-500" />,
  refunded: <XCircle className="w-5 h-5 text-gray-500" />,
};

const paymentStatusColors: Record<PaymentStatus, string> = {
  pending: "bg-orange-100 text-orange-800",
  processing: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
  refunded: "bg-gray-100 text-gray-800",
  partially_refunded: "bg-yellow-100 text-yellow-800",
};

export default function OrderDetailsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }

    if (user && orderId) {
      fetchOrderDetails();
    }
  }, [user, loading, orderId, router]);

  const fetchOrderDetails = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await orderService.getOrder(orderId);
      setOrder(data.order);
      setPayments(data.payments);
    } catch (err) {
      console.error("Error fetching order details:", err);
      setError("Failed to load order details. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePayNow = () => {
    if (order) {
      router.push(`/payment/${order.id}`);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
              <p>Loading order details...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-20">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error Loading Order</h2>
            <p className="text-muted-foreground mb-4">
              {error || "Order not found"}
            </p>
            <div className="flex gap-4 justify-center">
              <Button onClick={fetchOrderDetails}>Try Again</Button>
              <Button variant="outline" asChild>
                <Link href="/orders">Back to Orders</Link>
              </Button>
            </div>
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
          <Button variant="ghost" size="sm" asChild>
            <Link href="/orders" className="flex items-center gap-2 text-sm">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Orders</span>
              <span className="sm:hidden">Back</span>
            </Link>
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-light">Order Details</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Order #{order.order_number}
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Order Status */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
                <h2 className="text-base sm:text-lg font-semibold">
                  Order Status
                </h2>
                {order.status === "payment_pending" && (
                  <Button
                    onClick={handlePayNow}
                    className="flex items-center justify-center gap-2 h-9 sm:h-10 text-sm"
                    size="sm"
                  >
                    <CreditCard className="w-4 h-4" />
                    Pay Now
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2 sm:gap-3 mb-4">
                {statusIcons[order.status]}
                <div>
                  <div className="font-medium text-sm sm:text-base">
                    {orderService.formatOrderStatus(order.status)}
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground">
                    Last updated: {formatDate(order.updated_at)}
                  </div>
                </div>
              </div>

              {order.tracking_number && (
                <div className="bg-muted/30 p-3 sm:p-4 rounded-md">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs sm:text-sm">
                        Tracking Number
                      </div>
                      <div className="text-sm sm:text-lg font-mono break-all">
                        {order.tracking_number}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(order.tracking_number!)}
                      className="flex-shrink-0 h-8 sm:h-9"
                    >
                      <Copy className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {order.estimated_delivery_date && (
                <div className="mt-4">
                  <div className="text-xs sm:text-sm text-muted-foreground">
                    Estimated Delivery
                  </div>
                  <div className="font-medium text-sm sm:text-base">
                    {new Date(order.estimated_delivery_date).toLocaleDateString(
                      "en-US",
                      {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      }
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Order Items */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-semibold mb-4">
                Order Items
              </h2>
              <div className="space-y-3 sm:space-y-4">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 sm:gap-4"
                  >
                    <div className="relative w-12 h-12 sm:w-16 sm:h-16 bg-muted rounded-md overflow-hidden flex-shrink-0">
                      {item.image && (
                        <Image
                          src={toImageSrc(item.image)}
                          alt={item.name}
                          fill
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm sm:text-base truncate">
                        {item.name}
                      </h3>
                      <div className="text-xs sm:text-sm text-muted-foreground">
                        Quantity: {item.quantity}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-medium text-sm sm:text-base">
                        ₹{(item.price * item.quantity).toFixed(2)}
                      </div>
                      <div className="text-xs sm:text-sm text-muted-foreground">
                        ₹{item.price.toFixed(2)} each
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Information */}
            {payments.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold mb-4">
                  Payment History
                </h2>
                <div className="space-y-3 sm:space-y-4">
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="border border-gray-100 rounded-lg p-3 sm:p-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 mb-2">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <div
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              paymentStatusColors[payment.status]
                            }`}
                          >
                            {orderService.formatPaymentStatus(payment.status)}
                          </div>
                          <span className="text-xs sm:text-sm text-muted-foreground">
                            {payment.payment_method
                              .replace("_", " ")
                              .toUpperCase()}
                          </span>
                        </div>
                        <div className="text-base sm:text-lg font-semibold">
                          ₹{payment.amount.toFixed(2)}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
                        <div>
                          <span className="text-muted-foreground">
                            Payment ID:{" "}
                          </span>
                          <span className="font-mono break-all">
                            {payment.internal_reference}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Gateway:{" "}
                          </span>
                          <span className="capitalize">
                            {payment.gateway_provider}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Date: </span>
                          <span>{formatDate(payment.created_at)}</span>
                        </div>
                        {payment.completed_at && (
                          <div>
                            <span className="text-muted-foreground">
                              Completed:{" "}
                            </span>
                            <span>{formatDate(payment.completed_at)}</span>
                          </div>
                        )}
                      </div>

                      {payment.failure_reason && (
                        <div className="mt-2 text-xs sm:text-sm text-red-600">
                          <span className="font-medium">Failure Reason: </span>
                          {payment.failure_reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Order Notes */}
            {order.notes && (
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold mb-4">
                  Order Notes
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground">
                  {order.notes}
                </p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4 sm:space-y-6">
            {/* Order Summary */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-semibold mb-4">
                Order Summary
              </h2>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span>Subtotal</span>
                  <span>₹{order.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span>Delivery</span>
                  <span>₹{order.delivery_charge.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span>
                    {order.subtotal > 0 && order.tax_amount != null
                      ? `GST (${((order.tax_amount / order.subtotal) * 100).toFixed(1)}%)`
                      : "GST"}
                  </span>
                  <span>₹{order.tax_amount.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold text-sm sm:text-base">
                  <span>Total</span>
                  <span>₹{order.total_amount.toFixed(2)}</span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                <div>Order placed: {formatDate(order.created_at)}</div>
                <div>Payment currency: {order.currency}</div>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-semibold mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Shipping Address
              </h2>

              <div className="space-y-2 text-xs sm:text-sm">
                <div className="font-medium">
                  {order.shipping_address.full_name}
                </div>
                <div>{order.shipping_address.address_line_1}</div>
                {order.shipping_address.address_line_2 && (
                  <div>{order.shipping_address.address_line_2}</div>
                )}
                <div>
                  {order.shipping_address.city}, {order.shipping_address.state}{" "}
                  {order.shipping_address.postal_code}
                </div>
                <div>{order.shipping_address.country}</div>
                {order.shipping_address.phone && (
                  <div className="flex items-center gap-2 mt-2">
                    <Phone className="w-3 h-3" />
                    <span>{order.shipping_address.phone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Billing Address */}
            {order.billing_address && (
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold mb-4">
                  Billing Address
                </h2>

                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="font-medium">
                    {order.billing_address.full_name}
                  </div>
                  <div>{order.billing_address.address_line_1}</div>
                  {order.billing_address.address_line_2 && (
                    <div>{order.billing_address.address_line_2}</div>
                  )}
                  <div>
                    {order.billing_address.city}, {order.billing_address.state}{" "}
                    {order.billing_address.postal_code}
                  </div>
                  <div>{order.billing_address.country}</div>
                  {order.billing_address.phone && (
                    <div className="flex items-center gap-2 mt-2">
                      <Phone className="w-3 h-3" />
                      <span>{order.billing_address.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Customer Information */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-semibold mb-4">
                Customer Information
              </h2>

              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="w-3 h-3" />
                  <span className="break-all">{order.customer_email}</span>
                </div>
                {order.customer_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3" />
                    <span>{order.customer_phone}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
