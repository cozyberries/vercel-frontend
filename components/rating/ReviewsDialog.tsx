"use client";

import { X } from "lucide-react";
import { FaStar } from "react-icons/fa";

interface ReviewItem {
  userName: string;
  title?: string | null;
  rating: number;
  review: string;
  images?: string[];
}

interface ReviewsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  reviews: ReviewItem[];
}

export default function ReviewsDialog({ isOpen, onClose, reviews }: ReviewsDialogProps) {
  if (!isOpen) return null;

  const average = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center md:p-4 z-50">
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 shrink-0">
          <h3 className="text-lg font-bold text-cb-fg">Reviews · {reviews.length}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-cb-fg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {reviews.length > 0 && (
            <div className="mb-5">
              <p className="text-5xl font-bold text-cb-fg">{average.toFixed(0)}</p>
              <p className="flex items-center gap-0.5 text-cb-terracotta my-1">
                {[...Array(5)].map((_, i) => (
                  <FaStar key={i} size={16} color={i < Math.round(average) ? "currentColor" : "#e5ddd3"} />
                ))}
              </p>
              <p className="text-sm text-cb-muted-fg">
                {reviews.length} review{reviews.length === 1 ? "" : "s"}
              </p>
            </div>
          )}

          <div className="divide-y divide-cb-border">
            {reviews.map((review, index) => (
              <div key={index} className="py-4 first:pt-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-bold text-cb-fg">{review.userName}</p>
                  <p className="flex items-center gap-0.5 text-cb-terracotta shrink-0">
                    {[...Array(5)].map((_, i) => (
                      <FaStar key={i} size={12} color={i < review.rating ? "currentColor" : "#e5ddd3"} />
                    ))}
                  </p>
                </div>
                {review.title && <p className="text-sm font-semibold text-cb-fg mb-0.5">{review.title}</p>}
                <p className="text-sm text-cb-muted-fg leading-relaxed">{review.review}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
