import type { OrderStatus } from "@/lib/types/order";

/**
 * Customer-facing order journey display — distinct from ORDER_STATUS_COLORS
 * (lib/utils/order-status.ts), which is the admin/customer-shared status
 * badge map. This one encodes the richer 6-step journey shown on the
 * orders list and detail pages (icon, label, pill color, stepper index).
 *
 * `shipped` is a single OrderStatus value but the design distinguishes
 * "Shipped" from "Out for delivery" — that split only exists in the
 * carrier's own tracking text (Delhivery), so callers with real tracking
 * data (the detail page) can pass `trackingCurrentStatus` to refine it.
 * List views don't fetch live tracking per-row (would be N carrier calls),
 * so they show "Shipped" for the whole in-transit window — an accepted,
 * non-fabricated simplification.
 */

export type OrderStageKey =
  | "order_placed"
  | "payment_confirmed"
  | "packed"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "refunded";

export interface OrderStageInfo {
  key: OrderStageKey;
  label: string;
  /** Tailwind classes for the small pill badge (bg + text). */
  pillClass: string;
  /** 0-based index into STEPPER_STEPS, or null when the order isn't on the happy path (cancelled/refunded). */
  stepIndex: number | null;
}

export const STEPPER_STEPS: { key: OrderStageKey; label: string }[] = [
  { key: "order_placed", label: "Order placed" },
  { key: "payment_confirmed", label: "Payment confirmed" },
  { key: "packed", label: "Packed" },
  { key: "shipped", label: "Shipped" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
];

const PEACH_PILL = "bg-cb-peach text-cb-terracotta-deep";
const GREEN_PILL = "bg-green-100 text-green-800";
const RED_PILL = "bg-red-100 text-red-800";

export function getOrderStageInfo(
  status: OrderStatus,
  trackingCurrentStatus?: string
): OrderStageInfo {
  switch (status) {
    case "payment_pending":
    case "verifying_payment":
      return { key: "order_placed", label: "Payment processing", pillClass: PEACH_PILL, stepIndex: 0 };
    case "payment_confirmed":
      return { key: "payment_confirmed", label: "Payment confirmed", pillClass: GREEN_PILL, stepIndex: 1 };
    case "processing":
      return { key: "packed", label: "Packed", pillClass: PEACH_PILL, stepIndex: 2 };
    case "shipped": {
      const isOutForDelivery = (trackingCurrentStatus ?? "").toLowerCase().includes("out for delivery");
      return isOutForDelivery
        ? { key: "out_for_delivery", label: "Out for delivery", pillClass: PEACH_PILL, stepIndex: 4 }
        : { key: "shipped", label: "Shipped", pillClass: PEACH_PILL, stepIndex: 3 };
    }
    case "delivered":
      return { key: "delivered", label: "Delivered", pillClass: GREEN_PILL, stepIndex: 5 };
    case "cancelled":
      return { key: "cancelled", label: "Cancelled", pillClass: RED_PILL, stepIndex: null };
    case "refunded":
      return { key: "refunded", label: "Refunded", pillClass: "bg-gray-100 text-gray-700", stepIndex: null };
    default:
      return { key: "order_placed", label: "Order placed", pillClass: PEACH_PILL, stepIndex: 0 };
  }
}
