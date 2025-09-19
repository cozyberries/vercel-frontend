"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, Plus, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimplifiedProduct } from "@/lib/services/api";
import { useCart } from "./cart-context";
import { useWishlist } from "./wishlist-context";
import { toast } from "sonner";
import { images } from "@/app/assets/images";
import ProductQuickViewModal from "./ProductQuickViewModal";

interface ProductCardProps {
  product: SimplifiedProduct;
}

export default function ProductCard({ product }: ProductCardProps) {
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);
  const { addToCart, removeFromCart, cart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const router = useRouter();
  const isInCart = cart.some((item) => item.id === product.id);
  const inWishlist = isInWishlist(product.id);

  return (
    <div
      key={product.id}
      className="group flex flex-col h-full overflow-hidden "
    >
      {/* Image Section */}
      <div className="relative overflow-hidden bg-[#f5f5f5] border md:h-[76%] h-4/6">
        <Link href={`/products/${product.id}`}>
          <Image
            src={product.image || images.staticProductImage}
            alt={product.name}
            width={500}
            height={500}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </Link>
        {/* Eye Icon Button for Quick View */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 left-4 bg-white/80 hover:bg-white rounded-full h-8 w-8 opacity-60 sm:opacity-0 sm:group-hover:opacity-60 transition-opacity duration-200"
          onClick={(e) => {
            e.preventDefault();
            setIsQuickViewOpen(true);
          }}
        >
          <Eye className="h-4 w-4" />
          <span className="sr-only">Quick view</span>
        </Button>

        {/* Heart Icon Button for Wishlist */}
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
          <div className="absolute bottom-4 left-4 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded shadow z-10">
            Added
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="flex flex-col md:h-[24%] h-2/6 py-1  justify-between">
        {/* Product Info and Price Row */}
        <div className="flex justify-between items-start">
          {/* Product Info Block */}
          <div className="flex-1 pr-2">
            <h3 className="text-sm font-medium mb-1 line-clamp-1">
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

        {/* Action Buttons */}
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
              <Plus className="h-4 w-4" />
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
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Product Quick View Modal */}
      <ProductQuickViewModal
        productId={product.id}
        isOpen={isQuickViewOpen}
        onClose={() => setIsQuickViewOpen(false)}
      />
    </div>
  );
}
