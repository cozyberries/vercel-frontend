"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimplifiedProduct } from "@/lib/services/api";
import { useCart } from "./cart-context";
import { useWishlist } from "./wishlist-context";
import { toast } from "sonner";

interface ProductCardProps {
  product: SimplifiedProduct;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addToCart, removeFromCart, cart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const isInCart = cart.some((item) => item.id === product.id);
  const inWishlist = isInWishlist(product.id);
  return (
    <div key={product.id} className="group">
      <div className="relative mb-4 overflow-hidden bg-[#f5f5f5]">
        <Link href={`/products/${product.id}`}>
          <Image
            src={
              // product.image ||
              "https://thelittlebunny.in/cdn/shop/files/E83689CF-8048-436C-B8E4-0FEFB62F3BA8.jpg?v=1714489289"
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
        <div className="absolute bottom-0 left-0 right-0 bg-white/30 border border-gray-300 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex flex-row gap-2 p-2 justify-center rounded-b-lg">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
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
            disabled={isInCart}
          >
            <Plus className="h-5 w-5" />
            <span className="sr-only">Add to Cart</span>
          </Button>
          {isInCart && (
            <Button
              variant="destructive"
              size="icon"
              className="rounded-full"
              onClick={() => {
                removeFromCart(product.id);
                toast.success(`${product.name} removed from cart!`);
              }}
            >
              <Trash2 className="h-5 w-5" />
              <span className="sr-only">Remove from cart</span>
            </Button>
          )}
        </div>
      </div>
      <div className="text-center">
        <h3 className="text-sm font-medium mb-1">
          <Link href={`/products/${product.id}`} className="hover:text-primary">
            {product.name}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground mb-1">{product.category}</p>
        <p className="font-medium">₹{product.price.toFixed(2)}</p>
      </div>
    </div>
  );
}
