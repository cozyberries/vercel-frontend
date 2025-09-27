"use client";

import { useState, useEffect } from "react";
import { Star, MessageSquare, ThumbsUp, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { reviewService } from "@/lib/services/reviews";
import type {
  ProductReviewsResponse,
  ReviewWithUser,
  ProductRatingStats,
} from "@/lib/types/review";

interface ProductReviewsProps {
  productId: string;
}

export default function ProductReviews({ productId }: ProductReviewsProps) {
  const [reviewsData, setReviewsData] = useState<ProductReviewsResponse | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<
    "newest" | "oldest" | "highest" | "lowest"
  >("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    fetchReviews();
  }, [productId, sortBy, currentPage]);

  const fetchReviews = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const offset = (currentPage - 1) * itemsPerPage;
      const data = await reviewService.getProductReviews(productId, {
        limit: itemsPerPage,
        offset,
        sortBy,
      });
      setReviewsData(data);
    } catch (err) {
      console.error("Error fetching reviews:", err);
      setError("Failed to load reviews");
    } finally {
      setIsLoading(false);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-4 h-4 ${
              star <= rating
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-300"
            }`}
          />
        ))}
      </div>
    );
  };

  const renderRatingDistribution = (stats: ProductRatingStats) => {
    return (
      <div className="space-y-2">
        {[5, 4, 3, 2, 1].map((rating) => {
          const count =
            stats.rating_distribution[
              rating.toString() as keyof typeof stats.rating_distribution
            ];
          const percentage =
            stats.total_reviews > 0 ? (count / stats.total_reviews) * 100 : 0;

          return (
            <div key={rating} className="flex items-center gap-2 text-sm">
              <span className="w-3">{rating}</span>
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-yellow-400 h-2 rounded-full"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="w-8 text-right text-muted-foreground">
                {count}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="mt-8 p-6 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading reviews...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 p-6 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchReviews}
          className="mt-2"
        >
          Try Again
        </Button>
      </div>
    );
  }

  if (!reviewsData) {
    return null;
  }

  const { reviews, stats, pagination } = reviewsData;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquare className="w-5 h-5" />
        <h2 className="text-xl font-semibold">Customer Reviews</h2>
      </div>

      {/* Rating Summary */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold">
                {stats.average_rating.toFixed(1)}
              </div>
              <div className="flex justify-center mt-1">
                {renderStars(Math.round(stats.average_rating))}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Based on {stats.total_reviews} review
                {stats.total_reviews !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-medium mb-3">Rating Distribution</h3>
          {renderRatingDistribution(stats)}
        </div>
      </div>

      <Separator className="my-6" />

      {/* Reviews List */}
      {reviews.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No Reviews Yet</h3>
          <p className="text-muted-foreground">
            Be the first to review this product!
          </p>
        </div>
      ) : (
        <>
          {/* Sort Controls */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              Showing {reviews.length} of {pagination.totalItems} reviews
            </p>
            <Select
              value={sortBy}
              onValueChange={(value: any) => setSortBy(value)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="highest">Highest Rated</SelectItem>
                <SelectItem value="lowest">Lowest Rated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reviews */}
          <div className="space-y-6">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="border-b border-gray-200 pb-6 last:border-b-0"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-primary">
                        {review.user.raw_user_meta_data?.full_name?.charAt(0) ||
                          review.user.email?.charAt(0) ||
                          "U"}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-sm">
                        {review.user.raw_user_meta_data?.full_name ||
                          "Anonymous"}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {formatDate(review.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {renderStars(review.rating)}
                  </div>
                </div>

                {review.title && (
                  <h4 className="font-medium text-sm mb-2">{review.title}</h4>
                )}

                {review.comment && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {review.comment}
                  </p>
                )}

                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <button className="flex items-center gap-1 hover:text-primary">
                    <ThumbsUp className="w-3 h-3" />
                    Helpful ({review.helpful_votes})
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={!pagination.hasPrevPage}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {pagination.currentPage} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={!pagination.hasNextPage}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
