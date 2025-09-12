"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SimplifiedProduct } from "@/lib/services/api";
import ProductCard from "@/components/product-card";
import Pagination from "@/components/Pagination";

interface ProductsClientProps {
  products: SimplifiedProduct[];
  categories: string[];
  currentSort?: string;
  currentType?: string;
}

export default function ProductsClient({
  products,
  categories,
  currentSort,
  currentType,
}: ProductsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  useEffect(() => {
    const category = searchParams.get("category");
    if (category) {
      setSelectedCategory(category.toLowerCase());
    }
  }, [searchParams]);

  const handleSortChange = (sort: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sort === "default") {
      params.delete("sort");
    } else {
      params.set("sort", sort);
    }
    router.push(`/products?${params.toString()}`);
  };

  const handleTypeToggle = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (currentType === "bestseller") {
      params.delete("type");
    } else {
      params.set("type", "bestseller");
    }
    router.push(`/products?${params.toString()}`);
  };

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === "all" ||
        product.category?.toLowerCase() === selectedCategory;
      const matchesSearch = product.name.toLowerCase();

      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory]);

  if (!products || products.length === 0) {
    return (
      <div className="text-center p-12">
        <p className="text-lg mb-4">No products available.</p>
        <Button asChild>
          <Link href="/">Go Home</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={currentSort || "default"}
            onValueChange={handleSortChange}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Sort by price" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="asc">Price: Low to High</SelectItem>
              <SelectItem value="desc">Price: High to Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant={currentType === "bestseller" ? "default" : "outline"}
          onClick={handleTypeToggle}
          className="whitespace-nowrap"
        >
          {currentType === "bestseller" ? "✓ Bestsellers" : "Show Bestsellers"}
        </Button>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="text-center p-12">
          <p className="text-lg mb-4">No products found in this category.</p>
          <Button asChild>
            <Link href="/products">View all products</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      <Pagination currentPage={1} totalPages={3} />
    </>
  );
}
