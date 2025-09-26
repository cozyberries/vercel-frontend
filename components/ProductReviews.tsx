"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Star,
  ThumbsUp,
  MessageSquare,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { reviewService } from "@/lib/services/reviews";
import type { Review, ProductRating, ReviewResponse } from "@/lib/types/review";

interface ProductReviewsProps {
  productId: string;
  className?: string;
}

export default function ProductReviews({
  productId,
  className = "",
}: ProductReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState<ProductRating>({
    average_rating: 0,
    total_reviews: 0,
    rating_distribution: { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    fetchReviews();
  }, [productId, currentPage]);

  const fetchReviews = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await reviewService.getProductReviews(
        productId,
        currentPage,
        5
      );
      setRating(response.rating);

      if (currentPage === 1) {
        setReviews(response.reviews.reviews);
      } else {
        setReviews((prev) => [...prev, ...response.reviews.reviews]);
      }

      setHasMore(response.reviews.pagination.hasNextPage);
    } catch (err) {
      console.error("Error fetching reviews:", err);
      setError("Failed to load reviews");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVote = async (reviewId: string, isHelpful: boolean) => {
    try {
      await reviewService.voteOnReview(reviewId, {
        review_id: reviewId,
        is_helpful: isHelpful,
      });
      // Refresh reviews to update vote counts
      fetchReviews();
    } catch (err) {
      console.error("Error voting on review:", err);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-4 h-4 ${
              star <= rating ? "text-yellow-400 fill-current" : "text-gray-300"
            }`}
          />
        ))}
      </div>
    );
  };

  const renderRatingDistribution = () => {
    const total = rating.total_reviews;
    if (total === 0) return null;

    return (
      <div className="space-y-2">
        {[5, 4, 3, 2, 1].map((star) => {
          const count =
            rating.rating_distribution[
              star as keyof typeof rating.rating_distribution
            ];
          const percentage = total > 0 ? (count / total) * 100 : 0;

          return (
            <div key={star} className="flex items-center gap-2 text-sm">
              <span className="w-4">{star}</span>
              <Star className="w-4 h-4 text-yellow-400 fill-current" />
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-yellow-400 h-2 rounded-full"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="w-8 text-right">{count}</span>
            </div>
          );
        })}
      </div>
    );
  };

  if (isLoading && currentPage === 1) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="ml-2">Loading reviews...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${className}`}>
        <div className="text-center py-8">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-600">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCurrentPage(1);
              fetchReviews();
            }}
            className="mt-2"
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <div className="space-y-6">
        {/* Rating Summary */}
        <div className="bg-gray-50 rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Customer Reviews</h3>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold">
                    {rating.average_rating.toFixed(1)}
                  </div>
                  {renderStars(Math.round(rating.average_rating))}
                  <div className="text-sm text-gray-600 mt-1">
                    {rating.total_reviews} review
                    {rating.total_reviews !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="flex-1 max-w-xs">
                  {renderRatingDistribution()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reviews List */}
        {reviews.length > 0 ? (
          <div className="space-y-6">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="border-b border-gray-200 pb-6 last:border-b-0"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {renderStars(review.rating)}
                      <span className="text-sm text-gray-600">
                        {reviewService.formatRelativeDate(review.created_at)}
                      </span>
                      {review.is_verified_purchase && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          Verified Purchase
                        </span>
                      )}
                    </div>

                    {review.title && (
                      <h4 className="font-medium mb-2">{review.title}</h4>
                    )}

                    {review.comment && (
                      <p className="text-gray-700 mb-3">{review.comment}</p>
                    )}

                    {/* Review Images */}
                    {review.images && review.images.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                        {review.images.map((image) => (
                          <div
                            key={image.id}
                            className="relative w-full h-24 bg-gray-100 rounded-md overflow-hidden"
                          >
                            <Image
                              src={image.url || `/${image.storage_path}`}
                              alt="Review image"
                              fill
                              className="object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Helpful Votes */}
                    {review.total_votes > 0 && (
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>
                          {review.helpful_votes} of {review.total_votes} found
                          this helpful
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Load More Button */}
            {hasMore && (
              <div className="text-center">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage((prev) => prev + 1)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading...
                    </>
                  ) : (
                    "Load More Reviews"
                  )}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No reviews yet</h3>
            <p className="text-gray-600">
              Be the first to review this product!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
