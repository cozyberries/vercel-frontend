"use client";
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";

export interface RatingItem {
    id: string;
    product_id: number;
    user_id: string;
    rating: number;
    comment: string;
    images: string[];
    created_at: string;
}

interface RatingContextType {
    reviews: RatingItem[];
    fetchReviews: (productId: number) => Promise<void>;
    setProductId: (productId: number) => void;
    productId: number;
}

const RatingContext = createContext<RatingContextType | undefined>(undefined);

export function RatingProvider({ children }: { children: ReactNode }) {
    const [reviews, setReviews] = useState<RatingItem[]>([]);
    const [productId, setProductId] = useState<number>(0);

    const fetchReviews = useCallback(async (productId: number) => {
        try {
            const response = await fetch(`/api/ratings/${productId}`);
            if (response.ok) {
                const data = await response.json();
                setReviews(data || []);
                console.log(data);
            }
        } catch (error) {
            console.error("Error fetching ratings:", error);
        }
    }, [productId]);

    useEffect(() => {
        if (productId) {
            fetchReviews(productId);
        }
    }, [productId, fetchReviews]);

    return (
        <RatingContext.Provider
            value={{
                reviews,
                fetchReviews,
                setProductId,
                productId,
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
