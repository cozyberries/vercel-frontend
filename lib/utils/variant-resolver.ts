import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderItemInput } from "@/lib/types/order";

export type VariantResolution =
  | { ok: true; skus: string[] }
  | { ok: false; status: 400 | 409 | 500; error: string };

function label(item: OrderItemInput): string {
  return item.size ? `${item.name} (${item.size})` : item.name;
}

/**
 * Maps each cart line to its product_variants row by (product_slug, size_slug).
 * order_items.size holds the display size ("3-4Y"); size_slug is its lower-case
 * form, and (product_slug, size_slug) is unique. The resolved slug is what the
 * stock trigger decrements on payment confirmation, so it always comes from
 * the database, never from the client-sent `sku`. `skus` is in item order.
 */
export async function resolveOrderVariants(
  client: SupabaseClient,
  items: OrderItemInput[]
): Promise<VariantResolution> {
  const productSlugs = [...new Set(items.map((item) => item.id))];
  const { data, error } = await client
    .from("product_variants")
    .select("slug, product_slug, size_slug, stock_quantity")
    .in("product_slug", productSlugs);

  if (error) {
    console.error("resolveOrderVariants: variant lookup failed", error);
    return { ok: false, status: 500, error: "Failed to check stock" };
  }

  const byKey = new Map<string, { slug: string; stock: number }>();
  for (const row of data ?? []) {
    byKey.set(`${row.product_slug}|${String(row.size_slug ?? "").toLowerCase()}`, {
      slug: row.slug,
      stock: Number(row.stock_quantity ?? 0),
    });
  }

  const requested = new Map<string, number>();
  const skus: string[] = [];
  for (const item of items) {
    const variant = byKey.get(`${item.id}|${(item.size ?? "").toLowerCase()}`);
    if (!variant) {
      return { ok: false, status: 400, error: `${label(item)} is no longer available` };
    }
    const total = (requested.get(variant.slug) ?? 0) + item.quantity;
    requested.set(variant.slug, total);
    if (total > variant.stock) {
      return {
        ok: false,
        status: 409,
        error: variant.stock > 0 ? `Only ${variant.stock} left of ${label(item)}` : `${label(item)} is out of stock`,
      };
    }
    skus.push(variant.slug);
  }
  return { ok: true, skus };
}
