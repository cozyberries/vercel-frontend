"use client";
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";

export interface RatingItem {
    product_slug: string;
    user_id: string;
    rating: number;
    comment: string;
    images: string[];
    created_at: string;
}

interface RatingContextType {
    reviews: RatingItem[];
    reviewsLoading: boolean;
    fetchReviews: (productSlug?: string) => Promise<void>;
    setProductSlug: (productSlug: string) => void;
    productSlug: string;
    showViewReviewModal: boolean;
    setShowViewReviewModal: (value: boolean) => void;
    selectedReviewIndex: number | null;
  setSelectedReviewIndex: (index: number | null) => void;
    selectedImgIndex: number;
    setSelectedImgIndex: (index: number) => void;
  }

const RatingContext = createContext<RatingContextType | undefined>(undefined);

export function RatingProvider({ children }: { children: ReactNode }) {
    const [reviews, setReviews] = useState<RatingItem[]>([]);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [productSlug, setProductSlug] = useState<string>("");
    const [selectedImgIndex, setSelectedImgIndex] = useState<number>(0);
    const [selectedReviewIndex, setSelectedReviewIndex] = useState<number | null>(null);
    const [showViewReviewModal, setShowViewReviewModal] = useState(false);

    const fetchReviews = useCallback(async (productSlug?: string) => {
        try {
            const url = productSlug 
                ? `/api/ratings?product_slug=${encodeURIComponent(productSlug)}`
                : `/api/ratings`;
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                setReviews(data || []);
            }
        } catch (error) {
            console.error("Error fetching ratings:", error);
        }
    }, []);

    // Only fetch reviews when a specific product is being viewed.
    // Clear reviews immediately when productSlug changes so stale reviews aren't shown while the new fetch resolves.
    useEffect(() => {
        if (productSlug) {
            setReviews([]);
            setReviewsLoading(true);
            fetchReviews(productSlug).finally(() => setReviewsLoading(false));
        }
    }, [productSlug, fetchReviews]);

    return (
        <RatingContext.Provider
            value={{
                reviews,
                reviewsLoading,
                fetchReviews,
                setProductSlug,
                productSlug,
                selectedImgIndex,
                setSelectedImgIndex,
                showViewReviewModal,
                setShowViewReviewModal,
                selectedReviewIndex,
                setSelectedReviewIndex,
            }}
        >
            {children}
        </RatingContext.Provider>
    );
}

export function useRating() {
    const context = useContext(RatingContext);
    if (!context) throw new Error("useRating must be used within a RatingProvider");
    return context;
}
