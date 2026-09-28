import type { OrderStatus } from "@/lib/types/order";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body?.error || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export interface AdminOrderItem {
  id?: string;
  sku?: string | null;
  size?: string | null;
  quantity?: number | null;
}
export interface AdminPayment {
  payment_method?: string | null;
  status?: string | null;
}
export interface AdminOrder {
  id: string;
  order_number?: string | null;
  user_id: string;
  status: OrderStatus;
  fulfilment_method?: "delivery" | "pickup" | null;
  total_amount?: number | null;
  created_at?: string | null;
  tracking_number?: string | null;
  carrier_name?: string | null;
  delivery_notes?: string | null;
  estimated_delivery_date?: string | null;
  delhivery_latest_status?: string | null;
  delhivery_latest_scan_at?: string | null;
  delhivery_latest_location?: string | null;
  shipping_address?: { full_name?: string; phone?: string } | null;
  customer_phone?: string | null;
  items: AdminOrderItem[];
  payments: AdminPayment[];
  bill_url: string | null;
}
export interface AdminOrdersListResponse {
  orders: AdminOrder[];
  total: number;
}
export interface AdminNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at?: string | null;
}

export interface OrderFilters {
  status: string; // 'all' or an OrderStatus
  fulfilment: string; // 'all' | 'delivery' | 'pickup'
  days: number | null; // 7 | 30 | 90 | null (= all time)
  offset: number;
}

export const PAGE_SIZE = 50;

export function listUrl(f: OrderFilters): string {
  const p = new URLSearchParams();
  p.set("limit", String(PAGE_SIZE));
  p.set("offset", String(f.offset));
  if (f.status !== "all") p.set("status", f.status);
  if (f.fulfilment !== "all") p.set("fulfilment", f.fulfilment);
  if (f.days) {
    const from = new Date(Date.now() - f.days * 86_400_000);
    p.set("from_date", from.toISOString().slice(0, 10));
  }
  return `/api/admin/orders?${p.toString()}`;
}

export function matchesSearch(o: AdminOrder, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return [o.order_number, o.id, o.tracking_number, o.shipping_address?.full_name, o.shipping_address?.phone, o.customer_phone]
    .some((v) => (v || "").toLowerCase().includes(needle));
}
