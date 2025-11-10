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
    const [productId, setProductId] = useState<string>("");
    const [selectedImgIndex, setSelectedImgIndex] = useState<number>(0);
    const [selectedReviewIndex, setSelectedReviewIndex] = useState<number | null>(null);
    const [showViewReviewModal, setShowViewReviewModal] = useState(false);

    const fetchReviews = useCallback(async () => {
        try {
            const response = await fetch(`/api/ratings`);
            if (response.ok) {
                const data = await response.json();
                setReviews(data || []);
            }
        } catch (error) {
            console.error("Error fetching ratings:", error);
        }
    }, []);

    useEffect(() => {
        fetchReviews();
    }, []);

    return (
        <RatingContext.Provider
            value={{
                reviews,
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
