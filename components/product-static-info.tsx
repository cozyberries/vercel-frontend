// components/product-static-info.tsx
// No "use client" — this is a Server Component
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import { Truck } from 'lucide-react';
import { FREE_DELIVERY_THRESHOLD } from '@/lib/constants';
import { Product } from '@/lib/services/api';

interface Props {
  product: Product;
}

export default function ProductStaticInfo({ product }: Props) {
  return (
    <div className="flex flex-col">
      <div>
        {product.category && (
          <Link
            href={`/collections/${product.category.toLowerCase()}`}
            className="text-sm text-muted-foreground hover:text-primary"
          >
            {product.category}
          </Link>
        )}

        <div className="flex items-center justify-between mt-2 mb-4">
          <h1 className="text-2xl md:text-3xl font-light">
            {product.name}
          </h1>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            <span>Free shipping over ₹{FREE_DELIVERY_THRESHOLD.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">Description</h2>
          <div className="rounded-lg">
            <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
              {product.description ? (
                <div className="whitespace-pre-wrap">{product.description}</div>
              ) : (
                <p className="text-gray-500 italic">
                  No description available for this product.
                </p>
              )}
            </div>
          </div>
        </div>

        <Separator className="my-8" />

        {product.features && product.features.length > 0 && (
          <>
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Features</h2>
              <ul className="list-disc list-inside space-y-2 text-gray-700 text-sm">
                {product.features.map((feature, index) => (
                  <li key={index}>{feature}</li>
                ))}
              </ul>
            </div>
            <Separator className="my-8" />
          </>
        )}

        {product.care_instructions && (
          <>
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Care Instructions</h2>
              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                <div className="whitespace-pre-wrap">{product.care_instructions}</div>
              </div>
            </div>
            <Separator className="my-8" />
          </>
        )}
      </div>
    </div>
  );
}
