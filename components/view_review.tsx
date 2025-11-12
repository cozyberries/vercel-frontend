"use client";

import React, { useEffect, useState } from "react";
import { RiCloseLargeFill } from "react-icons/ri";
import { IoIosArrowForward } from "react-icons/io";
import Image from "next/image";
import { Button } from "./ui/button";
import { useRating } from "./rating-context";

interface Review {
  userName: string;
  review: string;
  images?: string[];
}

interface ViewReviewProps {
  reviews: Review[];
}

export default function ViewReview({ reviews }: ViewReviewProps) {
  const { setShowViewReviewModal, selectedReviewIndex, selectedImgIndex, setSelectedImgIndex } =
    useRating();

  const [currentReviewIndex, setCurrentReviewIndex] = useState<number | null>(selectedReviewIndex);
  const [currentImageIndex, setCurrentImageIndex] = useState(selectedImgIndex);

  useEffect(() => {
    setCurrentReviewIndex(selectedReviewIndex);
    setCurrentImageIndex(selectedImgIndex);
  }, [selectedReviewIndex, selectedImgIndex]);

  if (currentReviewIndex === null || !reviews[currentReviewIndex]) return null;

  const currentReview = reviews[currentReviewIndex];
  const currentImage = currentReview.images?.[currentImageIndex] ?? "";

  const handleNext = () => {
    if (currentImageIndex < (currentReview.images?.length ?? 0) - 1) {
      setCurrentImageIndex((prev) => prev + 1);
      setSelectedImgIndex(currentImageIndex + 1);
    } else if (currentReviewIndex < reviews.length - 1) {
      setCurrentReviewIndex((prev) => (prev ?? 0) + 1);
      setCurrentImageIndex(0);
      setSelectedImgIndex(0);
    }
  };

  const handlePrev = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex((prev) => prev - 1);
      setSelectedImgIndex(currentImageIndex - 1);
    } else if (currentReviewIndex > 0) {
      const prevReview = reviews[currentReviewIndex - 1];
      setCurrentReviewIndex((prev) => (prev ?? 1) - 1);
      setCurrentImageIndex((prevReview.images?.length ?? 1) - 1);
      setSelectedImgIndex((prevReview.images?.length ?? 1) - 1);
    }
  };

  const close = () => {
    setShowViewReviewModal(false);
    setSelectedImgIndex(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 w-full max-w-4xl rounded-lg shadow-2xl overflow-hidden relative">
        <Button
          variant="ghost"
          onClick={close}
          className="absolute top-4 right-4 p-2 z-50"
          aria-label="Close modal"
        >
          <RiCloseLargeFill className="w-6 h-6 md:w-7 md:h-7 text-gray-700 dark:text-gray-300" />
        </Button>

        <div className="flex flex-col lg:flex-row w-full h-full min-h-[400px]">
          {/* Image viewer */}
          <div className="relative lg:w-1/2 w-full h-80 lg:h-auto p-2 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            {currentImage ? (
              <Image
                src={currentImage}
                alt="Review"
                fill
                className="object-cover p-2"
              />
            ) : (
              <p className="text-gray-400 italic">No image</p>
            )}

            <button
              onClick={handleNext}
              disabled={
                currentReviewIndex === reviews.length - 1 &&
                currentImageIndex === (currentReview.images?.length ?? 1) - 1
              }
              className="absolute top-1/2 -translate-y-1/2 right-3 md:right-6 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 md:p-3 transition-all"
            >
              <IoIosArrowForward className="w-5 h-5 md:w-6 md:h-6" />
            </button>

            <button
              onClick={handlePrev}
              disabled={currentReviewIndex === 0 && currentImageIndex === 0}
              className="absolute top-1/2 -translate-y-1/2 left-3 md:left-6 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 md:p-3 transition-all rotate-180"
            >
              <IoIosArrowForward className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </div>

          {/* Review info */}
          <div className="lg:w-1/2 w-full p-6 overflow-y-auto max-h-[80vh] space-y-6">
            <div className="flex items-center gap-3">
              <div className="bg-green-200 dark:bg-green-700 text-green-900 dark:text-green-100 w-12 h-12 md:w-14 md:h-14 flex items-center justify-center rounded-full font-semibold text-lg md:text-xl">
                {currentReview.userName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
              <p className="font-semibold text-gray-800 dark:text-gray-100 text-lg md:text-xl">
                {currentReview.userName}
              </p>
            </div>

            <p className="text-gray-700 dark:text-gray-300 text-base md:text-lg leading-relaxed">
              {currentReview.review}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}