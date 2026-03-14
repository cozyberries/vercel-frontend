import { SimplifiedProduct } from "@/lib/services/api";
import { ProductImage } from "@/lib/types/product";

export type AggregatedSize = {
  name: string;
  price: number;
  stock_quantity: number;
  display_order: number;
};

/**
 * Aggregate sizes from product variants, deduplicating by size name.
 * Sums stock across same-size variants and keeps the lowest price.
 */
export function aggregateSizesFromVariants(
  variants: any[],
  fallbackPrice: number
): AggregatedSize[] {
  const sizeMap = new Map<string, AggregatedSize>();

  for (const v of variants) {
    const sizeName = v.sizes?.name;
    if (!sizeName) continue;

    const existing = sizeMap.get(sizeName);
    const variantPrice = v.price ?? fallbackPrice;
    const variantStock = Number(v.stock_quantity ?? 0);

    if (!existing) {
      sizeMap.set(sizeName, {
        name: sizeName,
        price: variantPrice,
        stock_quantity: variantStock,
        display_order: v.sizes?.display_order ?? 0,
      });
    } else {
      existing.stock_quantity += variantStock;
      if (variantPrice < existing.price) existing.price = variantPrice;
    }
  }

  return Array.from(sizeMap.values()).sort(
    (a, b) => a.display_order - b.display_order
  );
}

export const getPrimaryImageUrl = (
  images?: ProductImage[]
): string | undefined => {
  if (!images || images.length === 0) return undefined;
  const primaryImage = images.find((img) => img.is_primary);
  return primaryImage?.url ?? images[0]?.url;
};

export const getAllImageUrls = (images?: ProductImage[]): string[] => {
  if (!images || images.length === 0) return [];
  return images.map((img) => img.url).filter(Boolean);
};

export const normalizeProduct = (p: any): SimplifiedProduct => ({
  id: p.slug ?? p.id,
  name: p.name,
  slug: p.slug,
  price: p.price,
  description: p.description,
  categorySlug: p.category_slug || "uncategorized",
  categoryName: p.categories?.name || "Uncategorized",
  image: p.images?.[0] || undefined,
  is_featured: p.is_featured || false,
});
