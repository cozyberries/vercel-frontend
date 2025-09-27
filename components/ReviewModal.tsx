"use client";

import { useState } from "react";
import { Star, MessageSquare, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { reviewService } from "@/lib/services/reviews";
import { toast } from "sonner";

interface ReviewModalProps {
  orderId: string;
  productId: string;
  productName: string;
  productImage?: string;
  onClose: () => void;
  onReviewSubmitted: () => void;
}

export default function ReviewModal({
  orderId,
  productId,
  productName,
  productImage,
  onClose,
  onReviewSubmitted,
}: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    try {
      setIsSubmitting(true);
      console.log("Submitting review:", {
        order_id: orderId,
        product_id: productId,
        rating,
        title: title.trim() || undefined,
        comment: comment.trim() || undefined,
      });

      await reviewService.createReview({
        order_id: orderId,
        product_id: productId,
        rating,
        title: title.trim() || undefined,
        comment: comment.trim() || undefined,
      });

      toast.success("Review submitted successfully!");
      onReviewSubmitted();
      onClose();
    } catch (error) {
      console.error("Error submitting review:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to submit review"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            {productImage && (
              <div className="w-12 h-12 bg-muted rounded-md overflow-hidden">
                <img
                  src={productImage}
                  alt={productName}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div>
              <h3 className="font-semibold">Review {productName}</h3>
              <p className="text-sm text-muted-foreground">
                Share your experience
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Rating */}
            <div>
              <label className="text-sm font-medium mb-2 block">Rating *</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1"
                  >
                    <Star
                      className={`w-6 h-6 ${
                        star <= rating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Title (Optional)
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Summarize your experience"
                maxLength={200}
              />
            </div>

            {/* Comment */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Review (Optional)
              </label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us more about your experience with this product..."
                rows={4}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {comment.length}/1000 characters
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1"
              disabled={isSubmitting || rating === 0}
            >
              {isSubmitting ? "Submitting..." : "Submit Review"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
