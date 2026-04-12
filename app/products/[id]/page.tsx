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

const BASE_URL = "https://cozyberries.in";

function buildProductJsonLd(product: NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>) {
  const images = (product.images ?? [])
    .map((url) => (typeof url === "string" ? normalizeAbsoluteUrl(url) : undefined))
    .filter(Boolean) as string[];

  const variantPrices = (product.variants ?? []).map((v) => v.price).filter((p) => p > 0);
  const lowPrice = variantPrices.length > 0 ? Math.min(...variantPrices) : product.price;
  const highPrice = variantPrices.length > 0 ? Math.max(...variantPrices) : product.price;
  const offerCount = (product.variants ?? []).length || 1;

  const inStock =
    (product.stock_quantity ?? 0) > 0 ||
    (product.variants ?? []).some((v) => v.stock_quantity > 0);

  const priceValidUntil = new Date();
  priceValidUntil.setFullYear(priceValidUntil.getFullYear() + 1);
  const priceValidUntilStr = priceValidUntil.toISOString().split("T")[0];

  const productUrl = `${BASE_URL}/products/${product.slug}`;

  return {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    description: product.description || product.name,
    image: images.length > 0 ? images : undefined,
    url: productUrl,
    brand: { "@type": "Brand", name: "CozyBerries" },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      lowPrice,
      highPrice,
      offerCount,
      description: product.description || product.name,
      url: productUrl,
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      priceValidUntil: priceValidUntilStr,
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "IN",
        returnPolicyCategory:
          "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 7,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/FreeReturn",
      },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: "90", currency: "INR" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "IN" },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: {
            "@type": "QuantitativeValue",
            minValue: 1,
            maxValue: 2,
            unitCode: "DAY",
          },
          transitTime: {
            "@type": "QuantitativeValue",
            minValue: 3,
            maxValue: 7,
            unitCode: "DAY",
          },
        },
      },
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params;

  const product = await getProductBySlug(id);
  if (!product) notFound();

  const jsonLd = buildProductJsonLd(product);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductInteractions
        product={product}
        staticContent={<ProductStaticInfo product={product} />}
      />
    </>
  );
}
