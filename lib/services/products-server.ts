// lib/services/products-server.ts
import 'server-only';
import { cache } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { Product, ProductVariant } from '@/lib/services/api';

/** Explicit return shape produced by getProductBySlug — avoids blanket `as unknown as Product`. */
type EnrichedProduct = Pick<
  Product,
  | 'id' | 'name' | 'slug' | 'description' | 'price' | 'care_instructions'
  | 'stock_quantity' | 'is_featured' | 'category_slug' | 'category'
  | 'categories' | 'features' | 'images' | 'colors' | 'sizes' | 'variants'
>;
import { aggregateSizesFromVariants } from '@/lib/utils/product';

export async function getAllProductSlugs(): Promise<{ id: string }[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('products')
    .select('slug')
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.error('[getAllProductSlugs] Failed to fetch product slugs', { error });
    return [];
  }
  return data.map((p) => ({ id: p.slug }));
}

export const getProductBySlug = cache(async function getProductBySlug(slug: string): Promise<Product | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('products')
    .select(`
      slug, name, description, price, care_instructions,
      stock_quantity, is_featured, created_at, updated_at,
      category_slug, gender_slug, size_slugs, color_slugs,
      categories(name, slug),
      genders(name, slug),
      product_images(url, is_primary, display_order),
      product_features(feature, display_order),
      product_variants(
        slug, price, stock_quantity, size_slug, color_slug,
        sizes(slug, name, display_order),
        colors(slug, name, hex_code, base_color)
      )
    `)
    .eq('slug', slug)
    .single();

  if (error || !data) return null;

  const images = [...(data.product_images || [])]
    .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((img: any) => img.url)
    .filter(Boolean);

  const features = [...(data.product_features || [])]
    .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((f: any) => f.feature);

  const variants = [...(data.product_variants || [])]
    .map((v: any) => ({
      slug: v.slug,
      price: v.price ?? data.price,
      stock_quantity: Number(v.stock_quantity ?? 0),
      size: v.sizes?.name ?? null,
      size_slug: v.size_slug ?? v.sizes?.slug ?? null,
      color: v.colors?.name ?? null,
      color_slug: v.color_slug,
      color_hex: v.colors?.hex_code ?? null,
      display_order: v.sizes?.display_order ?? 0,
    }))
    .sort((a: any, b: any) => a.display_order - b.display_order);

  const sizes = aggregateSizesFromVariants(data.product_variants || [], data.price ?? 0);

  const enriched: EnrichedProduct = {
    id: data.slug,
    slug: data.slug,
    name: data.name ?? '',
    description: data.description ?? '',
    price: data.price ?? 0,
    care_instructions: data.care_instructions ?? '',
    stock_quantity: Number(data.stock_quantity ?? 0),
    is_featured: data.is_featured ?? false,
    category_slug: data.category_slug ?? '',
    category: (data.categories as { name: string; slug: string } | null)?.name ?? '',
    categories: data.categories as { name: string; slug: string },
    features,
    images,
    colors: (data.color_slugs ?? []) as string[],
    sizes,
    variants: variants as ProductVariant[],
  };
  return enriched;
});
