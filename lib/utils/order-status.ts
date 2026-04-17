import type { OrderStatus } from "@/lib/types/order";

/**
 * Tailwind pill classes for order status badges.
 *
 * Shared by every surface that renders order status: customer-facing orders
 * list (`app/orders/page.tsx`), admin on-behalf orders list
 * (`app/admin/on-behalf-orders/on-behalf-orders-client.tsx`), and any future
 * order-detail views. Keeping a single map prevents drift between admin and
 * customer-facing UI.
 */
export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  payment_pending: "bg-orange-100 text-orange-800",
  verifying_payment: "bg-amber-100 text-amber-800",
  payment_confirmed: "bg-blue-100 text-blue-800",
  processing: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-800",
};

const FALLBACK_STATUS_COLOR = "bg-gray-100 text-gray-800";

/**
 * Returns the badge class for a status. Accepts plain strings so callers
 * working against loosely-typed API responses don't need a cast.
 */
export function getOrderStatusColor(status: string): string {
  return ORDER_STATUS_COLORS[status as OrderStatus] ?? FALLBACK_STATUS_COLOR;
}

/**
 * Format a snake_case status into a human-friendly label
 * (e.g. `payment_pending` → `Payment Pending`).
 */
export function formatOrderStatus(status: string): string {
  return status
    .split("_")
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}
