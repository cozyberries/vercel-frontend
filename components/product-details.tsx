"use client"

import Image from "next/image"
import Link from "next/link"
import { Heart, Minus, Plus, Share2, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { getProductImageUrl } from "@/lib/supabase"
import { useEffect, useState } from "react"

// Mock product data
const product = {
  id: 1,
  name: "Organic Cotton Onesie",
  price: 24.99,
  description:
    "Our signature organic cotton onesie is perfect for your little one's sensitive skin. Made from 100% GOTS certified organic cotton, this onesie is soft, breathable, and gentle on your baby's delicate skin.",
  features: [
    "100% GOTS certified organic cotton",
    "Snap closures for easy diaper changes",
    "Envelope neckline for easy dressing",
    "Available in multiple sizes and colors",
    "Machine washable and dryer safe",
  ],
  care: "Machine wash cold with like colors. Tumble dry low. Do not bleach. Do not iron decoration.",
  images: [
    "/placeholder.svg?height=600&width=600",
    "/placeholder.svg?height=600&width=600",
    "/placeholder.svg?height=600&width=600",
    "/placeholder.svg?height=600&width=600",
  ],
  colors: ["White", "Pink", "Blue", "Yellow"],
  sizes: ["0-3M", "3-6M", "6-12M", "12-18M", "18-24M"],
  category: "Newborn",
  relatedProducts: [
    {
      id: 2,
      name: "Soft Knit Baby Blanket",
      price: 39.99,
      image: "/placeholder.svg?height=400&width=400",
      category: "Accessories",
    },
    {
      id: 3,
      name: "Ruffled Sleeve Dress",
      price: 32.99,
      image: "/placeholder.svg?height=400&width=400",
      category: "Girl",
    },
    {
      id: 4,
      name: "Striped Romper Set",
      price: 29.99,
      image: "/placeholder.svg?height=400&width=400",
      category: "Boy",
    },
  ],
}

export default function ProductDetails({ id: productId }: { id: string }) {
  const [productImageUrl, setProductImageUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadImageUrl = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const url = await getProductImageUrl();
        setProductImageUrl(url);
      } catch (error) {
        console.error('Error loading product image:', error);
        setError('Failed to load product image');
      } finally {
        setIsLoading(false);
      }
    };
    loadImageUrl();
  }, []);

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-red-500">{error}</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
        {/* Product Images */}
        <div className="space-y-4">
          <div className="aspect-square overflow-hidden bg-[#f5f5f5]">
            <Image
              src={productImageUrl || "/placeholder.svg"}
              alt={product.name}
              width={600}
              height={600}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          <div className="grid grid-cols-4 gap-4">
            {product.images.map((image, index) => (
              <div
                key={index}
                className={`aspect-square overflow-hidden bg-[#f5f5f5] ${index === 0 ? "ring-2 ring-primary" : ""}`}
              >
                <Image
                  src={productImageUrl || "/placeholder.svg"}
                  alt={`${product.name} - View ${index + 1}`}
                  width={150}
                  height={150}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Product Details */}
        <div className="flex flex-col">
          <div>
            <Link
              href={`/collections/${product.category.toLowerCase()}`}
              className="text-sm text-muted-foreground hover:text-primary"
            >
              {product.category}
            </Link>
            <h1 className="text-2xl md:text-3xl font-light mt-2 mb-4">{product.name}</h1>
            <p className="text-2xl font-medium mb-6">${product.price.toFixed(2)}</p>

            <div className="space-y-6 mb-8">
              <div>
                <h3 className="text-sm font-medium mb-3">Color</h3>
                <div className="flex gap-3">
                  {product.colors.map((color, index) => (
                    <button
                      key={color}
                      className={`w-8 h-8 rounded-full border ${index === 0 ? "ring-2 ring-primary ring-offset-2" : ""}`}
                      style={{ backgroundColor: color.toLowerCase() }}
                      aria-label={color}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-3">Size</h3>
                <Select defaultValue={product.sizes[0]}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {product.sizes.map((size) => (
                      <SelectItem key={size} value={size}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Link href="/size-guide" className="text-sm text-primary hover:underline mt-2 inline-block">
                  Size Guide
                </Link>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-3">Quantity</h3>
                <div className="flex items-center border rounded-md w-32">
                  <Button variant="ghost" size="icon" className="rounded-none">
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 text-center">1</div>
                  <Button variant="ghost" size="icon" className="rounded-none">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 mb-8">
              <Button size="lg" className="flex-1">
                Add to Cart
              </Button>
              <Button variant="outline" size="lg" className="flex-1">
                <Heart className="h-4 w-4 mr-2" />
                Add to Wishlist
              </Button>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4" />
                <span>Free shipping over $50</span>
              </div>
              <Button variant="ghost" size="sm" className="p-0 h-auto">
                <Share2 className="h-4 w-4 mr-1" />
                Share
              </Button>
            </div>

            <Separator className="my-6" />

            <Tabs defaultValue="description">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="description">Description</TabsTrigger>
                <TabsTrigger value="features">Features</TabsTrigger>
                <TabsTrigger value="care">Care</TabsTrigger>
              </TabsList>
              <TabsContent value="description" className="pt-4">
                <p className="text-muted-foreground">{product.description}</p>
              </TabsContent>
              <TabsContent value="features" className="pt-4">
                <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                  {product.features.map((feature, index) => (
                    <li key={index}>{feature}</li>
                  ))}
                </ul>
              </TabsContent>
              <TabsContent value="care" className="pt-4">
                <p className="text-muted-foreground">{product.care}</p>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Related Products */}
      <section className="mt-16">
        <h2 className="text-2xl font-light text-center mb-8">You May Also Like</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {product.relatedProducts.map((relatedProduct) => (
            <div key={relatedProduct.id} className="group">
              <div className="relative mb-4 overflow-hidden bg-[#f5f5f5]">
                <Link href={`/products/${relatedProduct.id}`}>
                  <Image
                    src={productImageUrl || "/placeholder.svg"}
                    alt={relatedProduct.name}
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
                  <Link href={`/products/${relatedProduct.id}`} className="hover:text-primary">
                    {relatedProduct.name}
                  </Link>
                </h3>
                <p className="text-sm text-muted-foreground mb-1">{relatedProduct.category}</p>
                <p className="font-medium">${relatedProduct.price.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
} 