// Supabase removed. All data flows through API routes now.

// Types for product data
export interface ProductVariant {
  id: string;
  sku: string;
  price: number;
  stock_quantity: number;
  size: string;
  color: string;
}

export interface ProductImage {
  id: string;
  storage_path: string;
  is_primary?: boolean;
  display_order?: number;
  url?: string;
}

export interface RelatedProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  image: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  care_instructions: string;
  stock_quantity: number;
  is_featured: boolean;
  category_id: string;
  category: string;
  features: string[];
  images: ProductImage[];
  colors: string[];
  sizes: string[];
  variants: ProductVariant[];
  relatedProducts?: RelatedProduct[];
}

// Interface for simplified product data returned by list queries
export interface SimplifiedProduct {
  id: string;
  name: string;
  slug?: string; // Make slug optional
  price: number;
  description?: string;
  categories?: { name: string };
  category?: string;
  image?: string;
}

// Database record types for type safety
interface DbProduct {
  id: string;
  name: string;
  slug?: string; // Make slug optional
  description?: string;
  price: number;
  care_instructions?: string;
  categories?: any;
  [key: string]: any;
}

interface DbProductImage {
  id: string;
  storage_path: string;
  is_primary?: boolean;
  display_order?: number;
  [key: string]: any;
}

interface DbProductVariant {
  id: string;
  sku: string;
  price: number;
  stock_quantity: number;
  sizes?: any;
  colors?: any;
  [key: string]: any;
}

interface DbProductFeature {
  feature: string;
  [key: string]: any;
}

// Basic API helper utilities
function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || "https://api.cozyberries.in/";
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    ...init,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`API ${response.status} ${response.statusText}: ${text}`);
  }
  return response.json() as Promise<T>;
}

// Image URL helpers (no Supabase dependency)
export async function getProductImageUrl(): Promise<string> {
  // Fallback image available in public directory
  return "/placeholder.jpg";
}

export async function getProductImageByPath(path: string): Promise<string> {
  if (!path) return getProductImageUrl();
  // Assume API or static server serves media under /media
  // If your API returns absolute URLs, prefer those directly instead.
  return path.startsWith("http") ? path : `/media/${path}`;
}

// Function to fetch all categories
export async function getCategories() {
  try {
    const categories = await apiFetch<any[]>(`/api/categories`);
    return categories || [];
  } catch (error) {
    console.error("Error fetching categories:", error);
    return [];
  }
}

// Function to fetch featured products
export async function getFeaturedProducts(): Promise<SimplifiedProduct[]> {
  try {
    const data = await apiFetch<DbProduct[]>(
      `/api/products?featured=true&limit=4`
    );
    const productsWithImages = await Promise.all(
      (data || []).map(async (product: DbProduct) => {
        const imageUrl = await getProductImageByPath(
          (product as any).image || ""
        );
        return {
          ...product,
          category: safeExtract(product.categories, "name"),
          image: imageUrl,
        };
      })
    );
    return productsWithImages;
  } catch (error) {
    console.error("Error fetching featured products:", error);
    return [];
  }
}

// Function to fetch products by category
export async function getProductsByCategory(
  categorySlug: string
): Promise<SimplifiedProduct[]> {
  try {
    const data = await apiFetch<DbProduct[]>(
      `/api/products?categorySlug=${encodeURIComponent(categorySlug)}`
    );
    const productsWithImages = await Promise.all(
      (data || []).map(async (product: DbProduct) => {
        const imageUrl = await getProductImageByPath(
          (product as any).image || ""
        );
        return {
          ...product,
          category: safeExtract(product.categories, "name"),
          image: imageUrl,
        };
      })
    );
    return productsWithImages;
  } catch (error) {
    console.error("Error fetching products by category:", error);
    return [];
  }
}

// Safely extract a value from a potential object or array
function safeExtract(
  obj: unknown,
  key: string,
  defaultValue: string = ""
): string {
  if (!obj) return defaultValue;

  if (Array.isArray(obj)) {
    return obj.length > 0 &&
      obj[0] &&
      typeof obj[0] === "object" &&
      key in obj[0]
      ? String((obj[0] as Record<string, unknown>)[key]) || defaultValue
      : defaultValue;
  }

  if (typeof obj === "object" && obj !== null && key in (obj as object)) {
    return String((obj as Record<string, unknown>)[key]) || defaultValue;
  }

  return defaultValue;
}

// Function to fetch a single product by ID
export async function getProductById(
  productId: string
): Promise<Product | null> {
  try {
    const data = await apiFetch<any>(
      `/api/products/${encodeURIComponent(productId)}`
    );
    // Normalize images array to include url field
    const imagesWithUrls: ProductImage[] = await Promise.all(
      (data.images || []).map(async (img: DbProductImage) => ({
        ...img,
        url: await getProductImageByPath(
          (img as any).url || img.storage_path || ""
        ),
      }))
    );

    const variants: DbProductVariant[] = data.variants || [];
    const colorsSet = new Set<string>();
    const sizesSet = new Set<string>();
    const productVariants: ProductVariant[] = [];

    variants.forEach((variant: DbProductVariant) => {
      const colorName = safeExtract(variant.colors, "name");
      const sizeName = safeExtract(variant.sizes, "name");
      if (colorName) colorsSet.add(colorName);
      if (sizeName) sizesSet.add(sizeName);
      productVariants.push({
        id: variant.id,
        sku: variant.sku,
        price: variant.price,
        stock_quantity: variant.stock_quantity,
        size: sizeName,
        color: colorName,
      });
    });

    const relatedProducts: RelatedProduct[] = (data.relatedProducts || []).map(
      (p: any) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        category: p.category || safeExtract(p.categories, "name"),
        image: p.image,
      })
    );

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      price: data.price,
      care_instructions: data.care_instructions,
      stock_quantity: data.stock_quantity ?? 0,
      is_featured: data.is_featured ?? false,
      category_id: data.category_id,
      category: data.category || safeExtract(data.categories, "name"),
      features: (data.features || []).map(
        (f: DbProductFeature) => f.feature ?? f
      ),
      images: imagesWithUrls.length
        ? imagesWithUrls
        : [
            {
              id: "default",
              storage_path: "",
              is_primary: true,
              display_order: 0,
              url: await getProductImageUrl(),
            },
          ],
      colors: Array.from(colorsSet),
      sizes: Array.from(sizesSet),
      variants: productVariants,
      relatedProducts,
    };
  } catch (error) {
    console.error("Error fetching product:", error);
    return null;
  }
}

// Function to fetch a single product by slug
export async function getProductBySlug(slug: string): Promise<Product | null> {
  try {
    const data = await apiFetch<{ id: string } | Product>(
      `/api/products?slug=${encodeURIComponent(slug)}`
    );
    if ((data as any).id && Object.keys(data as any).length === 1) {
      return getProductById((data as any).id);
    }
    return data as Product;
  } catch (error) {
    console.error("Error fetching product by slug:", error);
    return null;
  }
}

export async function getAllProducts(): Promise<SimplifiedProduct[]> {
  try {
    const data = await apiFetch<DbProduct[]>(`/api/products`);
    const productsWithImages = await Promise.all(
      (data || []).map(async (product: DbProduct) => {
        const imageUrl = await getProductImageByPath(
          (product as any).image || ""
        );
        return {
          ...product,
          category: safeExtract(product.categories, "name"),
          image: imageUrl,
        };
      })
    );
    return productsWithImages;
  } catch (error) {
    console.error("Error fetching products:", error);
    return [];
  }
}
