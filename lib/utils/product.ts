import { SimplifiedProduct } from "@/lib/services/api";
import { ProductImage } from "@/lib/types/product";

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
