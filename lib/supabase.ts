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
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 3600); // URL valid for 1 hour

  if (error) {
    console.error('Error generating signed URL:', error);
    throw error;
  }

  console.log('Generated signed URL for', path, ':', data?.signedUrl);
  return data?.signedUrl || '';
}

// Helper functions for specific media
export async function getLogoUrl(): Promise<string> {
  const url = await getStorageUrl('media', 'logo.png');
  console.log('Logo URL:', url);
  return url;
}

export async function getProductImageUrl(): Promise<string> {
  const url = await getStorageUrl('media', 'sample-product.webp');
  console.log('Product Image URL:', url);
  return url;
} 