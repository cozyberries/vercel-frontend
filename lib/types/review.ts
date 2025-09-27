export type ReviewStatus = "pending" | "approved" | "rejected" | "hidden";

export interface ReviewBase {
  user_id: string;
  order_id?: string; // Made optional since simplified schema doesn't require it
  product_id: string;
  rating: number; // 1-5
  title?: string;
  comment?: string;
}

export interface ReviewCreate extends ReviewBase {}

export interface Review extends ReviewBase {
  id: string;
  status: ReviewStatus;
  moderated_by?: string;
  moderated_at?: string;
  moderation_notes?: string;
  helpful_votes: number;
  created_at: string;
  updated_at: string;
}

export interface ReviewWithUser extends Review {
  user: {
    id: string;
    email?: string;
    raw_user_meta_data?: {
      full_name?: string;
    };
  };
}

export interface ProductRatingStats {
  average_rating: number;
  total_reviews: number;
  rating_distribution: {
    "5": number;
    "4": number;
    "3": number;
    "2": number;
    "1": number;
  };
}

export interface CreateReviewRequest {
  order_id?: string; // Made optional since simplified schema doesn't require it
  product_id: string;
  rating: number;
  title?: string;
  comment?: string;
}

export interface UpdateReviewRequest {
  rating?: number;
  title?: string;
  comment?: string;
}

export interface ReviewResponse {
  review: Review;
}

export interface ReviewsResponse {
  reviews: ReviewWithUser[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface ProductReviewsResponse {
  reviews: ReviewWithUser[];
  stats: ProductRatingStats;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}
