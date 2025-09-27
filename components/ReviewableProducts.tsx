"use client";

import { useState, useEffect } from "react";
import { Star, MessageSquare, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reviewService } from "@/lib/services/reviews";
import ReviewModal from "./ReviewModal";
import { toast } from "sonner";

interface ReviewableProduct {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  has_review: boolean;
  review_id?: string;
}

interface ReviewableProductsProps {
  orderId: string;
  orderStatus: string;
}

export default function ReviewableProducts({ orderId, orderStatus }: ReviewableProductsProps) {
  const [products, setProducts] = useState<ReviewableProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ReviewableProduct | null>(null);

  useEffect(() => {
    if (orderStatus === 'delivered') {
      fetchReviewableProducts();
    }
  }, [orderId, orderStatus]);

  const fetchReviewableProducts = async () => {
    try {
      setIsLoading(true);
      const data = await reviewService.getOrderReviewableProducts(orderId);
      setProducts(data.items);
    } catch (error) {
      console.error("Error fetching reviewable products:", error);
      toast.error("Failed to load reviewable products");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReviewSubmitted = () => {
    // Refresh the products list to update review status
    fetchReviewableProducts();
  };

  if (orderStatus !== 'delivered') {
    return null;
  }

  if (isLoading) {
    return (
      <div className="mt-4 p-4 bg-muted/30 rounded-md">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading reviewable products...
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return null;
  }

  const reviewedCount = products.filter(p => p.has_review).length;
  const totalCount = products.length;

  return (
    <>
      <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <h4 className="font-medium text-green-800">Order Delivered!</h4>
        </div>
        
        <p className="text-sm text-green-700 mb-3">
          Your order has been delivered. Help other customers by reviewing your products.
        </p>

        <div className="space-y-2">
          {products.map((product) => (
            <div
              key={product.id}
              className="flex items-center justify-between p-3 bg-white border border-green-200 rounded-md"
            >
              <div className="flex items-center gap-3">
                {product.image && (
                  <div className="w-10 h-10 bg-muted rounded-md overflow-hidden">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div>
                  <h5 className="font-medium text-sm">{product.name}</h5>
                  <p className="text-xs text-muted-foreground">
                    Qty: {product.quantity} × ₹{product.price.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {product.has_review ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">Reviewed</span>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setSelectedProduct(product)}
                    className="flex items-center gap-1"
                  >
                    <Star className="w-4 h-4" />
                    Review
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {reviewedCount < totalCount && (
          <div className="mt-3 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const unreviewedProduct = products.find(p => !p.has_review);
                if (unreviewedProduct) {
                  setSelectedProduct(unreviewedProduct);
                }
              }}
              className="text-green-700 border-green-300 hover:bg-green-100"
            >
              <MessageSquare className="w-4 h-4 mr-1" />
              Review All Products ({reviewedCount}/{totalCount})
            </Button>
          </div>
        )}
      </div>

      {selectedProduct && (
        <ReviewModal
          orderId={orderId}
          productId={selectedProduct.id}
          productName={selectedProduct.name}
          productImage={selectedProduct.image}
          onClose={() => setSelectedProduct(null)}
          onReviewSubmitted={handleReviewSubmitted}
        />
      )}
    </>
  );
}
