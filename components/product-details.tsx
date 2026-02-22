"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, Minus, Plus, Share2, Truck } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Product, SizeOption, getProductById, getProducts } from "@/lib/services/api";
import { useWishlist } from "./wishlist-context";
import { useCart } from "./cart-context";
import { usePreloadedData } from "./data-preloader";
import { toast } from "sonner";
import Reviews from "./reviews";
import { RatingItem, useRating } from "./rating-context";
import ViewReview from "./view_review";
import { FaStar } from "react-icons/fa";
import LoadingCard from "./loading-card";
import RatingForm from "./rating/RatingForm";
import { useAuth } from "./supabase-auth-provider";

import { sendNotification } from "@/lib/utils/notify";
import { sendActivity } from "@/lib/utils/activities";
import { toImageSrc } from "@/lib/utils/image";

interface ReviewItem {
  userName: string;
  rating: number;
  review: string;
  images?: string[];
}

interface User {
  id: string;
  name: string;
}

export default function ProductDetails({ id: productId }: { id: string }) {
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<SizeOption | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<number>(0);
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [showMobileImageModal, setShowMobileImageModal] = useState(false);
  const [allReviews, setAllReviews] = useState<ReviewItem[]>([]);
  const { reviews, showViewReviewModal, fetchReviews, setProductSlug } = useRating();
  const [users, setUsers] = useState<User[]>([]);
  const [productRating, setProductRating] = useState<number>(0);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const { user } = useAuth();
  
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await getProducts({
          limit: 12,
          page: 1,
          category: product?.category_slug || undefined,
          sortBy: "price",
          sortOrder: "asc",
          featured: true,
          search: "",
        });

        const filtered = response.products.filter(
          (p) => p.slug !== product?.slug && p.category_slug === product?.category_slug
        );
        setRelatedProducts(filtered);
      } catch (err) {
        console.error("Error loading products:", err);
      }
    };

    loadProducts();
  }, [product?.slug, product?.category_slug])

  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { addToCart, removeFromCart, addToCartTemporary, cart } = useCart();
  const { getDetailedProductById, isLoading } = usePreloadedData();
  const router = useRouter();

  const isInCart = cart.some((item) => item.id === product?.id);
  const inWishlist = isInWishlist(product?.id ?? "");


  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/users");
      if (response.ok) {
        const data = await response.json();
        setUsers(data || []);
      } else {
        const errorData = await response.text();
        console.error('Failed to fetch users:', response.status, response.statusText, errorData);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  // Fetch users
  useEffect(() => {
    fetchUsers();
  }, []);

  const handleWriteReview = () => {
    if (!user) {
      toast.error("Please login to write a review");
      router.push("/login");
      return;
    }
    setShowReviewForm(true);
    // Scroll to the review form
    setTimeout(() => {
      document.getElementById("review-form-section")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleSubmitRating = async (data: any) => {
    try {
      const formData = new FormData();
      formData.append("user_id", data.user_id);
      formData.append("product_slug", data.product_slug);
      formData.append("rating", String(data.rating));
      if (data.comment) formData.append("comment", data.comment);
      if (data.imageFiles?.length > 0) {
        for (const file of data.imageFiles) {
          formData.append("images", file);
        }
      }
      const response = await fetch("/api/ratings", {
        method: "POST",
        body: formData,
      });
      if (response.ok) {
        setShowReviewForm(false);
        // Refresh reviews
        await fetchReviews(productId);
        await fetchUsers();
        
        // Fire and forget notifications (non-blocking)
        sendNotification(
          "Rating Submitted",
          `User ${user?.id} has submitted a rating for product #${data?.product_slug}`,
          "success"
        ).catch((error) => console.error("Failed to send notification:", error));
        
        sendActivity(
          "rating_submission_success",
          `User ${user?.id} submitted a rating for product #${data?.product_slug}`,
          data?.product_slug
        ).catch((error) => console.error("Failed to log activity:", error));
        
        toast.success("Review submitted successfully!");
      } else {
        toast.error("Failed to submit review");
        sendActivity(
          "rating_submission_failed",
          `User ${user?.id} failed to submit a rating for product #${data?.product_slug}`,
          data?.product_slug
        ).catch((error) => console.error("Failed to log activity:", error));
      }
    } catch (error) {
      console.error("Error submitting rating:", error);
      toast.error("Something went wrong. Please try again.");
    }
  };

  // Set the product slug in the rating context so reviews are fetched and the review form knows the target product
  useEffect(() => {
    if (productId) {
      setProductSlug(productId);
    }
  }, [productId, setProductSlug]);

  // Check if mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch all reviews
  useEffect(() => {
    const fetchReviews = async () => {
      if (!productId || !reviews || reviews.length === 0 || !users || users.length === 0) return;
      try {
        const productReviews = reviews.filter((rev) => rev.product_slug === productId);
        setAllReviews(productReviews.map((rev: RatingItem) => ({
          userName: users?.find((user) => user?.id === rev?.user_id)?.name || "Unknown User",
          review: rev.comment,
          rating: rev.rating,
          images: rev.images,
        })));
        const totalRating = productReviews.reduce((acc, rev) => acc + rev.rating, 0);
        const averageRating = productReviews?.length > 0 ? (totalRating / productReviews?.length).toFixed(1) : 0;
        setProductRating(Number(averageRating));
      } catch (error) {
        return;
      }
    };
    fetchReviews();
  }, [reviews, productId, users]);


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
        // Select the first in-stock size, or the first size if all are out of stock
        const inStockSize = product.sizes.find((s) => (s.stock_quantity ?? 0) > 0);
        setSelectedSize(inStockSize || product.sizes[0]);
      }
      if (product.colors && product.colors.length > 0) {
        setSelectedColor(product.colors[0]);
      }
    }
  }, [product]);

  // Compute the displayed price based on selected size
  const displayPrice = selectedSize?.price ?? product?.price ?? 0;

  const incrementQuantity = () => {
    setQuantity((prev) => prev + 1);
  };

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

  // Auto-shake every 3 seconds if not in cart
  useEffect(() => {
    if (!isInCart) {
      const interval = setInterval(() => {
        triggerShakeAnimation();
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [isInCart]);

  if (isLoading || isLoadingProduct) {
    return (
        <LoadingCard />
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

  if (showViewReviewModal) {
    return (
      <ViewReview
        reviews={allReviews}
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 pb-20 md:pb-8">
      <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
        {/* Product Images */}
        <div className="space-y-4 lg:space-y-0 lg:flex lg:gap-4">
          {/* Thumbnail Gallery - Left Side (Large screens only) */}
          {product.images && product.images.length > 1 && (
            <div className="hidden lg:flex flex-col gap-2 w-20">
              {product.images.map((image, index) => (
                <div
                  key={index}
                  className={`aspect-square overflow-hidden bg-[#f5f5f5] cursor-pointer ${index === selectedImage ? "ring-2 ring-primary" : ""
                    }`}
                  onClick={() => setSelectedImage(index)}
                >
                  <Image
                    src={toImageSrc(image)}
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
              className={`aspect-square z-10 bg-[#f5f5f5] relative transition-all duration-300 ease-out ${!isMobile
                  ? "cursor-zoom-in hover:shadow-lg hover:scale-[1.02]"
                  : "cursor-pointer"
                }`}
              onMouseEnter={handleImageMouseEnter}
              onMouseLeave={handleImageMouseLeave}
              onMouseMove={handleImageMouseMove}
              onClick={() => {
                if (isMobile) {
                  setShowMobileImageModal(true);
                }
              }}
            >
              <Image
                src={toImageSrc(product.images?.[selectedImage])}
                alt={product.name}
                width={600}
                height={600}
                className="w-full h-full object-cover transition-transform duration-300 ease-out"
                priority
              />

              {showZoomModal && !isMobile && (
                <div className="absolute top-0 -right-[100%] w-[35rem] h-96 bg-white shadow-2xl overflow-hidden rounded-xl animate-in fade-in-0 zoom-in-95 duration-300 ease-out">
                  <Image
                    src={toImageSrc(product.images?.[selectedImage])}
                    alt={product.name}
                    width={600}
                    height={600}
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
                  className={`aspect-square overflow-hidden bg-[#f5f5f5] cursor-pointer ${index === selectedImage ? "ring-2 ring-primary" : ""
                    }`}
                  onClick={() => setSelectedImage(index)}
                >
                  <Image
                    src={toImageSrc(image)}
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
          <div>
            {product.category && (
              <Link
                href={`/collections/${product.category.toLowerCase()}`}
                className="text-sm text-muted-foreground hover:text-primary"
              >
                {product.category}
              </Link>
            )}
             <div className='flex items-center justify-between'>
                <p className='flex items-center gap-2 text-[#6F5B35B8] text-[16px] font-[500]'><FaStar /> {productRating} | {allReviews?.length} Ratings</p>
              </div>
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
                      price: displayPrice,
                      image: product.images?.[0],
                    });
                    toast.success(`${product.name} added to wishlist!`);
                  }
                }}
              >
                <Heart
                  className={`h-5 w-5 ${inWishlist ? "fill-red-500 text-red-500" : ""
                    }`}
                />
                <span className="sr-only">
                  {inWishlist ? "Remove from wishlist" : "Add to wishlist"}
                </span>
              </Button>
            </div>
            <p className="text-2xl font-medium mb-6">
              ₹{displayPrice.toFixed(2)}
              {selectedSize && selectedSize.price < product.price && (
                <span className="text-sm text-muted-foreground line-through ml-2">
                  ₹{product.price.toFixed(2)}
                </span>
              )}
            </p>

            <div className="space-y-6 mb-8">
              {product.colors && product.colors.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">Color</h3>
                  <div className="flex gap-3">
                    {product.colors.map((color, index) => (
                      <button
                        key={color}
                        className={`w-8 h-8 rounded-full border ${color === selectedColor
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
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium">Size</h3>
                    <Link
                      href="/size-guide"
                      className="text-xs text-primary hover:underline"
                    >
                      Size Guide
                    </Link>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {product.sizes.map((size) => {
                      const isSelected = selectedSize?.name === size.name;
                      const isOutOfStock = size.stock_quantity === undefined || size.stock_quantity <= 0;
                      return (
                        <button
                          key={size.name}
                          onClick={() => !isOutOfStock && setSelectedSize(size)}
                          disabled={isOutOfStock}
                          className={`relative flex flex-col items-center justify-center px-2 py-2.5 border rounded-lg text-sm transition-all duration-200
                            ${isSelected
                              ? "border-black bg-black text-white shadow-sm"
                              : isOutOfStock
                                ? "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed"
                                : "border-gray-300 bg-white text-gray-900 hover:border-black hover:shadow-sm"
                            }`}
                        >
                          <span className="font-medium">{size.name}</span>
                          <span className={`text-xs mt-0.5 ${isSelected ? "text-gray-300" : isOutOfStock ? "text-gray-300" : "text-muted-foreground"}`}>
                            ₹{size.price.toFixed(0)}
                          </span>
                          {isOutOfStock && (
                            <span className="absolute inset-0 flex items-center justify-center">
                              <span className="w-full h-px bg-gray-300 rotate-[-20deg]" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {selectedSize && selectedSize.stock_quantity !== undefined && selectedSize.stock_quantity > 0 && selectedSize.stock_quantity <= 3 && (
                    <p className="text-xs text-amber-600 mt-2">
                      Only {selectedSize.stock_quantity} left in this size!
                    </p>
                  )}
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
                className="w-1/2 bg-black hover:bg-gray-800"
                onClick={() => {
                  // Add to cart temporarily (replaces existing cart), then redirect to checkout
                  addToCartTemporary({
                    id: product.id,
                    name: product.name,
                    price: displayPrice,
                    image: product.images?.[0],
                    quantity,
                    ...(selectedColor ? { color: selectedColor } : {}),
                    ...(selectedSize ? { size: selectedSize.name } : {}),
                  });
                  // Use router navigation with small delay to ensure state update
                  setTimeout(() => {
                    router.push("/checkout");
                  }, 100);
                }}
              >
                Buy Now
              </Button>
              <motion.div
                className="w-1/2"
                animate={
                  isShaking
                    ? {
                      x: [0, -10, 10, -10, 10, -5, 5, 0],
                      transition: { duration: 0.6, ease: "easeInOut" },
                    }
                    : {}
                }
              >
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full z-0"
                  onClick={() => {
                    if (isInCart) {
                      removeFromCart(product.id);
                      toast.success(`${product.name} removed from cart!`);
                    } else {
                      addToCart({
                        id: product.id,
                        name: product.name,
                        price: displayPrice,
                        image: product.images?.[0],
                        quantity,
                        ...(selectedColor ? { color: selectedColor } : {}),
                        ...(selectedSize ? { size: selectedSize.name } : {}),
                      });
                      toast.success(`${product.name} added to cart!`);
                    }
                  }}
                >
                  {isInCart ? "Remove from Cart" : "Add to Cart"}
                </Button>
              </motion.div>
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
                <span>Free shipping over ₹1000</span>
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

            <Separator className="my-8" />
          </div>
        </div>
      </div>
      <div className="mt-6 md:mt-10">
        <Reviews
          reviews={allReviews}
          onWriteReview={handleWriteReview}
          isLoggedIn={!!user}
        />
        {showReviewForm && (
          <div id="review-form-section" className="mt-4">
            <RatingForm
              onSubmitRating={handleSubmitRating}
              onCancel={() => setShowReviewForm(false)}
            />
          </div>
        )}
      </div>
      {/* Related Products */}
      {relatedProducts && relatedProducts?.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-light text-center mb-8">
            You May Also Like
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {relatedProducts
              ?.filter((rp): rp is Product & { slug: string } => Boolean(rp.slug))
              ?.map((relatedProduct) => (
              <div key={relatedProduct?.id} className="group">
                <div className="relative mb-4 overflow-hidden bg-[#f5f5f5]">
                  <Link href={`/products/${relatedProduct.slug}`}>
                    <Image
                      src={toImageSrc(relatedProduct?.images?.[0])}
                      alt={relatedProduct?.name}
                      width={400}
                      height={400}
                      className="w-full h-[350px] object-cover transition-transform duration-300 group-hover:scale-105"
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
                      href={`/products/${relatedProduct.slug}`}
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

      {/* Mobile Image Preview Modal */}
      {showMobileImageModal && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 md:hidden">
          <div className="relative w-full h-full flex items-center justify-center">
            <button
              onClick={() => setShowMobileImageModal(false)}
              className="absolute top-4 right-4 text-white z-10 bg-black/50 rounded-full p-2"
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

            <div className="relative w-full max-w-sm">
              <Image
                src={toImageSrc(product.images?.[selectedImage])}
                alt={product.name}
                width={400}
                height={400}
                className="w-full h-auto object-contain"
                priority
              />
            </div>

            {/* Image navigation dots */}
            {product.images && product.images.length > 1 && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
                {product.images.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`w-2 h-2 rounded-full transition-colors ${index === selectedImage ? "bg-white" : "bg-white/50"
                      }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sticky Mobile Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50 md:hidden">
        <div className="flex gap-3">
          <Button
            size="lg"
            className="w-1/2 h-12 bg-black hover:bg-gray-800"
            onClick={() => {
              // Add to cart temporarily (replaces existing cart), then redirect to checkout
              addToCartTemporary({
                id: product.id,
                name: product.name,
                price: displayPrice,
                image: product.images?.[0],
                quantity,
                ...(selectedColor ? { color: selectedColor } : {}),
                ...(selectedSize ? { size: selectedSize.name } : {}),
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
            className="w-1/2 h-12 overflow-hidden"
            onClick={() => {
              if (isInCart) {
                removeFromCart(product.id);
              } else {
                addToCart({
                  id: product.id,
                  name: product.name,
                  price: displayPrice,
                  image: product.images?.[0],
                  quantity,
                  ...(selectedColor ? { color: selectedColor } : {}),
                  ...(selectedSize ? { size: selectedSize.name } : {}),
                });
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
