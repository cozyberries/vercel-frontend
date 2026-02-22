export interface RatingBase {
    user_id: string;
    product_slug: string;
    rating: number;
    comment?: string;
    images?: string[];
}

export interface Rating extends RatingBase {
    created_at: string;
}

export interface RatingCreate extends RatingBase { }
