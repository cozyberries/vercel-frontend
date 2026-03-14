// app/products/[id]/page.tsx
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import ProductDetails from '@/components/product-details';
import { getAllProductSlugs, getProductBySlug } from '@/lib/services/products-server';

export const revalidate = 86400; // regenerate after 24h

export async function generateStaticParams() {
  return getAllProductSlugs();
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ size?: string }>;
}

export default async function ProductPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { size } = await searchParams;

  const product = await getProductBySlug(id);
  if (!product) notFound();

  return (
    <Suspense fallback={null}>
      <ProductDetails id={id} initialSize={size} initialProduct={product} />
    </Suspense>
  );
}
