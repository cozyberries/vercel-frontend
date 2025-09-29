"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Product, getProductById } from "@/lib/services/api";
import { useWishlist } from "./wishlist-context";
import { useCart } from "./cart-context";
import { usePreloadedData } from "./data-preloader";
import { toast } from "sonner";

export default function ProductDetails({ id: productId }: { id: string }) {
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<number>(0);
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);

  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { addToCart, removeFromCart, addToCartTemporary, cart } = useCart();
  const { getDetailedProductById, isLoading } = usePreloadedData();
  const router = useRouter();

  const isInCart = cart.some((item) => item.id === product?.id);
  const inWishlist = isInWishlist(product?.id ?? "");

  // Fetch product data
  useEffect(() => {
    const fetchProduct = async () => {
      // First try to get from preloaded data
      const preloadedProduct = getDetailedProductById(productId);
      if (preloadedProduct) {
        setProduct(preloadedProduct);
        return;
      }

      // If not found in preloaded data, fetch from API
      setIsLoadingProduct(true);
      try {
        const fetchedProduct = await getProductById(productId);
        setProduct(fetchedProduct);
      } catch (error) {
        console.error("Error fetching product:", error);
        setProduct(null);
      } finally {
        setIsLoadingProduct(false);
      }
    };

    if (productId) {
      fetchProduct();
    }
  }, [productId, getDetailedProductById]);

  useEffect(() => {
    // Set default selections if product is loaded
    if (product) {
      if (product.sizes && product.sizes.length > 0) {
        setSelectedSize(product.sizes[0]);
      }
      if (product.colors && product.colors.length > 0) {
        setSelectedColor(product.colors[0]);
      }
    }
  }, [product]);

  const incrementQuantity = () => {
    setQuantity((prev) => prev + 1);
  };

  const decrementQuantity = () => {
    if (quantity > 1) {
      setQuantity((prev) => prev - 1);
    }
  };

  if (isLoading || isLoadingProduct) {
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
    <div className="container mx-auto px-4 py-8 pb-20 md:pb-8">
      <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
        {/* Product Images */}
        <div className="space-y-4">
          <div className="aspect-square overflow-hidden bg-[#f5f5f5]">
            <Image
              src={product.images?.[selectedImage]?.url || "/placeholder.svg"}
              alt={product.name}
              width={600}
              height={600}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          {product.images && product.images.length > 1 && (
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
            {product.category && (
              <Link
                href={`/collections/${product.category.toLowerCase()}`}
                className="text-sm text-muted-foreground hover:text-primary"
              >
                {product.category}
              </Link>
            )}
            <div className="flex items-center justify-between mt-2 mb-4">
              <h1 className="text-2xl md:text-3xl font-light">
                {product.name}
              </h1>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={() => {
                  if (inWishlist) {
                    removeFromWishlist(product.id);
                    toast.success(`${product.name} removed from wishlist!`);
                  } else {
                    addToWishlist({
                      id: product.id,
                      name: product.name,
                      price: product.price,
                      image: product.images?.[0]?.url,
                    });
                    toast.success(`${product.name} added to wishlist!`);
                  }
                }}
              >
                <Heart
                  className={`h-5 w-5 ${
                    inWishlist ? "fill-red-500 text-red-500" : ""
                  }`}
                />
                <span className="sr-only">
                  {inWishlist ? "Remove from wishlist" : "Add to wishlist"}
                </span>
              </Button>
            </div>
            <p className="text-2xl font-medium mb-6">
              ₹{product.price.toFixed(2)}
            </p>

            <div className="space-y-6 mb-8">
              {product.colors && product.colors.length > 0 && (
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

              {product.sizes && product.sizes.length > 0 && (
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

            <div className="hidden md:flex flex-col sm:flex-row gap-4 mb-8">
              <Button
                size="lg"
                className="flex-1 bg-black hover:bg-gray-800"
                onClick={() => {
                  // Add to cart temporarily (replaces existing cart), then redirect to checkout
                  addToCartTemporary({
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    image: product.images?.[0]?.url,
                    quantity,
                    ...(selectedColor ? { color: selectedColor } : {}),
                    ...(selectedSize ? { size: selectedSize } : {}),
                  });
                  // Use router navigation with small delay to ensure state update
                  setTimeout(() => {
                    router.push("/checkout");
                  }, 100);
                }}
              >
                Buy Now
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  if (isInCart) {
                    removeFromCart(product.id);
                    toast.success(`${product.name} removed from cart!`);
                  } else {
                    addToCart({
                      id: product.id,
                      name: product.name,
                      price: product.price,
                      image: product.images?.[0]?.url,
                      quantity,
                      ...(selectedColor ? { color: selectedColor } : {}),
                      ...(selectedSize ? { size: selectedSize } : {}),
                    });
                    toast.success(`${product.name} added to cart!`);
                  }
                }}
              >
                {isInCart ? "Remove from Cart" : "Add to Cart"}
              </Button>
            </div>

            {isInCart && (
              <div className="mb-4">
                <span className="inline-block bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded shadow">
                  Added
                </span>
              </div>
            )}

            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4" />
                <span>Free shipping over ₹50</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="p-0 h-auto"
                onClick={async () => {
                  // Always copy clean URL to clipboard for consistency
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    toast.success("Product link copied to clipboard!");
                  } catch (err) {
                    console.log("Error copying to clipboard:", err);
                    // Fallback for older browsers
                    const textArea = document.createElement("textarea");
                    textArea.value = window.location.href;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textArea);
                    toast.success("Product link copied to clipboard!");
                  }
                }}
              >
                <Share2 className="h-4 w-4 mr-1" />
                Share
              </Button>
            </div>

            <Separator className="my-8" />

            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Description
              </h2>
              <div className="rounded-lg">
                <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                  {product.description ? (
                    <div className="whitespace-pre-wrap">
                      {product.description}
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">
                      No description available for this product.
                    </p>
                  )}
                </div>
              </div>
            </div>
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
                    ₹{relatedProduct.price.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sticky Mobile Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50 md:hidden">
        <div className="flex gap-3">
          <Button
            size="lg"
            className="flex-1 h-12 bg-black hover:bg-gray-800"
            onClick={() => {
              // Add to cart temporarily (replaces existing cart), then redirect to checkout
              addToCartTemporary({
                id: product.id,
                name: product.name,
                price: product.price,
                image: product.images?.[0]?.url,
                quantity,
                ...(selectedColor ? { color: selectedColor } : {}),
                ...(selectedSize ? { size: selectedSize } : {}),
              });
              // Use router navigation with small delay to ensure state update
              setTimeout(() => {
                router.push("/checkout");
              }, 100);
            }}
          >
            Buy Now
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="flex-1 h-12"
            onClick={() => {
              if (isInCart) {
                removeFromCart(product.id);
                toast.success(`${product.name} removed from cart!`);
              } else {
                addToCart({
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  image: product.images?.[0]?.url,
                  quantity,
                  ...(selectedColor ? { color: selectedColor } : {}),
                  ...(selectedSize ? { size: selectedSize } : {}),
                });
                toast.success(`${product.name} added to cart!`);
              }
            }}
          >
            {isInCart ? "Remove from Cart" : "Add to Cart"}
          </Button>
        </div>
      </div>
    </div>
  );
}
