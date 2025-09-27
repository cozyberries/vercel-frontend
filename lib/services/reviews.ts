import type { 
  Review, 
  ReviewResponse, 
  ReviewFilters, 
  ProductRating,
  OrderReviewableItem,
  CreateReviewRequest,
  UpdateReviewRequest,
  ReviewVoteRequest
} from "@/lib/types/review";

class ReviewService {
  private baseUrl = '/api/reviews';

  async getReviews(filters: ReviewFilters = {}): Promise<ReviewResponse> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });

    const response = await fetch(`${this.baseUrl}?${params.toString()}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch reviews');
    }

    return response.json();
  }

  async getReview(reviewId: string): Promise<{ review: Review }> {
    const response = await fetch(`${this.baseUrl}/${reviewId}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch review');
    }

    return response.json();
  }

  async createReview(reviewData: CreateReviewRequest): Promise<{ review: Review }> {
    const formData = new FormData();
    formData.append('order_id', reviewData.order_id);
    formData.append('product_id', reviewData.product_id);
    formData.append('rating', reviewData.rating.toString());
    
    if (reviewData.title) {
      formData.append('title', reviewData.title);
    }
    
    if (reviewData.comment) {
      formData.append('comment', reviewData.comment);
    }
    
    if (reviewData.images) {
      reviewData.images.forEach(image => {
        formData.append('images', image);
      });
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create review');
    }

    return response.json();
  }

  async updateReview(reviewId: string, reviewData: UpdateReviewRequest): Promise<{ review: Review }> {
    const formData = new FormData();
    
    if (reviewData.rating !== undefined) {
      formData.append('rating', reviewData.rating.toString());
    }
    
    if (reviewData.title !== undefined) {
      formData.append('title', reviewData.title);
    }
    
    if (reviewData.comment !== undefined) {
      formData.append('comment', reviewData.comment);
    }
    
    if (reviewData.images) {
      reviewData.images.forEach(image => {
        formData.append('images', image);
      });
    }

    const response = await fetch(`${this.baseUrl}/${reviewId}`, {
      method: 'PATCH',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update review');
    }

    return response.json();
  }

  async deleteReview(reviewId: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/${reviewId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete review');
    }

    return response.json();
  }

  async voteOnReview(reviewId: string, voteData: ReviewVoteRequest): Promise<{ vote: any; review_stats: any }> {
    const response = await fetch(`${this.baseUrl}/${reviewId}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(voteData),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to vote on review');
    }

    return response.json();
  }

  async removeVote(reviewId: string): Promise<{ message: string; review_stats: any }> {
    const response = await fetch(`${this.baseUrl}/${reviewId}/vote`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove vote');
    }

    return response.json();
  }

  async getProductReviews(productId: string, page: number = 1, limit: number = 10): Promise<{
    rating: ProductRating;
    reviews: ReviewResponse;
  }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    const response = await fetch(`/api/products/${productId}/reviews?${params.toString()}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch product reviews');
    }

    return response.json();
  }

  async getOrderReviewableItems(orderId: string): Promise<{ items: OrderReviewableItem[] }> {
    const response = await fetch(`/api/orders/${orderId}/reviewable`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch reviewable items');
    }

    return response.json();
  }

  // Helper methods
  formatRating(rating: number): string {
    switch (rating) {
      case 1: return 'Poor';
      case 2: return 'Fair';
      case 3: return 'Good';
      case 4: return 'Very Good';
      case 5: return 'Excellent';
      default: return 'Not Rated';
    }
  }

  getRatingStars(rating: number): string {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  formatRelativeDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
      return 'Today';
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    } else if (diffInDays < 30) {
      const weeks = Math.floor(diffInDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else if (diffInDays < 365) {
      const months = Math.floor(diffInDays / 30);
      return `${months} month${months > 1 ? 's' : ''} ago`;
    } else {
      const years = Math.floor(diffInDays / 365);
      return `${years} year${years > 1 ? 's' : ''} ago`;
    }
  }
}

export const reviewService = new ReviewService();
