"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, Minus, Plus, Share2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { getProductById, Product } from "@/lib/services/api";

export default function ProductDetails({ id: productId }: { id: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<number>(0);

  useEffect(() => {
    const loadProduct = async () => {
      try {
        const productData = await getProductById(productId);
        console.log(productData);
        setProduct(productData);

        // Set default selections if product is loaded
        if (productData) {
          if (productData.sizes.length > 0) {
            setSelectedSize(productData.sizes[0]);
          }
          if (productData.colors.length > 0) {
            setSelectedColor(productData.colors[0]);
          }
        }
      } catch (error) {
        console.error("Error loading product:", error);
      } finally {
        setLoading(false);
      }
    };
    loadProduct();
  }, [productId]);

  const incrementQuantity = () => {
    setQuantity((prev) => prev + 1);
  };

  const decrementQuantity = () => {
    if (quantity > 1) {
      setQuantity((prev) => prev - 1);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        Loading product details...
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h2 className="text-xl mb-4">Product not found</h2>
        <Button asChild>
          <Link href="/collections">Browse collections</Link>
        </Button>
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
              src={product.images[selectedImage]?.url || "/placeholder.svg"}
              alt={product.name}
              width={600}
              height={600}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          {product.images.length > 1 && (
            <div className="grid grid-cols-4 gap-4">
              {product.images.map((image, index) => (
                <div
                  key={index}
                  className={`aspect-square overflow-hidden bg-[#f5f5f5] cursor-pointer ${
                    index === selectedImage ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => setSelectedImage(index)}
                >
                  <Image
                    src={image.url || "/placeholder.svg"}
                    alt={`${product.name} - View ${index + 1}`}
                    width={150}
                    height={150}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product Details */}
        <div className="flex flex-col">
          <div>
            <Link
              href={`/collections/${product.category?.toLowerCase()}`}
              className="text-sm text-muted-foreground hover:text-primary"
            >
              {product.category}
            </Link>
            <h1 className="text-2xl md:text-3xl font-light mt-2 mb-4">
              {product.name}
            </h1>
            <p className="text-2xl font-medium mb-6">
              ${product.price.toFixed(2)}
            </p>

            <div className="space-y-6 mb-8">
              {product.colors.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">Color</h3>
                  <div className="flex gap-3">
                    {product.colors.map((color, index) => (
                      <button
                        key={color}
                        className={`w-8 h-8 rounded-full border ${
                          color === selectedColor
                            ? "ring-2 ring-primary ring-offset-2"
                            : ""
                        }`}
                        style={{ backgroundColor: color.toLowerCase() }}
                        aria-label={color}
                        onClick={() => setSelectedColor(color)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {product.sizes.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">Size</h3>
                  <Select value={selectedSize} onValueChange={setSelectedSize}>
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
                  <Link
                    href="/size-guide"
                    className="text-sm text-primary hover:underline mt-2 inline-block"
                  >
                    Size Guide
                  </Link>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium mb-3">Quantity</h3>
                <div className="flex items-center border rounded-md w-32">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-none"
                    onClick={decrementQuantity}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 text-center">{quantity}</div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-none"
                    onClick={incrementQuantity}
                  >
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
                  {product.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </TabsContent>
              <TabsContent value="care" className="pt-4">
                <p className="text-muted-foreground">
                  {product.care_instructions}
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Related Products */}
      {product.relatedProducts && product.relatedProducts.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-light text-center mb-8">
            You May Also Like
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {product.relatedProducts.map((relatedProduct) => (
              <div key={relatedProduct.id} className="group">
                <div className="relative mb-4 overflow-hidden bg-[#f5f5f5]">
                  <Link href={`/products/${relatedProduct.id}`}>
                    <Image
                      src={relatedProduct.image || "/placeholder.svg"}
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
                    <Button
                      variant="ghost"
                      className="w-full rounded-none py-3"
                    >
                      Add to Cart
                    </Button>
                  </div>
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-medium mb-1">
                    <Link
                      href={`/products/${relatedProduct.id}`}
                      className="hover:text-primary"
                    >
                      {relatedProduct.name}
                    </Link>
                  </h3>
                  <p className="text-sm text-muted-foreground mb-1">
                    {relatedProduct.category}
                  </p>
                  <p className="font-medium">
                    ${relatedProduct.price.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
