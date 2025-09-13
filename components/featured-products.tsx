"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getBestsellers, SimplifiedProduct } from "@/lib/services/api";
import ProductCard from "./product-card";

export default function FeaturedProducts() {
  const [products, setProducts] = useState<SimplifiedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const data = await getBestsellers();
        setProducts(data);
      } catch (error) {
        console.error("Error fetching featured products:", error);
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, []);

  if (isLoading) {
    return (
      <div className="text-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p>Loading featured products...</p>
      </div>
    );
  }

  if (!products.length) {
    return <div className="text-center p-8">No featured products found.</div>;
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
