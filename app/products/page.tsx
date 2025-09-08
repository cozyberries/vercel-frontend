"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAllProducts, SimplifiedProduct } from "@/lib/services/api";

export default function ProductsPage() {
  const [products, setProducts] = useState<SimplifiedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const allProducts = await getAllProducts();
        setProducts(allProducts);
      } catch (error) {
        console.error("Error loading products:", error);
      } finally {
        setLoading(false);
      }
    };
    loadProducts();
  }, []);

  useEffect(() => {
    const category = searchParams.get("category");
    if (category) {
      setSelectedCategory(category.toLowerCase());
    }
  }, [searchParams]);

  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      selectedCategory === "all" ||
      product.category?.toLowerCase() === selectedCategory;
    const matchesSearch = product.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-light mb-4">Our Products</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Discover our complete collection of baby clothing and accessories,
          carefully curated for your little ones.
        </p>
      </div>

      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search products by name..."
          className="border border-gray-300 rounded-md px-4 py-2 w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="newborn">Newborn</SelectItem>
            <SelectItem value="boy">Boy</SelectItem>
            <SelectItem value="girl">Girl</SelectItem>
            <SelectItem value="occasion">Occasion</SelectItem>
            <SelectItem value="couture">Couture</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center p-12">Loading products...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center p-12">
          <p className="text-lg mb-4">No products found in this category.</p>
          <Button asChild>
            <Link href="/products">View all products</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {filteredProducts.map((product) => (
            <div key={product.id} className="group">
              <div className="relative mb-4 overflow-hidden bg-[#f5f5f5]">
                <Link href={`/products/${product.id}`}>
                  <Image
                    src={product.image || "/placeholder.svg"}
                    alt={product.name}
                    width={400}
                    height={400}
                    className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-4 right-4 bg-white/80 hover:bg-white rounded-full h-8 w-8"
                >
                  <Heart className="h-4 w-4" />
                  <span className="sr-only">Add to wishlist</span>
                </Button>
                <div className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" className="w-full rounded-none py-3">
                    Add to Cart
                  </Button>
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-sm font-medium mb-1">
                  <Link
                    href={`/products/${product.id}`}
                    className="hover:text-primary"
                  >
                    {product.name}
                  </Link>
                </h3>
                <p className="text-sm text-muted-foreground mb-1">
                  {product.category}
                </p>
                <p className="font-medium">${product.price.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-center mt-12">
        <Button variant="outline" className="mr-2" disabled>
          Previous
        </Button>
        <Button variant="outline" className="font-medium">
          1
        </Button>
        <Button variant="outline" className="font-normal">
          2
        </Button>
        <Button variant="outline" className="font-normal">
          3
        </Button>
        <Button variant="outline" className="ml-2">
          Next
        </Button>
      </div>
    </div>
  );
}
