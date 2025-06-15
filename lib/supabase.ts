import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create two clients - one for public operations and one for service role operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Utility function to get signed URLs using service role
export async function getStorageUrl(bucket: string, path: string): Promise<string> {
  try {
    if (!path) {
      console.error('Empty path provided to getStorageUrl');
      return '/placeholder.svg';
    }
    
    console.log(`Getting signed URL for bucket: ${bucket}, path: ${path}`);
    
    // Don't manipulate the path - use it exactly as provided
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60); // 1 hour expiry
    
    if (error) {
      console.error('Error generating signed URL:', error);
      return '/placeholder.svg';
    }
    
    if (!data || !data.signedUrl) {
      console.error('No signedUrl in response:', data);
      return '/placeholder.svg';
    }
    
    console.log(`Successfully generated signed URL: ${data.signedUrl.substring(0, 50)}...`);
    return data.signedUrl;
  } catch (error) {
    console.error('Error in getStorageUrl:', error);
    return '/placeholder.svg';
  }
}

// Helper functions for specific media
export async function getLogoUrl(): Promise<string> {
  try {
    return await getStorageUrl('media', 'logo.png');
  } catch (error) {
    console.error('Error getting logo URL:', error);
    return '/placeholder.svg';
  }
}

export async function getProductImageUrl(): Promise<string> {
  try {
    return await getStorageUrl('media', 'sample-product.webp');
  } catch (error) {
    console.error('Error getting product image URL:', error);
    return '/placeholder.svg';
  }
}

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
  slug?: string;  // Make slug optional
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
  slug?: string;  // Make slug optional
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

// Function to get product image URL
export async function getProductImageByPath(path: string): Promise<string> {
  try {
    if (!path) {
      console.log('Empty path provided to getProductImageByPath');
      return await getProductImageUrl();
    }
    
    console.log(`Getting product image for path: ${path}`);
    
    // Just use the path exactly as it is stored in the database
    // This assumes the paths in the database are already correctly formatted
    return await getStorageUrl('media', path);
  } catch (error) {
    console.error('Error getting product image URL:', error);
    return await getProductImageUrl();
  }
}

// Function to fetch all categories
export async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }

  return data || [];
}

// Function to fetch featured products
export async function getFeaturedProducts(): Promise<SimplifiedProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select(`
      id, 
      name, 
      slug, 
      description, 
      price,
      categories(name)
    `)
    .eq('is_featured', true)
    .limit(4);

  if (error) {
    console.error('Error fetching featured products:', error);
    return [];
  }

  // Fetch images for each product
  const productsWithImages = await Promise.all(
    data.map(async (product: DbProduct) => {
      const { data: images } = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', product.id)
        .eq('is_primary', true)
        .limit(1);

      let imageUrl = '';
      if (images && images.length > 0) {
        imageUrl = await getProductImageByPath(images[0].storage_path);
      }

      return {
        ...product,
        category: safeExtract(product.categories, 'name'),
        image: imageUrl
      };
    })
  );

  return productsWithImages;
}

// Function to fetch products by category
export async function getProductsByCategory(categorySlug: string): Promise<SimplifiedProduct[]> {
  // First get the category id
  const { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', categorySlug)
    .single();

  if (categoryError || !category) {
    console.error('Error fetching category:', categoryError);
    return [];
  }

  // Then get products in that category
  const { data, error } = await supabase
    .from('products')
    .select(`
      id, 
      name, 
      slug, 
      price,
      categories(name)
    `)
    .eq('category_id', category.id);

  if (error) {
    console.error('Error fetching products by category:', error);
    return [];
  }

  // Fetch images for each product
  const productsWithImages = await Promise.all(
    data.map(async (product: DbProduct) => {
      const { data: images } = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', product.id)
        .eq('is_primary', true)
        .limit(1);

      let imageUrl = '';
      if (images && images.length > 0) {
        imageUrl = await getProductImageByPath(images[0].storage_path);
      }

      return {
        ...product,
        category: safeExtract(product.categories, 'name'),
        image: imageUrl
      };
    })
  );

  return productsWithImages;
}

// Safely extract a value from a potential object or array
function safeExtract(obj: unknown, key: string, defaultValue: string = ''): string {
  if (!obj) return defaultValue;
  
  if (Array.isArray(obj)) {
    return obj.length > 0 && obj[0] && typeof obj[0] === 'object' && key in obj[0] 
      ? String((obj[0] as Record<string, unknown>)[key]) || defaultValue
      : defaultValue;
  }
  
  if (typeof obj === 'object' && obj !== null && key in (obj as object)) {
    return String((obj as Record<string, unknown>)[key]) || defaultValue;
  }
  
  return defaultValue;
}

// Function to fetch a single product by ID
export async function getProductById(productId: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select(`
      id, 
      name, 
      slug, 
      description, 
      price,
      care_instructions,
      categories(id, name)
    `)
    .eq('id', productId)
    .single();

  if (error || !data) {
    console.error('Error fetching product:', error);
    return null;
  }

  const product = data as DbProduct;
  const categoryName = safeExtract(product.categories, 'name');
  const categoryId = safeExtract(product.categories, 'id');

  const { data: features } = await supabase
    .from('product_features')
    .select('feature')
    .eq('product_id', productId)
    .order('display_order');

  const { data: images } = await supabase
    .from('product_images')
    .select('*')
    .eq('product_id', productId)
    .order('display_order');

  let imagesWithUrls: ProductImage[] = [];
  if (images && images.length > 0) {
    imagesWithUrls = await Promise.all(
      images.map(async (image: DbProductImage) => {
        try {
          const url = await getProductImageByPath(image.storage_path);
          return {
            ...image,
            url
          };
        } catch (error) {
          console.error('Error getting image URL:', error);
          return {
            ...image,
            url: await getProductImageUrl()
          };
        }
      })
    );
  } else {
    // If no images found, use the default product image
    const defaultImageUrl = await getProductImageUrl();
    imagesWithUrls = [{
      id: 'default',
      storage_path: 'sample-product.webp',
      is_primary: true,
      display_order: 0,
      url: defaultImageUrl
    }];
  }

  const { data: variantsData } = await supabase
    .from('product_variants')
    .select(`
      id,
      sku,
      price,
      stock_quantity,
      sizes(name),
      colors(name)
    `)
    .eq('product_id', productId);
  
  const variants = variantsData || [];
  const colorsSet = new Set<string>();
  const sizesSet = new Set<string>();
  const productVariants: ProductVariant[] = [];

  variants.forEach((variant: DbProductVariant) => {
    const colorName = safeExtract(variant.colors, 'name');
    const sizeName = safeExtract(variant.sizes, 'name');
    
    if (colorName) colorsSet.add(colorName);
    if (sizeName) sizesSet.add(sizeName);
    
    productVariants.push({
      id: variant.id,
      sku: variant.sku,
      price: variant.price,
      stock_quantity: variant.stock_quantity,
      size: sizeName,
      color: colorName
    });
  });

  const colors = Array.from(colorsSet);
  const sizes = Array.from(sizesSet);

  const { data: relatedProductIds } = await supabase
    .from('related_products')
    .select('related_product_id')
    .eq('product_id', productId);

  let relatedProducts: RelatedProduct[] = [];
  if (relatedProductIds && relatedProductIds.length > 0) {
    const ids = relatedProductIds.map(item => item.related_product_id);
    const { data: related } = await supabase
      .from('products')
      .select(`
        id, 
        name, 
        price,
        categories(name)
      `)
      .in('id', ids);

    if (related) {
      relatedProducts = await Promise.all(
        related.map(async (product: DbProduct) => {
          const { data: productImages } = await supabase
            .from('product_images')
            .select('storage_path')
            .eq('product_id', product.id)
            .eq('is_primary', true)
            .limit(1);

          let imageUrl = '';
          if (productImages && productImages.length > 0) {
            try {
              imageUrl = await getProductImageByPath(productImages[0].storage_path);
            } catch (error) {
              console.error('Error getting related product image URL:', error);
              imageUrl = await getProductImageUrl();
            }
          } else {
            imageUrl = await getProductImageUrl();
          }

          return {
            id: product.id,
            name: product.name,
            price: product.price,
            category: safeExtract(product.categories, 'name'),
            image: imageUrl
          };
        })
      );
    }
  }

  return {
    ...data,
    category: categoryName,
    category_id: categoryId,
    features: features?.map((f: DbProductFeature) => f.feature) || [],
    images: imagesWithUrls,
    colors,
    sizes,
    variants: productVariants,
    relatedProducts,
    stock_quantity: 0,
    is_featured: false
  };
}

// Function to fetch a single product by slug
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('id')
    .eq('slug', slug)
    .single();

  if (error || !data) {
    console.error('Error fetching product by slug:', error);
    return null;
  }

  return getProductById(data.id);
}

export async function getAllProducts(): Promise<SimplifiedProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select(`
      id, 
      name, 
      slug, 
      price,
      categories(name)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching products:', error);
    return [];
  }

  const productsWithImages = await Promise.all(
    (data || []).map(async (product: DbProduct) => {
      const { data: images } = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', product.id)
        .eq('is_primary', true)
        .limit(1);

      let imageUrl = '';
      if (images && images.length > 0) {
        try {
          imageUrl = await getProductImageByPath(images[0].storage_path);
        } catch (error) {
          console.error('Error getting product image URL:', error);
          imageUrl = await getProductImageUrl();
        }
      } else {
        imageUrl = await getProductImageUrl();
      }

      return {
        ...product,
        category: safeExtract(product.categories, 'name'),
        image: imageUrl
      };
    })
  );

  return productsWithImages;
}

// Function to fetch unique product categories
export async function getProductCategories(): Promise<string[]> {
  // Try to fetch from categories table if it exists
  const { data, error } = await supabase
    .from('categories')
    .select('name');

  if (!error && data) {
    // Return unique, non-null, lowercased category names
    return Array.from(new Set(data.map((item: { name: string }) => item.name?.toLowerCase()).filter(Boolean)));
  }

  // Fallback: fetch from products table if categories table does not exist
  const { data: prodData, error: prodError } = await supabase
    .from('products')
    .select('category');

  if (prodError || !prodData) return [];
  return Array.from(new Set(prodData.map((item: { category: string }) => item.category?.toLowerCase()).filter(Boolean)));
} 