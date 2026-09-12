"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, Printer } from "lucide-react";
import { useAuth } from "@/components/supabase-auth-provider";
import { orderService } from "@/lib/services/orders";
import { SOCIAL_CONTACTS } from "@/lib/constants/social";
import type { Order } from "@/lib/types/order";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export default function InvoicePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }
    if (user && orderId) {
      orderService
        .getOrder(orderId)
        .then((data) => setOrder(data.order))
        .catch((err) => {
          console.error("Error fetching order for invoice:", err);
          setError("Failed to load order details.");
        })
        .finally(() => setIsLoading(false));
    }
  }, [user, loading, orderId, router]);

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cb-terracotta" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-cb-muted-fg mb-4">{error || "Order not found"}</p>
          <Link href="/orders" className="text-cb-terracotta-deep font-semibold hover:underline">
            Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-cb-border bg-cb-linen px-4 py-3">
        <Link href={`/orders/${order.id}`} className="text-sm font-semibold text-cb-fg">
          ← Back to order
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-full bg-cb-terracotta px-4 py-2 text-sm font-semibold text-white"
        >
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </button>
      </div>

      <div className="mx-auto max-w-2xl px-8 py-10">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">CozyBerries</h1>
            <p className="text-sm text-gray-500">{SOCIAL_CONTACTS.EMAIL}</p>
            <p className="text-sm text-gray-500">{SOCIAL_CONTACTS.WHATSAPP_NUMBER}</p>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold text-gray-900">Invoice</h2>
            <p className="text-sm text-gray-500">{order.order_number}</p>
            <p className="text-sm text-gray-500">{formatDate(order.created_at)}</p>
          </div>
        </div>

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Billed to</p>
          <p className="text-sm font-semibold text-gray-900">{order.shipping_address.full_name}</p>
          <p className="text-sm text-gray-600">
            {[order.shipping_address.address_line_1, order.shipping_address.area].filter(Boolean).join(", ")}
          </p>
          <p className="text-sm text-gray-600">
            {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}
          </p>
          <p className="text-sm text-gray-600">{order.shipping_address.country}</p>
        </div>

        <table className="w-full text-sm mb-8">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 font-medium">Item</th>
              <th className="py-2 font-medium text-center">Qty</th>
              <th className="py-2 font-medium text-right">Price</th>
              <th className="py-2 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, idx) => (
              <tr key={`${item.id}-${item.size ?? ""}-${idx}`} className="border-b border-gray-100">
                <td className="py-2 text-gray-900">
                  {item.name}
                  {(item.size || item.color) && (
                    <span className="block text-xs text-gray-500">
                      {[item.color, item.size && `Size ${item.size}`].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </td>
                <td className="py-2 text-center text-gray-600">{item.quantity}</td>
                <td className="py-2 text-right text-gray-600">₹{item.price.toFixed(0)}</td>
                <td className="py-2 text-right font-medium text-gray-900">₹{(item.price * item.quantity).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-10">
          <div className="w-56 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-900">₹{order.subtotal.toFixed(0)}</span>
            </div>
            {order.discount_code && (order.discount_amount ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Discount ({order.discount_code})</span>
                <span className="text-gray-900">−₹{(order.discount_amount ?? 0).toFixed(0)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Delivery</span>
              <span className="text-gray-900">{order.delivery_charge === 0 ? "Free" : `₹${order.delivery_charge.toFixed(0)}`}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1.5 font-bold text-gray-900">
              <span>Total</span>
              <span>₹{order.total_amount.toFixed(0)}</span>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400">Thank you for shopping with CozyBerries.</p>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
      `}</style>
    </div>
  );
}
