"use client";

import { useState } from "react";
import SupabaseImage from "@/components/ui/supabase-image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Check, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import QuickAddDialog from "./QuickAddDialog";
import { Product, ProductVariant } from "@/lib/services/api";
import { useWishlist } from "./wishlist-context";
import { useAuthGate } from "./auth-gate-context";
import { toast } from "sonner";
import { images } from "@/app/assets/images";
import { getMinPrice } from "@/lib/utils";
import { slugToTitle } from "@/lib/utils/product";
import { sizeKey, type SizeOption } from "@/lib/utils/cart-edit";
import { useProductCartEdit } from "@/hooks/useProductCartEdit";
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
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { requireAuthForIntent } = useAuthGate();
  const inWishlist = isInWishlist(product.id);
  const hasVariants =
    (product.variants?.length ?? 0) > 0 || (product.sizes?.length ?? 0) > 0;

  // Every size, sold out or not; the picker shows the ones in stock plus any still in the cart.
  const sizeOptions: SizeOption[] =
    hasVariants
      ? (product.variants?.length ?? 0) > 0
        ? (product.variants as ProductVariant[]).map((v) => ({
            size: v.size,
            color: v.color,
            price: v.price,
            label:
              [v.size, v.color].filter(Boolean).join(" / ") || v.size || "—",
            stock: v.stock_quantity ?? 0,
          }))
        : (product.sizes ?? []).map((s) => ({
            size: s.name,
            price: s.price,
            label: s.name,
            stock: s.stock_quantity ?? 0,
          }))
      : [{ price: product.price, label: "Add", stock: product.stock_quantity ?? 0 }];
  const addOptions = hasVariants ? sizeOptions.filter((o) => o.stock > 0) : sizeOptions;

  // Nothing left to sell: every size/variant is at zero (they are filtered out above), or the
  // product itself has no stock. Shown as a badge and a disabled Add button.
  const soldOut = addOptions.length === 0 || addOptions.every((o) => o.stock <= 0);

  const { min: minPrice, hasRange } = getMinPrice(product);

  const { cartCounts, saveCartChanges } = useProductCartEdit(
    { id: product.id, name: product.name, image: product.images?.[0] },
    sizeOptions
  );
  const cartQuantityForProduct = Object.values(cartCounts).reduce((sum, n) => sum + n, 0);
  const inCart = cartQuantityForProduct > 0;
  // A size that sold out after it was added stays in the picker, so it can still be lowered or removed.
  const pickerOptions = hasVariants
    ? sizeOptions.filter((o) => o.stock > 0 || (cartCounts[sizeKey(o.size)] ?? 0) > 0)
    : sizeOptions;

  // A product without sizes that is not in the cart yet: one tap adds one, no picker.
  const handleAddWithoutSize = () => {
    const stockQty = addOptions[0]?.stock ?? 0;
    if (stockQty <= 0) {
      toast.error("This option is out of stock");
      return;
    }
    if (stockQty < 3) {
      toast.warning(`Only ${stockQty} item${stockQty === 1 ? " is" : "s are"} available.`);
    }
    saveCartChanges([{ kind: "add", size: "", quantity: 1 }], "added");
  };

  const handleCardClick = () => {
    try {
      sessionStorage.setItem("productsPageScrollToIndex", String(index));
    } catch {
      // sessionStorage may be unavailable
    }
    router.push(`/products/${product.id}`);
  };

  return (
    <div
      className="group flex flex-col overflow-hidden bg-white transition-[shadow,transform] duration-300 shadow-cb-sm lg:shadow-cb-sm lg:border lg:border-cb-border/50 lg:hover:shadow-cb-md lg:hover:-translate-y-0.5 cursor-pointer rounded-[18px]"
      onClick={handleCardClick}
    >
      {/* Image Section — fixed 4:5 aspect at every breakpoint, so absolutely-positioned
          icons stay anchored to the actual photo instead of an undefined-height parent */}
      <div className="relative overflow-hidden aspect-[4/5]">
        {/* Sold out takes the sticker slot; Featured is not worth shouting about when it can't be bought */}
        {soldOut ? (
          <span
            className="absolute top-2 left-2 z-20 inline-flex items-center text-white text-[11px] font-extrabold tracking-[0.02em] px-2.5 py-1.5 shadow-md bg-cb-espresso"
            style={{
              transform: "rotate(-6deg)",
              borderRadius: "9999px 9999px 9999px 3px",
            }}
          >
            Sold out
          </span>
        ) : product.is_featured && (
          <span
            className="absolute top-2 left-2 z-20 inline-flex items-center gap-1 text-white text-[11px] font-extrabold tracking-[0.02em] px-2.5 py-1.5 shadow-md bg-cb-amber"
            style={{
              transform: "rotate(-6deg)",
              borderRadius: "9999px 9999px 9999px 3px",
            }}
          >
            Featured
          </span>
        )}
        <Link href={`/products/${product.id}`}>
          {/* First Image — text/content renders first; image loads lazily (except first 3) */}
          <SupabaseImage
            src={product.images?.[0] ?? images.staticProductImage}
            alt={product.name}
            preset="list"
            width={600}
            height={750}
            sizes={
              currentView === "list"
                ? "(max-width: 1023px) 100vw, 25vw"
                : "(max-width: 1023px) 50vw, 25vw"
            }
            priority={index < 4}
            className={`w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 ${soldOut ? "opacity-60" : ""}`}
          />
        </Link>

        {/* Wishlist — always visible, top-right */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-10 h-[34px] w-[34px] rounded-full bg-white/90 hover:bg-white shadow-md hover:shadow-lg border-0"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (inWishlist) {
              removeFromWishlist(product.id);
              toast.success(`${product.name} removed from wishlist!`);
            } else {
              const item = {
                id: product.id,
                name: product.name,
                price: product.price,
                image: product.images?.[0],
                size: product.sizes?.[0]?.name ?? "",
                color: product.variants?.[0]?.color ?? "",
              };
              if (!requireAuthForIntent({ type: "wishlist", item })) return;
              addToWishlist(item);
              toast.success(`${product.name} added to wishlist!`);
            }
          }}
          aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart
            size={16}
            className={`transition-colors duration-200 ${inWishlist ? "text-cb-destructive fill-cb-destructive" : "text-cb-fg"
              }`}
          />
        </Button>

        {/* Add to cart / edit what is in the cart — always visible, bottom-right */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute bottom-2 right-2 z-10 h-[38px] min-w-[38px] rounded-full shadow-md hover:shadow-lg border-0 bg-cb-terracotta hover:bg-cb-terracotta-deep px-2.5 disabled:opacity-60 disabled:pointer-events-auto disabled:cursor-not-allowed"
          disabled={soldOut && !inCart}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (inCart || (hasVariants && !soldOut)) {
              setQuickAddOpen(true);
            } else if (!soldOut) {
              handleAddWithoutSize();
            }
          }}
          aria-label={
            inCart ? `In cart: ${cartQuantityForProduct} — edit` : soldOut ? "Sold out" : "Add to cart"
          }
        >
          {inCart ? (
            <span className="flex items-center gap-1 text-white">
              <Check className="h-4 w-4" />
              <span className="text-[13.5px] font-extrabold">{cartQuantityForProduct}</span>
            </span>
          ) : (
            <Plus className="h-[18px] w-[18px] text-white" />
          )}
        </Button>

        <QuickAddDialog
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          productName={product.name}
          productImage={product.images?.[0]}
          productColor={product.variants?.[0]?.color ?? (product.colors?.[0] ? slugToTitle(product.colors[0]) : undefined)}
          addOptions={pickerOptions}
          cartCounts={cartCounts}
          onConfirm={saveCartChanges}
        />
      </div>

      {/* Content Section */}
      <div className="flex flex-col min-h-0 pt-[9px] px-[10px] pb-[11px] bg-white gap-[5px]">
        {/* Product title */}
        <h3 className="text-[13.5px] font-semibold text-cb-fg leading-[1.25]">
          <Link href={`/products/${product.id}`}>{product.name}</Link>
        </h3>

        {/* Colour */}
        {(product.variants?.[0]?.color || product.colors?.[0]) && (
          <p className="text-[11.5px] text-cb-muted-fg -mt-0.5">
            {product.variants?.[0]?.color ?? (product.colors?.[0] ? slugToTitle(product.colors[0]) : null)}
          </p>
        )}

        <DiscountedPrice price={minPrice} showStartsAt={hasRange} />
      </div>
    </div>
  );
}
