"use client";

import React, { useState, useContext } from "react";
import Image from "next/image";
import { CiStar } from "react-icons/ci";
import { toImageSrc } from "@/lib/utils/image";
import { FaStar } from "react-icons/fa";
import { useRating } from "./rating-context";

interface ReviewItem {
  userName: string;
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
    <div className="flex items-center justify-between">
      <h4 className="whitespace-pre-wrap text-xl">
        Customer Reviews
      </h4>
      {onWriteReview && (
        <button
          onClick={onWriteReview}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-black rounded-lg hover:bg-gray-800 transition-colors"
        >
          <CiStar size={18} />
          {isLoggedIn ? "Write a Review" : "Login to Review"}
        </button>
      )}
    </div>
  );
}

export default function Reviews({ reviews, onWriteReview, isLoggedIn = true }: ReviewsProps) {
  const [showReviews, setShowReviews] = useState(2);
  const { setShowViewReviewModal, setSelectedImgIndex, setSelectedReviewIndex } = useRating();

  const handleShowMore = () => {
    setShowReviews((prev) => prev + reviews.length);
  };

  const handleClose = () => {
    setShowReviews(2);
  };

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

  return (
    <div className="bg-[#FFFBF6] p-4">
      <ReviewsHeader onWriteReview={onWriteReview} isLoggedIn={isLoggedIn} />
      {reviews?.length > 0 ? (
        <div className="space-y-10">
          {reviews.slice(0, showReviews).map((review, reviewInd) => (
            <div key={reviewInd} className="space-y-10">
              <div className="flex items-start gap-4">
                <div className="bg-primary text-primary-foreground flex items-center justify-center p-2 w-8 h-8 md:w-10 md:h-10 rounded-full text-lg md:text-xl italic">
                  {getInitials(review?.userName)}
                </div>

                <div className="block space-y-1 border-b border-[#00000038] pb-4 w-full">
                  <p className="text-[#414141] font-[500] text-[14px] md:text-[16px]">
                    {review.userName}
                  </p>

                  <p className="flex items-center gap-1">
                    {[...Array(5)].map((_, ind) => (
                      <span key={ind}>
                        {ind < review.rating ? (
                          <FaStar
                            size={20}
                            className="star"
                            color="rgba(80, 111, 34, 1)"
                          />
                        ) : (
                          <CiStar
                            size={25}
                            className="star"
                            color="rgba(80, 111, 34, 1)"
                          />
                        )}
                      </span>
                    ))}
                  </p>

                  <p className="text-[#414141] text-[14px] md:text-[16px] font-[400] font-RobotoFlex">
                    {review.review}
                  </p>

                  {review.images && review.images.length > 0 && (
                    <div className="flex items-center gap-4 mt-2">
                      {review.images.map((image, imgInd) => (
                        <button
                          key={imgInd}
                          className="w-12 h-12 md:w-20 md:h-20 flex items-center justify-center"
                          onClick={() => {
                            setShowViewReviewModal(true);
                            setSelectedReviewIndex(reviewInd);
                            setSelectedImgIndex(imgInd);
                          }}
                        >
                          <Image
                            src={toImageSrc(image)}
                            alt={`UploadedReviewPhoto ${imgInd + 1}`}
                            width={80}
                            height={80}
                            className="w-full h-full object-cover rounded cursor-pointer"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {showReviews < reviews.length && (
            <div className="flex items-center justify-start pl-16 text-headerText font-RobotoFlex text-[18px] font-[500] underline hover:scale-105 transition-all">
              <button onClick={handleShowMore}>View all reviews</button>
            </div>
          )}

          {showReviews > 2 && (
            <div className="flex items-center justify-start pl-16 text-headerText font-RobotoFlex text-[18px] font-[500] underline hover:scale-105 transition-all">
              <button onClick={handleClose}>Close reviews</button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-gray-500 italic flex items-center justify-center py-4">
            No reviews yet. Be the first to leave a review!
          </p>
        </div>
      )}
    </div>
  );
}