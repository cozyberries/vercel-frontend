"use client";
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";

export interface RatingItem {
    id: string;
    product_id: string;
    user_id: string;
    rating: number;
    comment: string;
    images: string[];
    created_at: string;
}

interface RatingContextType {
    reviews: RatingItem[];
    reviewsLoading: boolean;
    fetchReviews: (productId?: string) => Promise<void>;
    setProductId: (productId: string) => void;
    productId: string;
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
    const [productId, setProductId] = useState<string>("");
    const [selectedImgIndex, setSelectedImgIndex] = useState<number>(0);
    const [selectedReviewIndex, setSelectedReviewIndex] = useState<number | null>(null);
    const [showViewReviewModal, setShowViewReviewModal] = useState(false);

    const fetchReviews = useCallback(async (productId?: string) => {
        try {
            const url = productId 
                ? `/api/ratings?product_id=${encodeURIComponent(productId)}`
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
    // Clear reviews immediately when productId changes so stale reviews aren't shown while the new fetch resolves.
    useEffect(() => {
        if (productId) {
            setReviews([]);
            setReviewsLoading(true);
            fetchReviews(productId).finally(() => setReviewsLoading(false));
        }
    }, [productId, fetchReviews]);

    return (
        <RatingContext.Provider
            value={{
                reviews,
                reviewsLoading,
                fetchReviews,
                setProductId,
                productId,
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
