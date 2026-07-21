"use client";

import React, { useState } from "react";
import Image from "next/image";
import { CiStar } from "react-icons/ci";
import { toImageSrc } from "@/lib/utils/image";
import { FaStar } from "react-icons/fa";
import { useRating } from "./rating-context";
import ReviewsDialog from "./rating/ReviewsDialog";

interface ReviewItem {
  userName: string;
  title?: string | null;
  rating: number;
  review: string;
  images?: string[];
}

interface ReviewsProps {
  reviews: ReviewItem[];
  onWriteReview?: () => void;
  isLoggedIn?: boolean;
}

interface ReviewsHeaderProps {
  onWriteReview?: () => void;
  isLoggedIn?: boolean;
}

function ReviewsHeader({ onWriteReview, isLoggedIn = true }: ReviewsHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h4 className="text-lg font-light text-cb-fg">
        Reviews
      </h4>
      {onWriteReview && (
        <button
          onClick={onWriteReview}
          className="flex items-center gap-1.5 text-sm font-semibold text-cb-terracotta"
        >
          <CiStar size={16} />
          {isLoggedIn ? "Write a review" : "Login to review"}
        </button>
      )}
    </div>
  );
}

const PREVIEW_COUNT = 2;

export default function Reviews({ reviews, onWriteReview, isLoggedIn = true }: ReviewsProps) {
  const [showAllDialog, setShowAllDialog] = useState(false);
  const { setShowViewReviewModal, setSelectedImgIndex, setSelectedReviewIndex } = useRating();

  const getInitials = (name: string) => {
    if (!name || !name.trim()) return "?";
    return name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const average = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => Math.round(r.rating) === star).length,
  }));

  return (
    <div className="bg-white p-4">
      <ReviewsHeader onWriteReview={onWriteReview} isLoggedIn={isLoggedIn} />

      {reviews?.length > 0 && (
        <div className="flex items-start gap-8 mb-8">
          <div>
            <p className="text-4xl font-bold text-cb-fg">{average.toFixed(1)}</p>
            <p className="flex items-center gap-0.5 text-cb-terracotta my-1">
              {[...Array(5)].map((_, i) => (
                <FaStar key={i} size={14} color={i < Math.round(average) ? "currentColor" : "#e5ddd3"} />
              ))}
            </p>
            <p className="text-xs text-cb-muted-fg whitespace-nowrap">{reviews.length} reviews</p>
          </div>
          <div className="flex-1 space-y-1.5 pt-1">
            {distribution.map(({ star, count }) => (
              <div key={star} className="flex items-center gap-2">
                <span className="w-2 text-xs text-cb-muted-fg">{star}</span>
                <div className="flex-1 h-1.5 rounded-full bg-cb-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-cb-terracotta"
                    style={{ width: reviews.length > 0 ? `${(count / reviews.length) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {reviews?.length > 0 ? (
        <div className="space-y-6">
          {reviews.slice(0, PREVIEW_COUNT).map((review, reviewInd) => (
            <div key={reviewInd} className="space-y-2 border-b border-cb-border pb-6 last:border-0">
              <div className="flex items-start gap-3">
                <div className="bg-cb-mauve-tint text-cb-terracotta-deep flex items-center justify-center w-9 h-9 shrink-0 rounded-full text-sm font-semibold">
                  {getInitials(review?.userName)}
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-cb-fg font-semibold text-sm">
                      {review.userName}
                    </p>
                    <p className="flex items-center gap-0.5 text-cb-terracotta">
                      {[...Array(5)].map((_, ind) => (
                        <FaStar key={ind} size={12} color={ind < review.rating ? "currentColor" : "#e5ddd3"} />
                      ))}
                    </p>
                  </div>

                  <p className="text-cb-muted-fg text-sm leading-relaxed">
                    {review.review}
                  </p>

                  {review.images && review.images.length > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      {review.images.map((image, imgInd) => (
                        <button
                          key={imgInd}
                          className="w-14 h-14 flex items-center justify-center rounded-lg overflow-hidden"
                          onClick={() => {
                            setShowViewReviewModal(true);
                            setSelectedReviewIndex(reviewInd);
                            setSelectedImgIndex(imgInd);
                          }}
                        >
                          <Image
                            src={toImageSrc(image)}
                            alt={`UploadedReviewPhoto ${imgInd + 1}`}
                            width={56}
                            height={56}
                            className="w-full h-full object-cover cursor-pointer"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {reviews.length > PREVIEW_COUNT && (
            <button
              onClick={() => setShowAllDialog(true)}
              className="w-full rounded-full border border-cb-border py-3 text-sm font-semibold text-cb-fg hover:border-cb-terracotta"
            >
              Read all {reviews.length} reviews
            </button>
          )}
        </div>
      ) : (
        <p className="text-cb-muted-fg italic text-center py-4 text-sm">
          No reviews yet. Be the first to leave a review!
        </p>
      )}

      <ReviewsDialog isOpen={showAllDialog} onClose={() => setShowAllDialog(false)} reviews={reviews} />
    </div>
  );
}