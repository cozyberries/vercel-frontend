"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Heart, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Product } from "@/lib/services/api";
import { useWishlist } from "./wishlist-context";
import { useCart } from "./cart-context";
import { usePreloadedData } from "./data-preloader";
import { toast } from "sonner";
import { images } from "@/app/assets/images";

interface ProductQuickViewModalProps {
  productId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ProductQuickViewModal({
  productId,
  isOpen,
  onClose,
}: ProductQuickViewModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<number>(0);

  const { addToCart, removeFromCart, cart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { getDetailedProductById, isLoading } = usePreloadedData();

  const product = productId ? getDetailedProductById(productId) : null;
  const isInCart = cart.some((item) => item.id === product?.id);
  const inWishlist = isInWishlist(product?.id ?? "");

  useEffect(() => {
    // Reset state when modal opens/closes
    if (isOpen && product) {
      setQuantity(1);
      setSelectedImage(0);
      if (product.sizes && product.sizes.length > 0) {
        setSelectedSize(product.sizes[0]);
      }
      if (product.colors && product.colors.length > 0) {
        setSelectedColor(product.colors[0]);
      }
    }
  }, [isOpen, product]);

  const incrementQuantity = () => {
    setQuantity((prev) => prev + 1);
  };

  const decrementQuantity = () => {
    if (quantity > 1) {
      setQuantity((prev) => prev - 1);
    }
  };

  const handleAddToCart = () => {
    if (!product) return;

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
  };

  const handleBuyNow = () => {
    if (!product) return;

    // Add to cart first
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.images?.[0]?.url,
      quantity,
      ...(selectedColor ? { color: selectedColor } : {}),
      ...(selectedSize ? { size: selectedSize } : {}),
    });

    // Close modal and redirect to checkout
    onClose();
    // You can add navigation to checkout here if needed
    toast.success(`${product.name} added to cart! Redirecting to checkout...`);
  };

  const handleWishlistToggle = () => {
    if (!product) return;

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
  };

  if (!product) {
    return null;
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{product.name}</SheetTitle>
          <SheetDescription className="text-left">
            Quick view - {product.category}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Product Images */}
          <div className="space-y-4">
            <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
              <Image
                src={
                  product.images?.[selectedImage]?.url ||
                  images.staticProductImage
                }
                alt={product.name}
                fill
                className="object-cover"
              />
            </div>

            {product.images && product.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {product.images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${
                      selectedImage === index
                        ? "border-primary"
                        : "border-gray-200"
                    }`}
                  >
                    <Image
                      src={image.url}
                      alt={`${product.name} ${index + 1}`}
                      fill
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold">{product.name}</h2>
                <p className="text-lg text-muted-foreground">
                  ₹{product.price.toFixed(2)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleWishlistToggle}
                className="rounded-full"
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

            {/* Description */}
            <div>
              <h3 className="font-semibold mb-2">Description</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {product.description}
              </p>
            </div>

            {/* Features */}
            {product.features && product.features.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Features</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {product.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <span className="mr-2">•</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Size Selection */}
            {product.sizes && product.sizes.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Size</h3>
                <Select value={selectedSize} onValueChange={setSelectedSize}>
                  <SelectTrigger>
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
              </div>
            )}

            {/* Color Selection */}
            {product.colors && product.colors.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Color</h3>
                <Select value={selectedColor} onValueChange={setSelectedColor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select color" />
                  </SelectTrigger>
                  <SelectContent>
                    {product.colors.map((color) => (
                      <SelectItem key={color} value={color}>
                        {color}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Quantity Selection */}
            <div>
              <h3 className="font-semibold mb-2">Quantity</h3>
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={decrementQuantity}
                  disabled={quantity <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-12 text-center font-medium">{quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={incrementQuantity}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Separator />

            {/* Action Buttons */}
            <div className="space-y-3">
              {!isInCart ? (
                <Button size="lg" className="w-full" onClick={handleAddToCart}>
                  Add to Cart
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="destructive"
                  className="w-full"
                  onClick={() => {
                    removeFromCart(product.id);
                    toast.success(`${product.name} removed from cart!`);
                  }}
                >
                  Remove from Cart
                </Button>
              )}

              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={handleBuyNow}
              >
                Buy Now
              </Button>
            </div>

            {/* Stock Status */}
            <div className="text-sm text-muted-foreground">
              {product.stock_quantity > 0 ? (
                <span className="text-green-600">
                  ✓ In Stock ({product.stock_quantity} available)
                </span>
              ) : (
                <span className="text-red-600">✗ Out of Stock</span>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
