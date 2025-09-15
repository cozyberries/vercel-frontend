"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import ProductCard from "./product-card";
import { usePreloadedData } from "@/components/data-preloader";

export default function FeaturedProducts() {
  const { products: allProducts, isLoading } = usePreloadedData();
  
  // Filter featured products from preloaded data
  const products = allProducts.filter(product => product.is_featured).slice(0, 4);

  if (isLoading) {
    return (
      <div className="text-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p>Loading featured products...</p>
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="text-center py-12">
        <div className="max-w-sm mx-auto">
          <div className="mb-4">
            <svg
              className="mx-auto h-16 w-16 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No featured products
          </h3>
          <p className="text-gray-500 mb-4">
            Featured products will appear here soon.
          </p>
          <Button asChild variant="outline">
            <Link href="/products">Browse All Products</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-4 grid-cols-2 gap-8">
      {products.slice(0, 4).map((product) => (
        <ProductCard product={product} key={product.id} />
      ))}
      <div className="col-span-full flex justify-center items-center">
        <Button>
          <Link href="/products">View More</Link>
        </Button>
      </div>
    </div>
  );
}
