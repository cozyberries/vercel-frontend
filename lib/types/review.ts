export type ReviewStatus = 
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'hidden';

export interface ReviewImage {
  id: string;
  review_id: string;
  storage_path: string;
  display_order?: number;
  url?: string;
  created_at: string;
}

export interface ReviewVote {
  id: string;
  review_id: string;
  user_id: string;
  is_helpful: boolean;
  created_at: string;
}

export interface ReviewBase {
  user_id: string;
  order_id: string;
  product_id: string;
  rating: number;
  title?: string;
  comment?: string;
  status?: ReviewStatus;
  is_verified_purchase?: boolean;
}

export interface ReviewCreate extends ReviewBase {
  images?: File[];
}

export interface ReviewUpdate {
  rating?: number;
  title?: string;
  comment?: string;
  images?: File[];
}

export interface Review extends ReviewBase {
  id: string;
  status: ReviewStatus;
  is_verified_purchase: boolean;
  helpful_votes: number;
  total_votes: number;
  created_at: string;
  updated_at: string;
  images?: ReviewImage[];
  votes?: ReviewVote[];
  // User information (populated from joins)
  user_name?: string;
  user_avatar?: string;
  // Product information (populated from joins)
  product_name?: string;
  product_image?: string;
  // Order information (populated from joins)
  order_number?: string;
}

export interface ProductRating {
  average_rating: number;
  total_reviews: number;
  rating_distribution: {
    '5': number;
    '4': number;
    '3': number;
    '2': number;
    '1': number;
  };
}

export interface ReviewSummary {
  product_id: string;
  product_name: string;
  product_image?: string;
  can_review: boolean;
  existing_review?: Review;
  rating: ProductRating;
}

export interface CreateReviewRequest {
  order_id: string;
  product_id: string;
  rating: number;
  title?: string;
  comment?: string;
  images?: File[];
}

export interface UpdateReviewRequest {
  rating?: number;
  title?: string;
  comment?: string;
  images?: File[];
}

export interface ReviewVoteRequest {
  review_id: string;
  is_helpful: boolean;
}

export interface ReviewFilters {
  product_id?: string;
  user_id?: string;
  order_id?: string;
  status?: ReviewStatus;
  rating?: number;
  is_verified_purchase?: boolean;
  page?: number;
  limit?: number;
  sort_by?: 'created_at' | 'rating' | 'helpful_votes';
  sort_order?: 'asc' | 'desc';
}

export interface ReviewResponse {
  reviews: Review[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface OrderReviewableItem {
  product_id: string;
  product_name: string;
  product_image?: string;
  quantity: number;
  price: number;
  can_review: boolean;
  existing_review?: Review;
}
