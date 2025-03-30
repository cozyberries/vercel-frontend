"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { Heart, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { getProductsByCategory, SimplifiedProduct } from "@/lib/supabase"

const categories = {
  newborn: {
    title: "Newborn Collection",
    description:
      "Soft, gentle clothing for your precious newborn. Our newborn collection features organic fabrics and thoughtful designs for your baby's comfort.",
  },
  girl: {
    title: "Girls Collection",
    description:
      "Adorable dresses, rompers, and outfits for your little princess. Our girls collection combines style and comfort for everyday wear and special occasions.",
  },
  boy: {
    title: "Boys Collection",
    description:
      "Stylish and comfortable clothing for your little man. Our boys collection features playful designs and durable fabrics for active little ones.",
  },
  accessories: {
    title: "Baby Accessories",
    description:
      "Complete your baby's look with our adorable accessories. From hats and bibs to blankets and toys, find the perfect finishing touch.",
  },
}

interface CategoryPageProps {
  category: string;
}

export default function CategoryPage({ category }: CategoryPageProps) {
  const [products, setProducts] = useState<SimplifiedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  
  const categoryInfo = categories[category as keyof typeof categories] || {
    title: "Products",
    description: "Browse our collection of baby clothing and accessories.",
  }

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const categoryProducts = await getProductsByCategory(category);
        setProducts(categoryProducts);
      } catch (error) {
        console.error('Error loading category products:', error);
      } finally {
        setLoading(false);
      }
    };
    loadProducts();
  }, [category]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-light mb-4">{categoryInfo.title}</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">{categoryInfo.description}</p>
      </div>

      <div className="flex justify-between items-center mb-8">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">
            Showing {products.length} product{products.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Filters button (mobile) */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2 md:hidden">
              <Filter className="h-4 w-4" />
              Filters
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Filter products by size, color, and price.</SheetDescription>
            </SheetHeader>
            <div className="py-6 space-y-6">
              <div>
                <h3 className="font-medium mb-4">Size</h3>
                <div className="space-y-3">
                  {["0-3M", "3-6M", "6-12M", "12-18M", "18-24M"].map((size) => (
                    <div key={size} className="flex items-center space-x-2">
                      <Checkbox id={`size-${size}`} />
                      <Label htmlFor={`size-${size}`}>{size}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-medium mb-4">Color</h3>
                <div className="space-y-3">
                  {["White", "Pink", "Blue", "Yellow", "Green"].map((color) => (
                    <div key={color} className="flex items-center space-x-2">
                      <Checkbox id={`color-${color}`} />
                      <Label htmlFor={`color-${color}`}>{color}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-medium mb-4">Price</h3>
                <div className="space-y-3">
                  {["Under $20", "$20 - $30", "$30 - $40", "Over $40"].map((price) => (
                    <div key={price} className="flex items-center space-x-2">
                      <Checkbox id={`price-${price}`} />
                      <Label htmlFor={`price-${price}`}>{price}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button className="flex-1">Apply Filters</Button>
              <Button variant="outline">Reset</Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Sort dropdown */}
        <div className="flex items-center gap-2">
          <span className="hidden md:inline text-sm text-muted-foreground">Sort by:</span>
          <Select defaultValue="newest">
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price-low-high">Price: Low to High</SelectItem>
              <SelectItem value="price-high-low">Price: High to Low</SelectItem>
              <SelectItem value="name-a-z">Name: A to Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="text-center p-12">Loading products...</div>
      ) : products.length === 0 ? (
        <div className="text-center p-12">
          <p className="text-lg mb-4">No products found in this category.</p>
          <Button asChild>
            <Link href="/collections">View all collections</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {products.map((product) => (
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
                  <Link href={`/products/${product.id}`} className="hover:text-primary">
                    {product.name}
                  </Link>
                </h3>
                <p className="text-sm text-muted-foreground mb-1">{product.category}</p>
                <p className="font-medium">${product.price.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
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
  )
} 