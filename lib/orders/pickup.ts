import type { OrderStatus } from "@/lib/types/order";

export type PickupTab = "awaiting" | "handover" | "ready" | "collected";
export type PickupAction = "ready" | "collected";

/** Paid covers both confirmation paths: Telegram (processing) and the admin app (payment_confirmed). */
const PAID: OrderStatus[] = ["payment_confirmed", "processing"];

/**
 * Not yet confirmed by the owner's Telegram ✅: stall UPI orders (payment_pending) and
 * cash recorded or "I have paid" (verifying_payment). Listed so they never drop out of sight.
 */
const UNPAID: OrderStatus[] = ["payment_pending", "verifying_payment"];

export const PICKUP_TAB_STATUSES: Record<PickupTab, OrderStatus[]> = {
  awaiting: UNPAID,
  handover: PAID,
  ready: ["ready_for_pickup"],
  collected: ["collected"],
};

/** Search looks across every pickup state, for "I ordered online, here to collect". */
export const PICKUP_SEARCH_STATUSES: OrderStatus[] = [
  ...UNPAID,
  ...PAID,
  "ready_for_pickup",
  "collected",
];

export const PICKUP_TARGET_STATUS: Record<PickupAction, OrderStatus> = {
  ready: "ready_for_pickup",
  collected: "collected",
};

export function allowedFromStatuses(action: PickupAction): OrderStatus[] {
  return action === "ready" ? [...PAID] : [...PAID, "ready_for_pickup"];
}

export function parsePickupTab(value: string | null): PickupTab | null {
  if (value === null || value === "") return "handover";
  return value === "awaiting" || value === "handover" || value === "ready" || value === "collected" ? value : null;
}

export function parsePickupAction(value: unknown): PickupAction | null {
  return value === "ready" || value === "collected" ? value : null;
}

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Midnight Asia/Kolkata of the day containing `now`, as a UTC instant. */
export function startOfIstDay(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const midnightIstAsUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return new Date(midnightIstAsUtc - IST_OFFSET_MS);
}

export interface PickupOrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  total_amount: number;
  customer_name: string | null;
  customer_phone: string | null;
  invoice_number: string | null;
  created_at: string;
  updated_at: string;
  order_items: { name: string; size: string | null; color: string | null; quantity: number; price: number }[];
  payments: { payment_method: string; status: string }[];
  /** Signed public link to the bill PDF; null when INVOICE_LINK_SECRET is not configured. */
  bill_url: string | null;
}
