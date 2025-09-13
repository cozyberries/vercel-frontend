"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimplifiedProduct } from "@/lib/services/api";
import { useCart } from "./cart-context";
import { useWishlist } from "./wishlist-context";
import { toast } from "sonner";
import { images } from "@/app/assets/images";

interface ProductCardProps {
  product: SimplifiedProduct;
}

export default function ProductCard({ product }: ProductCardProps) {
  console.log(product);
  const { addToCart, removeFromCart, cart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const isInCart = cart.some((item) => item.id === product.id);
  const inWishlist = isInWishlist(product.id);
  return (
    <div key={product.id} className="group flex flex-col h-full">
      {/* Image Section */}
      <div className="relative mb-4 overflow-hidden bg-[#f5f5f5] flex-shrink-0">
        <Link href={`/products/${product.id}`}>
          <Image
            src={
              // product.image ||
              images.staticProductImage
            }
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
          onClick={(e) => {
            e.preventDefault();
            if (inWishlist) {
              removeFromWishlist(product.id);
              toast.success(`${product.name} removed from wishlist!`);
            } else {
              addToWishlist({
                id: product.id,
                name: product.name,
                price: product.price,
                image: product.image,
              });
              toast.success(`${product.name} added to wishlist!`);
            }
          }}
        >
          <Heart
            className={`h-4 w-4 ${
              inWishlist ? "fill-red-500 text-red-500" : ""
            }`}
          />
          <span className="sr-only">
            {inWishlist ? "Remove from wishlist" : "Add to wishlist"}
          </span>
        </Button>
        {isInCart && (
          <div className="absolute top-4 left-4 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded shadow z-10">
            Added
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="flex flex-col flex-grow">
        {/* Product Info and Price Row */}
        <div className="flex justify-between items-start mb-3">
          {/* Product Info Block */}
          <div className="flex-1 pr-2">
            <h3 className="text-sm font-medium mb-1">
              <Link
                href={`/products/${product.id}`}
                className="hover:text-primary"
              >
                {product.name}
              </Link>
            </h3>
            {product.categoryName &&
              product.categoryName !== "Uncategorized" && (
                <p className="text-sm text-muted-foreground">
                  {product.categoryName}
                </p>
              )}
          </div>

          {/* Price Block */}
          <div className="flex-shrink-0">
            <p className="font-medium text-right">
              ₹{product.price.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Add to Cart Button */}
        <div className="mt-auto">
          {!isInCart ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                addToCart({
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  image: product.image,
                  quantity: 1,
                });
                toast.success(`${product.name} added to cart!`);
              }}
            >
              Add to Cart
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="w-full"
              onClick={() => {
                removeFromCart(product.id);
                toast.success(`${product.name} removed from cart!`);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove from Cart
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
