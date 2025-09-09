"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Heart, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAllProducts,
  getCategories,
  SimplifiedProduct,
} from "@/lib/services/api";
import { useCart } from "@/components/cart-context";
import { useWishlist } from "@/components/wishlist-context";
import { toast } from "sonner";
import ProductCard from "@/components/product-card";

export default function ProductsClient() {
  const [products, setProducts] = useState<SimplifiedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [categories, setCategories] = useState<string[]>([]);
  const { addToCart, removeFromCart, cart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();

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

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => {
        console.error("Error loading categories");
        setCategories([]);
      });
  }, []);

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
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </SelectItem>
            ))}
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
          {filteredProducts.map((product) => {
            const isInCart = cart.some((item) => item.id === product.id);
            const inWishlist = isInWishlist(product.id);
            return <ProductCard product={product} />;
          })}
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
