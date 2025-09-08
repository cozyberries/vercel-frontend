import { SimplifiedProduct } from "@/lib/services/api";

// ---------- Normalizer ----------
export const normalizeProduct = (p: any): SimplifiedProduct => ({
  id: p.id,
  name: p.name,
  slug: p.slug,
  price: p.price,
  description: p.description,
  category: p.category,
  image: p.image || "/placeholder.jpg",
});
