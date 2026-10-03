import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockVariantRow } from "./stock-metrics";

export const VARIANT_PAGE_SIZE = 1000;

const COLUMNS =
  "slug, product_slug, size_slug, stock_quantity, price, products!inner(name, is_active, category_slug, categories(name)), sizes(name, display_order)";

/**
 * Every variant of an active product, with its product, category and size embedded. Read in pages
 * because PostgREST caps a response at 1,000 rows. Service-role client, read-only; callers gate on
 * requireAdmin() first.
 */
export async function fetchActiveVariants(admin: SupabaseClient): Promise<StockVariantRow[]> {
  const rows: StockVariantRow[] = [];
  for (let offset = 0; ; offset += VARIANT_PAGE_SIZE) {
    const { data, error } = await admin
      .from("product_variants")
      .select(COLUMNS)
      .eq("products.is_active", true)
      .order("slug", { ascending: true })
      .range(offset, offset + VARIANT_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as StockVariantRow[];
    rows.push(...page);
    if (page.length < VARIANT_PAGE_SIZE) return rows;
  }
}
