// components/product-static-info.tsx
// No "use client" — this is a Server Component
import Link from 'next/link';
import { Product } from '@/lib/services/api';
import { slugToTitle } from '@/lib/utils/product';
import WishlistButton from './wishlist-button';
import ShareButton from './ShareButton';

interface Props {
  product: Product;
}

export default function ProductStaticInfo({ product }: Props) {
  const colorName = product.colors?.[0] ? slugToTitle(product.colors[0]) : null;

  return (
    <div className="flex flex-col">
      {product.category_slug && product.category && (
        <Link
          href={`/products?category=${product.category_slug}`}
          className="text-sm text-cb-muted-fg hover:text-cb-terracotta-deep"
        >
          {product.category}
        </Link>
      )}

      <div className="flex justify-between items-start mt-1">
        <h1 className="text-2xl md:text-[28px] font-light text-cb-fg pr-2">
          {product.name}
        </h1>
        <div className="flex items-center shrink-0">
          <ShareButton />
          <WishlistButton product={product} />
        </div>
      </div>
      {colorName && (
        <p className="text-sm text-cb-muted-fg">{colorName}</p>
      )}
    </div>
  );
}
