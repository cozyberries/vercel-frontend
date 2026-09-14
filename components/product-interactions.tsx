"use client";

import React, { useState, useEffect, useRef } from "react";
import SupabaseImage from "@/components/ui/supabase-image";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Minus, Plus, Truck, Flame, Ruler, Leaf, RotateCcw, ShoppingBag, Check, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Chip } from "@/components/ui/chip";
import { Product, SizeOption } from "@/lib/services/api";
import { slugToTitle } from "@/lib/utils/product";
import { BASE_COLOUR_SWATCHES, FALLBACK_SWATCH, baseColourSlug } from "@/lib/catalog/colours";
import { useCart, getCartItemKey } from "./cart-context";
import { useAuthGate } from "./auth-gate-context";
import { toast } from "sonner";
import Reviews from "./reviews";
import { RatingItem, useRating } from "./rating-context";
import ViewReview from "./view_review";
import WriteReviewDialog from "./rating/WriteReviewDialog";
import SizeGuideDialog from "./SizeGuideDialog";
import { useAuth } from "./supabase-auth-provider";
import { useFeaturedProducts } from "@/hooks/useApiQueries";
import DiscountedPrice from '@/components/discounted-price'
import PincodeChecker from "./PincodeChecker"
import QuickAddDialog from "./QuickAddDialog"
import ProductCard from "./product-card"

const TRUST_BADGES = [
  { icon: Leaf, label: "100% Organic" },
  { icon: Truck, label: "Ships in 2–4 days" },
  { icon: RotateCcw, label: "Easy returns" },
];

function AccordionSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-cb-border py-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-bold text-cb-fg">{title}</span>
        {open ? <Minus className="h-4 w-4 text-cb-fg" /> : <Plus className="h-4 w-4 text-cb-fg" />}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

import { sendNotification } from "@/lib/utils/notify";
import { sendActivity } from "@/lib/utils/activities";
import { FREE_DELIVERY_THRESHOLD } from "@/lib/constants";
import { trackViewContent } from "@/lib/analytics/meta-pixel";

interface ReviewItem {
  userName: string;
  title?: string | null;
  rating: number;
  review: string;
  images?: string[];
}

interface ProductInteractionsProps {
  product: Product;
  initialSize?: string;
  staticContent: React.ReactNode;
  /** Server-rendered same-category products. When provided, no client fetch happens. */
  relatedProducts?: Product[];
}

// Design shows only the top 3 feature chips near the price; the full list
// reappears as a bulleted "Features" accordion further down the page.
const TOP_CHIP_COUNT = 3;

export default function ProductInteractions({ product, initialSize: initialSizeProp, staticContent, relatedProducts: relatedProductsProp }: ProductInteractionsProps) {
  // Read ?size= from the URL after mount. useSearchParams() would bail the statically rendered
  // product page out to client-side rendering (the HTML shipped only the loading skeleton).
  const [sizeFromUrl, setSizeFromUrl] = useState<string | null>(null);
  useEffect(() => {
    setSizeFromUrl(new URLSearchParams(window.location.search).get("size"));
  }, []);
  const initialSize = sizeFromUrl ?? initialSizeProp;

  const productSlug = product.slug ?? product.id ?? "";
  const topFeatures = (product.features ?? []).slice(0, TOP_CHIP_COUNT);

  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<SizeOption | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<number>(0);
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [showMobileImageModal, setShowMobileImageModal] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [hasSwiped, setHasSwiped] = useState(false);
  const swipeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartYRef = useRef<number>(0);
  const touchEndYRef = useRef<number>(0);
  const [allReviews, setAllReviews] = useState<ReviewItem[]>([]);
  const { reviews, showViewReviewModal, fetchReviews, setProductSlug } = useRating();
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [bundleChecked, setBundleChecked] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const { addToCart, cart } = useCart();
  const { requireAuthForIntent } = useAuthGate();
  const router = useRouter();

  const { data: allFeaturedData } = useFeaturedProducts(12, { enabled: relatedProductsProp === undefined });
  const relatedProducts =
    relatedProductsProp ??
    (allFeaturedData ?? []).filter(
      (p: Product) => p.slug !== product.slug && p.category_slug === product.category_slug
    );

  const isInCart = cart.some(
    (item) =>
      getCartItemKey(item) ===
      getCartItemKey({
        id: product?.id ?? "",
        size: selectedSize?.name,
        color: selectedColor || undefined,
      })
  );


  const handleWriteReview = () => {
    if (!user) {
      toast.error("Please login to write a review");
      router.push("/login");
      return;
    }
    setShowReviewForm(true);
  };

  const handleSubmitRating = async (data: { rating: number; title: string; comment: string }) => {
    setIsSubmittingRating(true);
    try {
      const formData = new FormData();
      formData.append("user_id", user?.id ?? "");
      formData.append("product_slug", productSlug);
      formData.append("rating", String(data.rating));
      if (data.title) formData.append("title", data.title);
      if (data.comment) formData.append("comment", data.comment);
      const response = await fetch("/api/ratings", {
        method: "POST",
        body: formData,
      });
      if (response.ok) {
        setShowReviewForm(false);
        // Refresh reviews
        await fetchReviews(productSlug);

        // Fire and forget notifications (non-blocking)
        sendNotification(
          "Rating Submitted",
          `User ${user?.id} has submitted a rating for product #${productSlug}`,
          "success"
        ).catch((error) => console.error("Failed to send notification:", error));

        sendActivity(
          "rating_submission_success",
          `User ${user?.id} submitted a rating for product #${productSlug}`,
          productSlug
        ).catch((error) => console.error("Failed to log activity:", error));

        toast.success("Review submitted successfully!");
      } else {
        toast.error("Failed to submit review");
        sendActivity(
          "rating_submission_failed",
          `User ${user?.id} failed to submit a rating for product #${productSlug}`,
          productSlug
        ).catch((error) => console.error("Failed to log activity:", error));
      }
    } catch (error) {
      console.error("Error submitting rating:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmittingRating(false);
    }
  };

  // Meta Pixel — ViewContent
  useEffect(() => {
    trackViewContent({ id: product.id, name: product.name, price: product.price });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // Scroll to top on product change (e.g. clicking a related product)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [productSlug]);

  // Set the product slug in the rating context so reviews are fetched and the review form knows the target product
  useEffect(() => {
    if (productSlug) {
      setProductSlug(productSlug);
    }
  }, [productSlug, setProductSlug]);

  // Check if mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Build the display review list for this product from the shared rating context
  useEffect(() => {
    if (!productSlug || !reviews || reviews.length === 0) return;
    try {
      const productReviews = reviews.filter((rev) => rev.product_slug === productSlug);
      setAllReviews(
        productReviews.map((rev: RatingItem) => ({
          userName: rev.user_name || "Unknown User",
          title: rev.title,
          review: rev.comment,
          rating: rev.rating,
          images: rev.images,
        }))
      );
    } catch (error) {
      console.error('[fetchReviewsLocal] Failed to build review list', {
        error,
        productSlug,
        reviewCount: reviews?.length ?? 0,
      });
    }
  }, [reviews, productSlug]);

  useEffect(() => {
    // Set default selections if product is loaded
    if (product) {
      if (product.sizes && product.sizes.length > 0) {
        const fromUrl = initialSize
          ? product.sizes.find((s) => s.name === initialSize)
          : null;
        const inStockSize = product.sizes.find((s) => (s.stock_quantity ?? 0) > 0);
        setSelectedSize(fromUrl ?? inStockSize ?? product.sizes[0]);
      }
      if (product.colors && product.colors.length > 0) {
        setSelectedColor(product.colors[0]);
      }
    }
  }, [product, initialSize]);

  // Base variant price (MRP). Cart always stores the original catalog price so the backend
  // can validate against the DB and apply the coupon discount at order level.
  // getDiscountedPrice is used only for display (hero, chips, DiscountedPrice component).
  const displayPrice = selectedSize?.price ?? product?.price ?? 0;

  const availableStock = selectedSize != null ? (selectedSize.stock_quantity ?? 0) : (product?.stock_quantity ?? 0);
  // Every size at zero (or, without sizes, the product itself): nothing can be added to the cart.
  const soldOut =
    (product.sizes?.length ?? 0) > 0
      ? !product.sizes.some((s) => (s.stock_quantity ?? 0) > 0)
      : (product.stock_quantity ?? 0) <= 0;
  const currentVariantKey = getCartItemKey({
    id: product?.id ?? "",
    size: selectedSize?.name,
    color: selectedColor || undefined,
  });
  const existingCartItem = cart.find((i) => getCartItemKey(i) === currentVariantKey);
  const existingCartQty = existingCartItem?.quantity ?? 0;
  const maxCanAdd = Math.max(0, availableStock - existingCartQty);

  const addOptions = (product.sizes ?? []).map((s) => ({
    size: s.name,
    color: selectedColor || undefined,
    price: s.price,
    label: s.name,
    stock: s.stock_quantity ?? 0,
  }));

  const handleQuickAddConfirm = (size: string | undefined, qty: number) => {
    const opt = addOptions.find((o) => o.size === size);
    if (!opt) return;
    const stock = opt.stock ?? 0;
    const existingKey = getCartItemKey({ id: product.id, size, color: selectedColor || undefined });
    const existingQty = cart.find((i) => getCartItemKey(i) === existingKey)?.quantity ?? 0;
    const room = Math.max(0, stock - existingQty);
    if (room <= 0) {
      toast.warning(`Only ${stock} item${stock === 1 ? "" : "s"} are available`);
      return;
    }
    const qtyToAdd = Math.min(qty, room);
    if (qty > room) {
      toast.warning(`Only ${stock} item${stock === 1 ? "" : "s"} are available`);
    }
    const cartItem = {
      id: product.id,
      name: product.name,
      price: opt.price,
      image: product.images?.[0],
      quantity: qtyToAdd,
      stock_quantity: stock,
      ...(selectedColor ? { color: selectedColor } : {}),
      size,
    };
    if (!requireAuthForIntent({ type: "cart", item: cartItem })) return;
    addToCart(cartItem);
    toast.success(`${product.name} added to cart!`);
  };

  // "Frequently bought together" — real related products (same category), each
  // defaulted to its first in-stock size. No real bundle discount exists, so the
  // total is just a straight sum of the checked items' prices.
  type BundleEntry = { id: string; name: string; image?: string; price: number; size?: string; stock: number; slug?: string };

  const bundleItems: BundleEntry[] = [
    {
      id: product.id,
      name: product.name,
      image: product.images?.[0],
      price: selectedSize?.price ?? product.price,
      size: selectedSize?.name ?? product.sizes?.[0]?.name,
      stock: availableStock,
    },
    ...relatedProducts.slice(0, 2).map((rp) => {
      const rpSize = rp.sizes?.find((s) => (s.stock_quantity ?? 0) > 0) ?? rp.sizes?.[0];
      return {
        id: rp.id,
        name: rp.name,
        image: rp.images?.[0],
        price: rpSize?.price ?? rp.price,
        size: rpSize?.name,
        stock: rpSize?.stock_quantity ?? rp.stock_quantity,
        slug: rp.slug,
      };
    }),
  ];
  const bundleCheckedCount = bundleItems.filter((it) => bundleChecked[it.id] ?? true).length;
  const bundleTotal = bundleItems
    .filter((it) => bundleChecked[it.id] ?? true)
    .reduce((sum, it) => sum + it.price, 0);

  const handleAddBundle = () => {
    const checkedItems = bundleItems.filter((it) => bundleChecked[it.id] ?? true);
    if (checkedItems.length === 0) return;
    const [first, ...rest] = checkedItems;
    const firstPayload = {
      id: first.id,
      name: first.name,
      price: first.price,
      image: first.image,
      quantity: 1,
      stock_quantity: first.stock,
      ...(first.size ? { size: first.size } : {}),
    };
    if (!requireAuthForIntent({ type: "cart", item: firstPayload })) return;
    addToCart(firstPayload);
    rest.forEach((it) => {
      addToCart({
        id: it.id,
        name: it.name,
        price: it.price,
        image: it.image,
        quantity: 1,
        stock_quantity: it.stock,
        ...(it.size ? { size: it.size } : {}),
      });
    });
    toast.success(`${checkedItems.length} item${checkedItems.length === 1 ? "" : "s"} added to cart!`);
  };

  const incrementQuantity = () => {
    setQuantity((prev) => Math.min(prev + 1, maxCanAdd > 0 ? maxCanAdd : availableStock));
  }
  const decrementQuantity = () => {
    if (quantity > 1) {
      setQuantity((prev) => prev - 1);
    }
  };

  const handleImageMouseEnter = () => {
    if (!isMobile) {
      setShowZoomModal(true);
    }
  };

  const handleImageMouseLeave = () => {
    if (!isMobile) {
      setShowZoomModal(false);
    }
  };

  const handleImageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMobile) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setZoomPosition({ x, y });
    }
  };

  const triggerShakeAnimation = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 600);
  };

  // Swipe handlers for mobile image navigation
  const minSwipeDistance = 50;

  const setSelectedImageAnimated = (nextIndex: number) => {
    setSelectedImage(nextIndex);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    touchStartYRef.current = e.targetTouches[0].clientY;
    touchEndYRef.current = e.targetTouches[0].clientY;
    setHasSwiped(false);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
    touchEndYRef.current = e.targetTouches[0].clientY;
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    if (swipeTimeoutRef.current) {
      clearTimeout(swipeTimeoutRef.current);
      swipeTimeoutRef.current = null;
    }

    const distanceX = touchStart - touchEnd;
    const distanceY = Math.abs(touchEndYRef.current - touchStartYRef.current);
    const isHorizontalSwipe = Math.abs(distanceX) >= distanceY;
    const isLeftSwipe = isHorizontalSwipe && distanceX > minSwipeDistance;
    const isRightSwipe = isHorizontalSwipe && distanceX < -minSwipeDistance;

    if (isLeftSwipe && product?.images && selectedImage < product.images.length - 1) {
      setSelectedImageAnimated(selectedImage + 1);
      setHasSwiped(true);
    }
    if (isRightSwipe && selectedImage > 0) {
      setSelectedImageAnimated(selectedImage - 1);
      setHasSwiped(true);
    }

    setTouchStart(null);
    setTouchEnd(null);

    swipeTimeoutRef.current = setTimeout(() => {
      setHasSwiped(false);
      swipeTimeoutRef.current = null;
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (swipeTimeoutRef.current) {
        clearTimeout(swipeTimeoutRef.current);
        swipeTimeoutRef.current = null;
      }
    };
  }, []);

  // Auto-shake every 3 seconds if not in cart
  useEffect(() => {
    if (!isInCart) {
      const interval = setInterval(() => {
        triggerShakeAnimation();
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [isInCart]);

  return showViewReviewModal ? (
    <ViewReview reviews={allReviews} />
  ) : (
    <div className="container mx-auto px-4 py-4 md:py-8 pb-28 lg:pb-24">
      <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
        {/* Product Images */}
        <div className="space-y-4 lg:space-y-0 lg:flex lg:gap-4">
          {/* Thumbnail Gallery - Left Side (Large screens only) */}
          {product.images && product.images.length > 1 && (
            <div className="hidden lg:flex flex-col gap-2 w-20">
              {product.images.map((image, index) => (
                <div
                  key={index}
                  className={`aspect-square overflow-hidden bg-[#f5f5f5] cursor-pointer active:scale-90 transition-transform duration-100 ${index === selectedImage ? "ring-2 ring-primary" : ""
                    }`}
                  onClick={() => setSelectedImageAnimated(index)}
                >
                  <SupabaseImage
                    src={image}
                    preset="thumbnail"
                    alt={`${product.name} - View ${index + 1}`}
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
          {/* Main Image */}
          <div className="lg:flex-1">
            <div
              className={`aspect-square z-10 bg-[#f5f5f5] relative transition-[opacity,transform] duration-300 ease-out ${!isMobile
                  ? "cursor-zoom-in hover:shadow-lg hover:scale-[1.02]"
                  : "cursor-pointer touch-pan-y"
                }`}
              onMouseEnter={handleImageMouseEnter}
              onMouseLeave={handleImageMouseLeave}
              onMouseMove={handleImageMouseMove}
              onTouchStart={isMobile ? onTouchStart : undefined}
              onTouchMove={isMobile ? onTouchMove : undefined}
              onTouchEnd={isMobile ? onTouchEnd : undefined}
              onClick={() => {
                if (isMobile && !hasSwiped) {
                  setShowMobileImageModal(true);
                }
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  router.back();
                }}
                className="absolute top-2 left-2 rounded w-fit px-2 py-1 bg-black/30 backdrop-blur-sm flex items-center justify-center gap-1 text-white active:scale-90 transition-transform md:hidden z-20"
                aria-label="Go back"
              >
                <ChevronLeft className="h-5 w-5" />
                <span>Back</span>
              </button>

              {/* Featured badge — same rotated sticker used on product cards */}
              {product.is_featured && (
                <span
                  className="absolute top-12 md:top-3 left-3 z-20 inline-flex items-center gap-1 text-white text-[11px] font-extrabold tracking-[0.02em] px-2.5 py-1.5 shadow-md bg-cb-amber"
                  style={{
                    transform: "rotate(-6deg)",
                    borderRadius: "9999px 9999px 9999px 3px",
                  }}
                >
                  Featured
                </span>
              )}

              {/* Prev/Next arrows */}
              {product.images && product.images.length > 1 && (
                <>
                  {selectedImage > 0 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSelectedImageAnimated(selectedImage - 1); }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 z-20 rounded-full w-8 h-8 bg-white/80 backdrop-blur-sm flex items-center justify-center shadow active:scale-90 transition-transform"
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  )}
                  {selectedImage < product.images.length - 1 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSelectedImageAnimated(selectedImage + 1); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 z-20 rounded-full w-8 h-8 bg-white/80 backdrop-blur-sm flex items-center justify-center shadow active:scale-90 transition-transform"
                      aria-label="Next image"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}

              <motion.div
                // Key forces a re-mount so the "appear" animation runs on every change.
                key={selectedImage}
                initial={{ scale: isMobile ? 0.75 : 0.65, x: -42 }}
                animate={{ scale: 1, x: 0 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="w-full h-full"
                style={{ transformOrigin: "left center" }}
              >
                <SupabaseImage
                  src={product.images?.[selectedImage]}
                  preset="detail"
                  alt={product.name}
                  width={600}
                  height={600}
                  className="w-full h-full object-cover select-none"
                  priority
                  draggable={false}
                />
              </motion.div>

              {/* Preload other gallery images so switching is instant (same src = cache hit) */}
              {product.images && product.images.length > 1 && (
                <div
                  className="absolute left-0 top-0 w-0 h-0 overflow-hidden opacity-0 pointer-events-none"
                  aria-hidden
                >
                  {product.images.map(
                    (img, index) =>
                      index !== selectedImage && (
                        <SupabaseImage
                          key={index}
                          src={img}
                          preset="detail"
                          alt=""
                          width={600}
                          height={600}
                          className="object-cover"
                          draggable={false}
                          fetchPriority="low"
                        />
                      )
                  )}
                </div>
              )}

              {showZoomModal && !isMobile && (
                <div className="absolute top-0 -right-[100%] w-[35rem] h-96 bg-white shadow-2xl overflow-hidden rounded-xl animate-in fade-in-0 zoom-in-95 duration-300 ease-out">
                  <SupabaseImage
                    src={product.images?.[selectedImage]}
                    preset="detail"
                    alt={product.name}
                    width={800}
                    height={800}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 ease-out"
                    style={{
                      transform: `scale(2.5)`,
                      transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%`,
                    }}
                  />
                  {/* Zoom indicator */}
                  <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded animate-in fade-in-0 slide-in-from-top-2 duration-500 delay-100">
                    2.5x Zoom
                  </div>
                </div>
              )}

              {/* Zoom area indicator on main image - Desktop Only */}
              {showZoomModal && !isMobile && (
                <div
                  className="absolute border-2 border-white shadow-lg pointer-events-none animate-in fade-in-0 zoom-in-50 duration-200 ease-out"
                  style={{
                    width: "40px",
                    height: "40px",
                    left: `${zoomPosition.x}%`,
                    top: `${zoomPosition.y}%`,
                    transform: "translate(-50%, -50%)",
                    borderRadius: "50%",
                    backgroundColor: "rgba(255, 255, 255, 0.3)",
                    backdropFilter: "blur(1px)",
                    transition: "all 0.1s ease-out",
                    animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                  }}
                />
              )}
            </div>
          </div>

          {/* Thumbnail Gallery - Bottom (Small/Medium screens) */}
          {product.images && product.images.length > 1 && (
            <div className="grid grid-cols-6 gap-2 lg:hidden">
              {product.images.map((image, index) => (
                <div
                  key={index}
                  className={`aspect-square overflow-hidden bg-[#f5f5f5] cursor-pointer active:scale-90 transition-transform duration-100 ${index === selectedImage ? "ring-2 ring-primary" : ""
                    }`}
                  onClick={() => setSelectedImageAnimated(index)}
                >
                  <SupabaseImage
                    src={image}
                    preset="thumbnail"
                    alt={`${product.name} - View ${index + 1}`}
                    width={100}
                    height={100}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product Details */}
        <div className="flex flex-col">
          {/* Static content: title + wishlist button (h1 for SEO), category, colour name (RSC passed as prop) */}
          {staticContent}

          {/* Price: hero = MRP strikethrough + large payable + badge on one row */}
          <div className="mt-3 mb-2 flex flex-wrap items-center gap-3">
            <DiscountedPrice price={displayPrice} variant="hero" />
            {soldOut && (
              <span className="inline-flex items-center rounded-full bg-cb-espresso px-3 py-1 text-xs font-extrabold tracking-[0.02em] text-white">
                Sold out
              </span>
            )}
          </div>

          <p className="flex items-center gap-2 text-sm text-cb-success mb-2">
            <Truck className="h-4 w-4" />
            Free shipping on orders above ₹{FREE_DELIVERY_THRESHOLD.toLocaleString("en-IN")}
          </p>

          {availableStock > 0 && availableStock <= 5 && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-cb-terracotta-deep mb-2">
              <Flame className="h-4 w-4" />
              Only {availableStock} left — order soon
            </p>
          )}

          {topFeatures.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6 mt-2">
              {topFeatures.map((feature, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1.5 rounded-full border border-cb-border bg-white px-3 py-1.5 text-xs font-medium text-cb-fg"
                >
                  <Leaf className="h-3.5 w-3.5 text-cb-terracotta" />
                  {feature}
                </span>
              ))}
            </div>
          )}

          <div className="space-y-5 mb-6">
            {product.colors && product.colors.length > 0 && (() => {
              // Each print is its own product, so this is information, not a choice: the print's
              // name ("Petal Pops") and the actual clothing colour it sits on ("Beige").
              const detail = product.color_details?.[0];
              const printName = detail?.name || slugToTitle(product.colors[0]);
              const baseColour = detail?.base_color?.trim() || null;
              const swatchHex = baseColour ? BASE_COLOUR_SWATCHES[baseColourSlug(baseColour)] ?? FALLBACK_SWATCH : null;
              return (
                <div>
                  <p className="text-sm font-bold text-cb-fg mb-2">
                    Design — <span className="font-normal text-cb-muted-fg">{printName}</span>
                  </p>
                  {baseColour && swatchHex && (
                    <p className="flex items-center gap-2 text-sm text-cb-muted-fg">
                      <span
                        aria-hidden="true"
                        className="inline-block h-5 w-5 rounded-full border-2 border-white"
                        style={{ background: swatchHex, boxShadow: "0 0 0 1px var(--cb-border)" }}
                      />
                      <span>
                        Colour — <span className="text-cb-fg">{baseColour}</span>
                      </span>
                    </p>
                  )}
                </div>
              );
            })()}

            {product.sizes && product.sizes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-cb-fg">Select size</h3>
                  <button
                    type="button"
                    onClick={() => setShowSizeGuide(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-cb-terracotta hover:text-cb-terracotta-deep"
                  >
                    <Ruler className="h-3.5 w-3.5" />
                    Size guide
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((size) => {
                    const isSelected = selectedSize?.name === size.name;
                    const isOutOfStock =
                      size.stock_quantity === undefined || size.stock_quantity <= 0;
                    return (
                      <Chip
                        key={size.name}
                        active={isSelected}
                        disabled={isOutOfStock}
                        onClick={() => !isOutOfStock && setSelectedSize(size)}
                        className={isOutOfStock ? "opacity-40 cursor-not-allowed line-through" : ""}
                      >
                        {size.name}
                      </Chip>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-bold text-cb-fg mb-3">Quantity</h3>
              <div className="inline-flex items-center gap-4 rounded-full border border-cb-border px-1 h-10">
                <button
                  type="button"
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-cb-fg ${quantity <= 1 ? "opacity-40 cursor-not-allowed" : "hover:bg-cb-muted"}`}
                  onClick={decrementQuantity}
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-4 text-center text-sm font-semibold text-cb-fg select-none">{quantity}</span>
                <button
                  type="button"
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-cb-fg ${quantity >= availableStock ? "opacity-40 cursor-not-allowed" : "hover:bg-cb-muted"}`}
                  onClick={incrementQuantity}
                  disabled={quantity >= availableStock}
                  aria-label="Increase quantity"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <PincodeChecker />

            <div className="grid grid-cols-3 gap-2">
              {TRUST_BADGES.map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 rounded-xl bg-cb-linen py-3 text-center">
                  <Icon className="h-4 w-4 text-cb-terracotta-deep" />
                  <span className="text-[11px] font-semibold text-cb-fg">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Frequently bought together — real related products; checkboxes/total/add are fully functional */}
          {relatedProducts.length > 0 && (
            <div className="mb-8">
              <h3 className="text-sm font-bold text-cb-fg mb-3">Frequently bought together</h3>
              <div className="rounded-2xl border border-cb-border overflow-hidden">
                <div className="divide-y divide-cb-border">
                  {bundleItems.map((it, index) => {
                    const isCurrent = index === 0;
                    const checked = bundleChecked[it.id] ?? true;
                    return (
                      <div key={it.id} className="flex items-center gap-3 p-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-cb-linen">
                          <SupabaseImage
                            src={it.image}
                            preset="thumbnail"
                            alt={it.name}
                            width={48}
                            height={48}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-cb-fg truncate">{it.name}</p>
                          <p className="text-sm text-cb-muted-fg">
                            ₹{it.price}
                            {it.size ? ` · Size ${it.size}` : ""}
                          </p>
                        </div>
                        {isCurrent ? (
                          <span className="shrink-0 rounded-full bg-cb-peach px-2.5 py-1 text-[11px] font-bold text-cb-terracotta-deep">
                            This item
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setBundleChecked((prev) => ({ ...prev, [it.id]: !checked }))}
                            aria-label={checked ? `Remove ${it.name} from bundle` : `Add ${it.name} to bundle`}
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                              checked
                                ? "border-cb-terracotta bg-cb-terracotta text-white"
                                : "border-cb-border text-transparent"
                            }`}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-cb-border p-3">
                  <div>
                    <p className="text-xs text-cb-muted-fg">{bundleCheckedCount} items</p>
                    <p className="text-base font-bold text-cb-fg">₹{bundleTotal}</p>
                  </div>
                  <Button
                    onClick={handleAddBundle}
                    disabled={bundleCheckedCount === 0}
                    className="rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    Add {bundleCheckedCount} to cart
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Description / Features / Materials & Care / Delivery & Returns */}
          <div className="mb-2">
            {product.description && (
              <AccordionSection title="Description" defaultOpen>
                <p className="text-sm text-cb-muted-fg leading-relaxed whitespace-pre-wrap">
                  {product.description}
                </p>
              </AccordionSection>
            )}
            {product.features && product.features.length > 0 && (
              <AccordionSection title="Features" defaultOpen>
                <ul className="space-y-1.5">
                  {product.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-cb-muted-fg">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cb-muted-fg" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </AccordionSection>
            )}
            {product.care_instructions && (
              <AccordionSection title="Materials & Care">
                <p className="text-sm text-cb-muted-fg leading-relaxed whitespace-pre-wrap">
                  {product.care_instructions}
                </p>
              </AccordionSection>
            )}
            <AccordionSection title="Delivery & Returns">
              <ul className="space-y-1.5">
                <li className="text-sm text-cb-muted-fg">
                  Free shipping on orders above ₹{FREE_DELIVERY_THRESHOLD.toLocaleString("en-IN")}; otherwise a flat delivery fee applies at checkout.
                </li>
                <li className="text-sm text-cb-muted-fg">Ships in 2–4 days, most pincodes served across India.</li>
                <li className="text-sm text-cb-muted-fg">7-day easy returns on unused items in original packaging.</li>
              </ul>
            </AccordionSection>
          </div>

          <Separator className="my-8" />

          {/* Reviews */}
          <div className="mt-6 md:mt-10">
            <Reviews
              reviews={allReviews}
              onWriteReview={handleWriteReview}
              isLoggedIn={!!user}
            />
          </div>

          <WriteReviewDialog
            isOpen={showReviewForm}
            onClose={() => setShowReviewForm(false)}
            productName={product.name}
            productImage={product.images?.[0]}
            reviewerName={user?.user_metadata?.full_name || user?.email || "You"}
            isSaving={isSubmittingRating}
            onSubmit={handleSubmitRating}
          />

          {/* Related Products */}
          {relatedProducts && relatedProducts?.length > 0 && (
            <section className="mt-16">
              <h2 className="text-[21px] md:text-[26px] font-light text-cb-fg mb-4 md:mb-6">You may also like</h2>
              <div className="flex gap-[14px] lg:gap-[18px] overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {relatedProducts
                  .filter((rp): rp is Product & { slug: string } => Boolean(rp.slug))
                  .slice(0, 8)
                  .map((relatedProduct, index) => (
                    <div key={relatedProduct.id} className="w-[46%] sm:w-[220px] shrink-0">
                      <ProductCard product={relatedProduct} index={index} currentView="list" />
                    </div>
                  ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Mobile Image Preview Modal */}
      {showMobileImageModal && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 md:hidden">
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Close button — top-right */}
            <button
              onClick={() => setShowMobileImageModal(false)}
              className="absolute top-4 right-4 text-white z-10 bg-white/25 backdrop-blur-sm rounded-full p-2"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <div
              className="relative w-full max-w-sm touch-none"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <motion.div
                key={selectedImage}
                initial={{ scale: 0.75, x: -42 }}
                animate={{ scale: 1, x: 0 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                style={{ transformOrigin: "left center" }}
              >
                <SupabaseImage
                  src={product.images?.[selectedImage]}
                  preset="detail"
                  alt={product.name}
                  width={400}
                  height={400}
                  className="w-full h-auto object-contain select-none"
                  priority
                  draggable={false}
                />
              </motion.div>
            </div>
            {/* Bottom row: image dots + position indicator */}
            {product.images && product.images.length > 1 && (
              <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-2">
                <div className="flex gap-2">
                  {product.images.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedImageAnimated(index)}
                      className={`w-2 h-2 rounded-full transition-colors ${index === selectedImage ? "bg-white" : "bg-white/50"
                        }`}
                    />
                  ))}
                </div>
                <span className="bg-white/25 backdrop-blur-sm text-white text-xs font-medium px-3 py-1 rounded-full">
                  {selectedImage + 1} / {product.images.length}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sticky CTA bar — all breakpoints, matching design */}
      <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 bg-white border-t border-cb-border p-4 z-30 flex items-center gap-4">
        <div className="shrink-0">
          <p className="text-xs text-cb-muted-fg">Total</p>
          <DiscountedPrice price={displayPrice * quantity} className="text-lg font-bold" />
        </div>
        <motion.div
          className="ml-auto flex-1 max-w-[280px]"
          animate={
            isShaking
              ? {
                x: [0, -10, 10, -10, 10, -5, 5, 0],
                transition: { duration: 0.6, ease: "easeInOut" },
              }
              : {}
          }
        >
          {isInCart ? (
            <Button
              size="lg"
              className="w-full h-12 rounded-full bg-cb-espresso hover:opacity-90 text-white gap-2"
              onClick={() => router.push("/cart")}
            >
              <Check className="h-4 w-4" />
              Added · Go to Cart
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="lg"
              className="w-full h-12 rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep text-white gap-2 disabled:opacity-60"
              disabled={soldOut}
              onClick={() =>
                selectedSize
                  ? handleQuickAddConfirm(selectedSize.name, quantity)
                  : setQuickAddOpen(true)
              }
            >
              <ShoppingBag className="h-4 w-4" />
              {soldOut ? "Sold out" : selectedSize ? "Add to cart" : "Choose size & add"}
            </Button>
          )}
        </motion.div>
      </div>

      <QuickAddDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        productName={product.name}
        productImage={product.images?.[0]}
        productColor={product.colors?.[0] ? slugToTitle(product.colors[0]) : undefined}
        addOptions={addOptions}
        onConfirm={handleQuickAddConfirm}
      />

      <SizeGuideDialog isOpen={showSizeGuide} onClose={() => setShowSizeGuide(false)} />
    </div>
  );
}
