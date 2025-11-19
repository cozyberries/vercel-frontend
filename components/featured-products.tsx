"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import ProductCard from "./product-card";
import { getFeaturedProducts, Product } from "@/lib/services/api";
import { useEffect, useState, useRef } from "react";

export default function FeaturedProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const loadFeaturedProducts = async () => {
      try {
        setIsLoading(true);
        const featuredProducts = await getFeaturedProducts(6);
        setProducts(featuredProducts);
        setError(null);
      } catch (err) {
        console.error("Error loading featured products:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load featured products"
        );
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadFeaturedProducts();
  }, []);

  // Track screen size for responsive behavior
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Auto-scroll animation with jerk effect
  useEffect(() => {
    if (products.length <= 1) return;

    // On mobile, show one product at a time, on desktop show 3
    const maxIndex = isMobile
      ? products.length - 1
      : Math.max(0, products.length - 3); // For desktop: total products - visible products

    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % (maxIndex + 1);
        return nextIndex;
      });
    }, 3000); // Change every 3 seconds

    return () => clearInterval(interval);
  }, [products.length, isMobile]);

  if (isLoading) {
    return (
      <div className="text-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p>Loading featured products...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
          <div className="text-red-600 mb-4">
            <svg
              className="mx-auto h-12 w-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-red-800 mb-2">
            Error Loading Featured Products
          </h3>
          <p className="text-red-700 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()} variant="outline">
            Try Again
          </Button>
        </div>
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
    <section className="py-2 px-2">
      <div className="max-container mx-auto px-4">
        {/* Products Auto-Scroll Section - Full width */}
        <div className="w-full">
          <div className="relative overflow-hidden rounded-2xl ">
            <div className="relative">
              <div
                ref={scrollContainerRef}
                className="flex transition-transform duration-700 ease-out"
                style={{
                  transform: `translateX(-${
                    currentIndex * (isMobile ? 100 : 33.33)
                  }%)`,
                }}
              >
                {products.map((product, index) => (
                  <div
                    key={product.id}
                    className="w-full lg:w-1/3 flex-shrink-0 px-2 lg:px-3"
                  >
                    <ProductCard product={product} index={index} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
