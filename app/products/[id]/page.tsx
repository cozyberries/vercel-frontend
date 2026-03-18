// app/products/[id]/page.tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAllProductSlugs, getProductBySlug } from '@/lib/services/products-server';
import ProductInteractions from '@/components/product-interactions';
import ProductStaticInfo from '@/components/product-static-info';
import { resolveImageUrl, normalizeAbsoluteUrl } from '@/lib/utils/image';

export const revalidate = 86400;

export async function generateStaticParams() {
  return getAllProductSlugs();
}

interface PageProps {
  params: Promise<{ id: string }>;
}

function getFirstImageUrl(images: unknown[] | undefined): string | undefined {
  const first = images?.[0];
  let url: string | undefined;
  if (typeof first === 'string' && first.trim()) url = first.trim();
  else if (first && typeof first === 'object' && 'url' in first) url = resolveImageUrl(first as { url?: string });
  else return undefined;
  return url ? normalizeAbsoluteUrl(url) : undefined;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductBySlug(id);
  if (!product) return {};
  const imageUrl = getFirstImageUrl(product.images);
  return {
    title: product.name,
    description: product.description?.slice(0, 155),
    openGraph: {
      title: product.name,
      description: product.description?.slice(0, 155),
      images: imageUrl ? [{ url: imageUrl, width: 1200, height: 630, alt: product.name }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description: product.description?.slice(0, 155),
      images: imageUrl ? [imageUrl] : [],
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params;

  const product = await getProductBySlug(id);
  if (!product) notFound();

  return (
    <ProductInteractions
      product={product}
      staticContent={<ProductStaticInfo product={product} />}
    />
  );
}
