import type { OrderItem, OrderItemInput } from "@/lib/types/order";

/**
 * Typed shape of a row returned by Supabase from the order_items table.
 * Keeps mapOrderItems free of `any` without requiring generated DB types.
 */
export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  /** Supabase returns NUMERIC columns as strings; convert with Number(). */
  price: string | number;
  quantity: number;
  image: string | null;
  size: string | null;
  color: string | null;
  sku: string | null;
  created_at: string;
}

/** Maps raw order_items DB rows into the API-facing OrderItem shape. */
export function mapOrderItems(rows: OrderItemRow[]): OrderItem[] {
  return rows.map((row) => ({
    id: row.product_id,
    name: row.name,
    price: Number(row.price),
    quantity: row.quantity,
    ...(row.image ? { image: row.image } : {}),
    ...(row.size ? { size: row.size } : {}),
    ...(row.color ? { color: row.color } : {}),
    ...(row.sku ? { sku: row.sku } : {}),
  }));
}

/**
 * Maps client-submitted OrderItemInput[] (no DB-specific fields) into the
 * API-facing OrderItem shape, avoiding the need to fabricate dummy id /
 * created_at values just to satisfy the full OrderItemRow contract.
 */
export function mapOrderItemInputs(items: OrderItemInput[]): OrderItem[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    ...(item.image ? { image: item.image } : {}),
    ...(item.size ? { size: item.size } : {}),
    ...(item.color ? { color: item.color } : {}),
    ...(item.sku ? { sku: item.sku } : {}),
  }));
}
