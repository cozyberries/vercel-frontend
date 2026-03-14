// app/products/[id]/page.tsx
import { notFound } from 'next/navigation';
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
