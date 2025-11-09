"use client";

import React, { useState, useContext } from "react";
import Image from "next/image";
import { CiStar } from "react-icons/ci";
import { FaStar } from "react-icons/fa";

interface ReviewItem {
  userName: string;
  rating: number;
  review: string;
  images?: string[];
}

interface ReviewsProps {
  reviews: ReviewItem[];
}

export default function Reviews({ reviews }: ReviewsProps) {
  const [showReviews, setShowReviews] = useState(2);

  const handleShowMore = () => {
    setShowReviews((prev) => prev + reviews.length);
  };

  const handleClose = () => {
    setShowReviews(2);
  };

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("");
  };

  return (
    <div className="bg-[#FFFBF6] p-4">
      {reviews?.length > 0 ? (
        <div className="space-y-10">
          <h4 className="whitespace-pre-wrap">
            Customer Reviews
          </h4>

          {reviews.slice(0, showReviews).map((review, reviewInd) => (
            <div key={reviewInd} className="space-y-10">
              <div className="flex items-start gap-4">
                <div className="bg-headerText flex items-center justify-center p-2 text-white w-10 h-10 md:w-12 md:h-12 rounded-full text-xl md:text-2xl italic">
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
                        >
                          <Image
                            src={image}
                            alt={`UploadedReviewPhoto ${imgInd + 1}`}
                            width={80}
                            height={80}
                            className="w-full h-full object-cover rounded-md cursor-pointer"
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
          )}x

          {showReviews > 2 && (
            <div className="flex items-center justify-start pl-16 text-headerText font-RobotoFlex text-[18px] font-[500] underline hover:scale-105 transition-all">
              <button onClick={handleClose}>Close reviews</button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-10 max-w-[1200px] mx-auto md:px-10">
          <h4 className="text-[rgb(83,68,38)] text-[20px] md:text-[35px] font-bonaNova font-[400]">
            Customer Reviews
          </h4>
          <p className="text-headerText md:text-[20px] text-[16px] font-[400] flex items-center justify-center">
            No reviews yet. Be the first to leave a review!
          </p>
        </div>
      )}
    </div>
  );
}