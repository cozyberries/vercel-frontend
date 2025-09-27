"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { X, Star, Upload, Trash2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { OrderReviewableItem, Review } from "@/lib/types/review";

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: OrderReviewableItem;
  orderId: string;
  onReviewSubmitted: (review: Review) => void;
  allItems?: OrderReviewableItem[];
  onItemChange?: (item: OrderReviewableItem) => void;
}

export default function ReviewModal({
  isOpen,
  onClose,
  item,
  orderId,
  onReviewSubmitted,
  allItems,
  onItemChange,
}: ReviewModalProps) {
  const [rating, setRating] = useState(item.existing_review?.rating || 0);
  const [title, setTitle] = useState(item.existing_review?.title || "");
  const [comment, setComment] = useState(item.existing_review?.comment || "");
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter((file) => {
      // Check file type
      if (!file.type.startsWith("image/")) {
        setError("Please select only image files");
        return false;
      }
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError("Image size must be less than 5MB");
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    // Limit to 5 images total
    const remainingSlots = 5 - images.length;
    const filesToAdd = validFiles.slice(0, remainingSlots);

    if (filesToAdd.length < validFiles.length) {
      setError(
        `You can only upload up to 5 images. ${remainingSlots} slots remaining.`
      );
    }

    setImages((prev) => [...prev, ...filesToAdd]);

    // Create previews
    const newPreviews = filesToAdd.map((file) => URL.createObjectURL(file));
    setImagePreviews((prev) => [...prev, ...newPreviews]);
    setError(null);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => {
      const newPreviews = [...prev];
      URL.revokeObjectURL(newPreviews[index]);
      return newPreviews.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating === 0) {
      setError("Please select a rating");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("order_id", orderId);
      formData.append("product_id", item.product_id);
      formData.append("rating", rating.toString());
      if (title.trim()) formData.append("title", title.trim());
      if (comment.trim()) formData.append("comment", comment.trim());

      // Add images
      images.forEach((image) => {
        formData.append("images", image);
      });

      const url = item.existing_review
        ? `/api/reviews/${item.existing_review.id}`
        : "/api/reviews";

      const method = item.existing_review ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit review");
      }

      onReviewSubmitted(data.review);
      onClose();

      // Reset form
      setRating(0);
      setTitle("");
      setComment("");
      setImages([]);
      setImagePreviews([]);
    } catch (err) {
      console.error("Error submitting review:", err);
      setError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              {item.existing_review ? "Update Review" : "Write a Review"}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Item Selector for multiple items */}
          {allItems && allItems.length > 1 && onItemChange && (
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Select Product to Review
              </Label>
              <select
                value={item.product_id}
                onChange={(e) => {
                  const selectedItem = allItems.find(
                    (i) => i.product_id === e.target.value
                  );
                  if (selectedItem) {
                    onItemChange(selectedItem);
                    // Reset form for new item
                    setRating(selectedItem.existing_review?.rating || 0);
                    setTitle(selectedItem.existing_review?.title || "");
                    setComment(selectedItem.existing_review?.comment || "");
                    setImages([]);
                    setImagePreviews([]);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                disabled={isSubmitting}
              >
                {allItems.map((reviewItem) => (
                  <option
                    key={reviewItem.product_id}
                    value={reviewItem.product_id}
                  >
                    {reviewItem.product_name}{" "}
                    {reviewItem.existing_review ? "(Review Exists)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="p-6 border-b">
          <div className="flex items-center gap-4">
            {item.product_image && (
              <div className="relative w-16 h-16 bg-muted rounded-md overflow-hidden">
                <Image
                  src={item.product_image}
                  alt={item.product_name}
                  fill
                  className="object-cover"
                />
              </div>
            )}
            <div>
              <h3 className="font-medium">{item.product_name}</h3>
              <p className="text-sm text-muted-foreground">
                Qty: {item.quantity} × ₹{item.price.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Rating */}
          <div>
            <Label className="text-sm font-medium">Rating *</Label>
            <div className="flex items-center gap-1 mt-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="focus:outline-none"
                  disabled={isSubmitting}
                >
                  <Star
                    className={`w-8 h-8 ${
                      star <= rating
                        ? "text-yellow-400 fill-current"
                        : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
              <span className="ml-2 text-sm text-muted-foreground">
                {rating > 0 &&
                  (rating === 1
                    ? "Poor"
                    : rating === 2
                    ? "Fair"
                    : rating === 3
                    ? "Good"
                    : rating === 4
                    ? "Very Good"
                    : "Excellent")}
              </span>
            </div>
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="title" className="text-sm font-medium">
              Review Title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summarize your experience (optional)"
              maxLength={255}
              disabled={isSubmitting}
              className="mt-2"
            />
          </div>

          {/* Comment */}
          <div>
            <Label htmlFor="comment" className="text-sm font-medium">
              Your Review
            </Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience with this product..."
              rows={4}
              maxLength={1000}
              disabled={isSubmitting}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {comment.length}/1000 characters
            </p>
          </div>

          {/* Image Upload */}
          <div>
            <Label className="text-sm font-medium">Photos (Optional)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Upload up to 5 images to show others what you received
            </p>

            <div className="space-y-4">
              {/* Upload Button */}
              {images.length < 5 && (
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">
                    Click to upload images or drag and drop
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    PNG, JPG up to 5MB each
                  </p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                disabled={isSubmitting}
              />

              {/* Image Previews */}
              {imagePreviews.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <div className="relative w-full h-24 bg-muted rounded-md overflow-hidden">
                        <Image
                          src={preview}
                          alt={`Review image ${index + 1}`}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute -top-2 -right-2 w-6 h-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeImage(index)}
                        disabled={isSubmitting}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex items-center gap-3 pt-4">
            <Button
              type="submit"
              disabled={isSubmitting || rating === 0}
              className="flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {item.existing_review ? "Update Review" : "Submit Review"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
