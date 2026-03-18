"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingCart, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Product, SizeOption, ProductVariant } from "@/lib/services/api";
import { useWishlist } from "./wishlist-context";
import { useCart, getCartItemKey } from "./cart-context";
import { toast } from "sonner";
import { images } from "@/app/assets/images";
import { formatPrice, getMinPrice } from "@/lib/utils";
import { toImageSrc } from "@/lib/utils/image";
import DiscountedPrice from '@/components/discounted-price';

interface ProductCardProps {
  product: Product;
  index: number; // Used to set image loading priority (e.g. priority for first N images)
  currentView: "grid" | "list";
  /** BCP 47 locale for price formatting (default: "en-IN") */
  locale?: string;
  /** ISO 4217 currency code (default: "INR") */
  currency?: string;
}

export default function ProductCard({ product, index, currentView, locale = "en-IN", currency = "INR" }: ProductCardProps) {
  const router = useRouter();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { addToCart, updateQuantity, removeFromCart, cart } = useCart();
  const inWishlist = isInWishlist(product.id);
  const hasVariants =
    (product.variants?.length ?? 0) > 0 || (product.sizes?.length ?? 0) > 0;

  const getStockForVariant = (size?: string, color?: string): number => {
    if ((product.variants?.length ?? 0) > 0) {
      const v = (product.variants as ProductVariant[]).find(
        (x) => x.size === size && (x.color ?? "") === (color ?? "")
      );
      return v?.stock_quantity ?? 0;
    }
    if ((product.sizes?.length ?? 0) > 0 && size) {
      const s = product.sizes.find((x) => x.name === size);
      return s?.stock_quantity ?? 0;
    }
    return product.stock_quantity ?? 0;
  };

  const addOptions: { size?: string; color?: string; price: number; label: string; stock: number }[] =
    hasVariants
      ? (product.variants?.length ?? 0) > 0
        ? (product.variants as ProductVariant[])
          .filter((v) => (v.stock_quantity ?? 0) > 0)
          .map((v) => ({
            size: v.size,
            color: v.color,
            price: v.price,
            label:
              [v.size, v.color].filter(Boolean).join(" / ") || v.size || "—",
            stock: v.stock_quantity ?? 0,
          }))
        : (product.sizes ?? [])
          .filter((s) => (s.stock_quantity ?? 0) > 0)
          .map((s) => ({
            size: s.name,
            price: s.price,
            label: s.name,
            stock: s.stock_quantity ?? 0,
          }))
      : [{ price: product.price, label: "Add", stock: product.stock_quantity ?? 0 }];

  const { min: minPrice, hasRange } = getMinPrice(product);

  const getCartItemForVariant = (size?: string, color?: string) =>
    cart.find(
      (item) =>
        getCartItemKey(item) ===
        getCartItemKey({ id: product.id, size, color })
    );

  const handleAddVariant = (
    size?: string,
    color?: string,
    price?: number,
    basePrice?: number,
    stock?: number
  ) => {
    // Cart stores price (GST-inclusive); honor basePrice when price is undefined
    const itemPrice = price ?? basePrice ?? product.price;
    const existing = getCartItemForVariant(size, color);
    const stockQty = stock ?? getStockForVariant(size, color);
    if (stockQty <= 0) {
      toast.error("This option is out of stock");
      return;
    }
    if (existing && existing.quantity >= stockQty) {
      toast.error(`Only ${stockQty} item${stockQty === 1 ? " is" : "s are"} available. Cannot add more.`);
      return;
    }
    if (stockQty < 3) {
      toast.warning(`Only ${stockQty} item${stockQty === 1 ? " is" : "s are"} available.`);
    }
    if (existing) {
      const newQty = Math.min(existing.quantity + 1, stockQty);
      updateQuantity(product.id, newQty, existing.size, existing.color);
      toast.success(newQty === stockQty ? `Maximum ${stockQty} in cart` : `${product.name} quantity updated in cart`);
    } else {
      addToCart({
        id: product.id,
        name: product.name,
        price: itemPrice,
        image: product.images?.[0],
        quantity: 1,
        stock_quantity: stockQty,
        ...(size ? { size } : {}),
        ...(color ? { color } : {}),
      });
      toast.success(`${product.name} added to cart!`);
    }
  };

  const handleRemoveVariant = (size?: string, color?: string) => {
    const existing = getCartItemForVariant(size, color);
    if (!existing) return;
    if (existing.quantity <= 1) {
      removeFromCart(product.id, size, color);
      toast.success(`${product.name} removed from cart`);
    } else {
      updateQuantity(
        product.id,
        existing.quantity - 1,
        existing.size,
        existing.color
      );
      toast.success(`${product.name} quantity updated in cart`);
    }
  };

  const anyVariantInCart = addOptions.some((opt) =>
    getCartItemForVariant(opt.size, opt.color)
  );

  const handleCardClick = () => {
    try {
      sessionStorage.setItem("productsPageScrollToIndex", String(index));
    } catch {
      // sessionStorage may be unavailable
    }
    router.push(`/products/${product.id}`);
  };

  const cartQuantityForProduct = cart
    .filter(item => item.id === product.id)
    .reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div
      className="group flex flex-col overflow-hidden bg-white transition-[shadow,transform] duration-300 shadow-sm lg:shadow-sm lg:border lg:border-gray-200/50 lg:hover:shadow-md cursor-pointer rounded-2xl"
      onClick={handleCardClick}
    >
      {/* Image Section */}
      <div
        className="relative overflow-hidden aspect-[4/5] lg:aspect-auto lg:h-[78%] lg:min-h-[250px]"
      >
        {/* Featured Badge */}
        {product.is_featured && (
          <span className="absolute top-3 left-1/2 transform -translate-x-1/2 z-20 bg-amber-500 text-white text-xs lg:text-[10px] font-semibold px-2.5 py-1 lg:px-2 lg:py-0.5 rounded-full shadow-md">
            Featured
          </span>
        )}
        <Link href={`/products/${product.id}`}>
          {/* First Image — text/content renders first; image loads lazily (except first 3) */}
          <Image
            src={toImageSrc(product.images?.[0], images.staticProductImage, "list")}
            alt={product.name}
            width={600}
            height={750}
            sizes={
              currentView === "list"
                ? "100vw"
                : "(max-width: 1023px) 50vw, 25vw"
            }
            priority={index < 4}
            loading={index < 4 ? "eager" : "lazy"}
            decoding="async"
            className="w-full h-full object-cover"
          />
        </Link>

        {/* Wishlist top-left, Add to cart top-right */}
        <div className="absolute top-2.5 left-2.5 right-2.5 lg:top-2 lg:left-2 lg:right-2 z-10 flex justify-between items-start pointer-events-none lg:pointer-events-auto lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 lg:h-8 lg:w-8 rounded-full bg-white/90 hover:bg-white shadow-md hover:shadow-lg pointer-events-auto border-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (inWishlist) {
                removeFromWishlist(product.id);
                toast.success(`${product.name} removed from wishlist!`);
              } else {
                addToWishlist({
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  image: product.images?.[0],
                  size: product.sizes?.[0]?.name ?? "",
                  color: product.variants?.[0]?.color ?? "",
                });
                toast.success(`${product.name} added to wishlist!`);
              }
            }}
            aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
          >
            <Heart
              size={20}
              className={`transition-colors duration-200 ${inWishlist ? "text-red-500 fill-red-500" : "text-gray-600 hover:text-red-500"
                }`}
            />
          </Button>
          {hasVariants ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 lg:h-8 lg:w-8 rounded-full shadow-md hover:shadow-lg pointer-events-auto border-0 bg-white/90 hover:bg-white"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  aria-label="Add to cart"
                >
                  <div className="relative">
                    <ShoppingCart
                      className={`h-5 w-5 lg:h-4 lg:w-4 transition-all duration-200 ${anyVariantInCart
                        ? "text-green-700"
                        : "text-gray-700 hover:text-primary hover:scale-110"
                        }`}
                    />
                    {anyVariantInCart && (
                      <div className="absolute -top-3 -right-2 bg-red-500 text-white text-[9px] rounded-full h-4 w-4 flex items-center justify-center font-bold shadow-md border border-white">
                        {cartQuantityForProduct}
                      </div>
                    )}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="top"
                collisionPadding={{ bottom: 72 }}
                className="min-w-[150px] max-h-[min(50vh,260px)] overflow-y-auto pl-2 pr-0 py-1"
                onClick={(e) => e.stopPropagation()}
              >
                {addOptions.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Out of stock
                  </div>
                ) : (
                  addOptions.map((opt) => {
                    const existing = getCartItemForVariant(opt.size, opt.color);
                    const inCart = !!existing;
                    return (
                      <div
                        key={opt.label + (opt.size ?? "") + (opt.color ?? "")}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAddVariant(opt.size, opt.color, opt.price);
                        }}
                        className={`flex items-center justify-between gap-1 rounded-sm py-1.5 text-sm hover:bg-accent/50 ${inCart ? "bg-accent" : ""}`}
                      >
                        <div className="flex min-w-0 shrink flex-col">
                          <span className="truncate font-medium">{opt.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatPrice(opt.price, locale, currency)}
                          </span>
                        </div>
                        <div className="shrink-0 pl-1">
                          {inCart && existing ? (
                            <div
                              className="flex items-center gap-0.5 border rounded-md overflow-hidden"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded-none hover:bg-accent"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleRemoveVariant(opt.size, opt.color);
                                }}
                                aria-label="Decrease quantity"
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="min-w-[1.25rem] text-center text-xs">
                                {existing.quantity}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded-none hover:bg-accent"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleAddVariant(opt.size, opt.color, opt.price);
                                }}
                                aria-label="Increase quantity"
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 shrink-0 text-xs"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleAddVariant(opt.size, opt.color, opt.price);
                              }}
                            >
                              Add
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 lg:h-8 lg:w-8 rounded-full shadow-md hover:shadow-lg pointer-events-auto border-0 ${anyVariantInCart
                ? "bg-primary/10 hover:bg-primary/20 ring-2 ring-primary/50"
                : "bg-white/90 hover:bg-white"
                }`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAddVariant(undefined, undefined, undefined, undefined, addOptions[0]?.stock);              
              }}
              aria-label={anyVariantInCart ? "Add another" : "Add to cart"}
            >
              <ShoppingCart
                className={`h-5 w-5 lg:h-4 lg:w-4 transition-colors duration-200 ${anyVariantInCart
                  ? "fill-primary text-primary"
                  : "text-gray-700 hover:text-primary"
                  }`}
              />
            </Button>
          )}
        </div>
      </div>

      {/* Content Section */}
      <div className="flex flex-col min-h-0 px-3 py-2.5 lg:h-[22%] lg:px-3 lg:py-2 justify-between bg-white gap-1 lg:gap-0 lg:border-t lg:border-gray-200/50">
        {/* Product title */}
        <h3 className={`lg:text-[.85rem] font-semibold text-gray-900 group-hover:text-primary transition-colors duration-200 ${currentView === "list" ? "text-[14px]" : "text-[12px]"}`}>
          <Link href={`/products/${product.id}`}>{product.name}</Link>
        </h3>

        {/* Available Sizes */}
        {product.sizes && product.sizes.length > 0 && (
          <div
            className="flex gap-1.5 lg:gap-1 items-center flex-wrap flex-shrink-0 overflow-x-auto overflow-y-hidden scroll-smooth pb-0.5 -mx-0.5 px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ WebkitOverflowScrolling: "touch" }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if ((e.target as HTMLElement).closest("a") == null) handleCardClick();
            }}
            role="region"
            aria-label="Available sizes"
          >
            {product.sizes.map((size: SizeOption) => (
              <Link
                key={size.name}
                href={`/products/${product.id}?size=${encodeURIComponent(size.name)}`}
                onClick={(e) => e.stopPropagation()}
                className={`shrink-0 text-xs lg:text-[10px] px-1.5 lg:px-1 py-0.5 rounded-md lg:rounded border whitespace-nowrap inline-block ${(size.stock_quantity ?? 0) > 0
                  ? "border-gray-300 text-gray-600 hover:border-primary hover:text-primary"
                  : "border-gray-200 text-gray-300 line-through pointer-events-none"
                  }`}
              >
                {size.name}
              </Link>
            ))}
          </div>
        )}

        {/* Category and Price */}
        <div className={`flex sm:flex-row sm:items-center justify-between flex-shrink-0 gap-2 sm:gap-0 ${currentView === "list" ? "flex-row" : "flex-col"}`}>
          {product.categories?.name && (
            <p className="text-xs sm:lg:text-[10px] text-gray-500 font-medium flex-shrink-0">
              {product.categories.name}
            </p>
          )}
          <DiscountedPrice price={minPrice} showStartsAt={hasRange} />
        </div>
      </div>
    </div>
  );
}
