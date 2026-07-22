"use client";

import { useState, useEffect } from "react";
import { X, Star, PenLine } from "lucide-react";
import SupabaseImage from "@/components/ui/supabase-image";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface WriteReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  productImage?: string;
  reviewerName: string;
  isSaving: boolean;
  onSubmit: (data: { rating: number; title: string; comment: string }) => Promise<void> | void;
}

export default function WriteReviewDialog({
  isOpen,
  onClose,
  productName,
  productImage,
  reviewerName,
  isSaving,
  onSubmit,
}: WriteReviewDialogProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (isOpen) {
      setRating(0);
      setHover(null);
      setTitle("");
      setComment("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit = rating > 0 && comment.trim().length >= 10 && !isSaving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSubmit({ rating, title: title.trim(), comment: comment.trim() });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center md:p-4 z-50">
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-md w-full max-h-[92vh] md:max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 shrink-0">
          <h3 className="text-lg font-bold text-cb-fg">Write a review</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-cb-fg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-5">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-cb-linen">
              {productImage && <SupabaseImage src={productImage} preset="thumbnail" alt={productName} fill className="object-cover" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-cb-fg truncate">{productName}</p>
              <p className="text-sm text-cb-muted-fg truncate">Reviewing as {reviewerName}</p>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  onMouseEnter={() => setHover(value)}
                  onMouseLeave={() => setHover(null)}
                  aria-label={`Rate ${value} star${value === 1 ? "" : "s"}`}
                >
                  <Star
                    className="h-8 w-8"
                    fill={value <= (hover ?? rating) ? "#c98b6b" : "none"}
                    color={value <= (hover ?? rating) ? "#c98b6b" : "#d6cfc4"}
                  />
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-sm text-cb-muted-fg">Tap to rate</p>
          </div>

          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="h-12 rounded-xl"
          />

          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="How was the fabric, fit and quality?"
            rows={4}
            className="rounded-xl resize-none"
          />
        </div>

        <div className="p-5 shrink-0">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full flex items-center justify-center gap-2 rounded-full bg-cb-terracotta hover:bg-cb-terracotta-deep disabled:opacity-50 py-3.5 text-[15px] font-bold text-white"
          >
            <PenLine className="h-4 w-4" />
            {isSaving ? "Submitting..." : "Submit review"}
          </button>
          <p className="mt-2 text-center text-xs text-cb-muted-fg">Thanks for sharing your experience!</p>
        </div>
      </div>
    </div>
  );
}
