import { SimplifiedProduct } from "@/lib/services/api";

// ---------- Normalizer ----------
export const normalizeProduct = (p: any): SimplifiedProduct => ({
  id: p.id,
  name: p.name,
  slug: p.slug,
  price: p.price,
  description: p.description,
  category: p.category_id, // Map category_id to category
  image: "/placeholder.jpg", // Default placeholder since no image field in API response
});
