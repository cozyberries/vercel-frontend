import type {
  CreateReviewRequest,
  UpdateReviewRequest,
  ReviewResponse,
  ReviewsResponse,
  ProductReviewsResponse,
} from "@/lib/types/review";

class ReviewService {
  private baseUrl = "/api/reviews";

  async createReview(data: CreateReviewRequest): Promise<ReviewResponse> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("Review creation error:", error);
      throw new Error(
        error.details || error.error || "Failed to create review"
      );
    }

    return response.json();
  }

  async getUserReviews(params?: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<ReviewsResponse> {
    const searchParams = new URLSearchParams();

    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.status) searchParams.set("status", params.status);

    const url = `${this.baseUrl}?${searchParams.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch reviews");
    }

    return response.json();
  }

  async getReview(reviewId: string): Promise<ReviewResponse> {
    const response = await fetch(`${this.baseUrl}/${reviewId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch review");
    }

    return response.json();
  }

  async updateReview(
    reviewId: string,
    data: UpdateReviewRequest
  ): Promise<ReviewResponse> {
    const response = await fetch(`${this.baseUrl}/${reviewId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update review");
    }

    return response.json();
  }

  async deleteReview(reviewId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${reviewId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to delete review");
    }
  }

  async getProductReviews(
    productId: string,
    params?: {
      limit?: number;
      offset?: number;
      sortBy?: "newest" | "oldest" | "highest" | "lowest";
    }
  ): Promise<ProductReviewsResponse> {
    const searchParams = new URLSearchParams();

    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    if (params?.sortBy) searchParams.set("sortBy", params.sortBy);

    const url = `/api/products/${productId}/reviews?${searchParams.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch product reviews");
    }

    return response.json();
  }

  async getOrderReviewableProducts(orderId: string): Promise<{
    order_id: string;
    status: string;
    items: Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
      image?: string;
      has_review: boolean;
      review_id?: string;
    }>;
  }> {
    const response = await fetch(`/api/orders/${orderId}/reviewable-products`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch reviewable products");
    }

    return response.json();
  }
}

export const reviewService = new ReviewService();
