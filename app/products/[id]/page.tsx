// app/products/[id]/page.tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAllProductSlugs, getProductBySlug } from '@/lib/services/products-server';
import ProductInteractions from '@/components/product-interactions';
import ProductStaticInfo from '@/components/product-static-info';

export const revalidate = 86400;

export async function generateStaticParams() {
  return getAllProductSlugs();
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ size?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductBySlug(id);
  if (!product) return {};
  return {
    title: product.name,
    description: product.description?.slice(0, 155),
    openGraph: {
      title: product.name,
      description: product.description?.slice(0, 155),
      images: product.images?.[0] ? [{ url: product.images[0] }] : [],
    },
  };
}

export default async function ProductPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { size } = await searchParams;

  const product = await getProductBySlug(id);
  if (!product) notFound();

  return (
    <ProductInteractions
      product={product}
      initialSize={size}
      staticContent={<ProductStaticInfo product={product} />}
    />
  );
}
