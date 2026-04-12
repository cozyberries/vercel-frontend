import type { MetadataRoute } from "next";
import { createPublicSupabaseClient } from "@/lib/supabase-server";

const BASE_URL = "https://cozyberries.in";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/products`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/faqs`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/shipping-returns`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/size-guide`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
  ];

  try {
    const supabase = createPublicSupabaseClient();
    const { data: products } = await supabase
      .from("products")
      .select("slug, updated_at")
      .eq("is_active", true);

    const productRoutes: MetadataRoute.Sitemap = (products ?? [])
      .filter((p) => p.slug)
      .map((p) => ({
        url: `${BASE_URL}/products/${p.slug}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));

    return [...staticRoutes, ...productRoutes];
  } catch (err) {
    console.error("[sitemap] Failed to fetch products:", err);
    return staticRoutes;
  }
}
