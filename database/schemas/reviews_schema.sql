-- Reviews and ratings table schema for Supabase
-- This table stores product reviews and ratings from customers

CREATE TABLE IF NOT EXISTS reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- Review content
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    comment TEXT,
    
    -- Review status
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
        status IN (
            'pending',
            'approved',
            'rejected',
            'hidden'
        )
    ),
    
    -- Review metadata
    is_verified_purchase BOOLEAN NOT NULL DEFAULT TRUE,
    helpful_votes INTEGER NOT NULL DEFAULT 0,
    total_votes INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_user_product_order UNIQUE (user_id, product_id, order_id)
);

-- Review images table for storing review photos
CREATE TABLE IF NOT EXISTS review_images (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    storage_path VARCHAR(500) NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Review helpfulness votes table
CREATE TABLE IF NOT EXISTS review_votes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_helpful BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_user_review_vote UNIQUE (user_id, review_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_verified_purchase ON reviews(is_verified_purchase);

CREATE INDEX IF NOT EXISTS idx_review_images_review_id ON review_images(review_id);
CREATE INDEX IF NOT EXISTS idx_review_images_display_order ON review_images(display_order);

CREATE INDEX IF NOT EXISTS idx_review_votes_review_id ON review_votes(review_id);
CREATE INDEX IF NOT EXISTS idx_review_votes_user_id ON review_votes(user_id);

-- Create function to update review helpfulness counts
CREATE OR REPLACE FUNCTION update_review_helpfulness()
RETURNS TRIGGER AS $$
BEGIN
    -- Update helpful votes count
    UPDATE reviews 
    SET helpful_votes = (
        SELECT COUNT(*) 
        FROM review_votes 
        WHERE review_id = COALESCE(NEW.review_id, OLD.review_id) 
        AND is_helpful = true
    ),
    total_votes = (
        SELECT COUNT(*) 
        FROM review_votes 
        WHERE review_id = COALESCE(NEW.review_id, OLD.review_id)
    )
    WHERE id = COALESCE(NEW.review_id, OLD.review_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update helpfulness counts
CREATE TRIGGER trigger_update_review_helpfulness
    AFTER INSERT OR UPDATE OR DELETE ON review_votes
    FOR EACH ROW
    EXECUTE FUNCTION update_review_helpfulness();

-- Create trigger to update updated_at timestamp
CREATE TRIGGER trigger_reviews_updated_at
    BEFORE UPDATE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_votes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for reviews
-- Users can view approved reviews for products
CREATE POLICY "Users can view approved reviews" ON reviews
    FOR SELECT USING (status = 'approved');

-- Users can view their own reviews regardless of status
CREATE POLICY "Users can view their own reviews" ON reviews
    FOR SELECT USING (auth.uid() = user_id);

-- Users can create reviews for their own orders
CREATE POLICY "Users can create reviews for their orders" ON reviews
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM orders 
            WHERE id = order_id 
            AND user_id = auth.uid() 
            AND status = 'delivered'
        )
    );

-- Users can update their own pending reviews
CREATE POLICY "Users can update their own pending reviews" ON reviews
    FOR UPDATE USING (
        auth.uid() = user_id AND 
        status = 'pending'
    );

-- Create RLS policies for review_images
-- Users can view images for approved reviews
CREATE POLICY "Users can view approved review images" ON review_images
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM reviews 
            WHERE id = review_id 
            AND status = 'approved'
        )
    );

-- Users can view images for their own reviews
CREATE POLICY "Users can view their own review images" ON review_images
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM reviews 
            WHERE id = review_id 
            AND user_id = auth.uid()
        )
    );

-- Users can create images for their own reviews
CREATE POLICY "Users can create review images" ON review_images
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM reviews 
            WHERE id = review_id 
            AND user_id = auth.uid()
        )
    );

-- Users can update images for their own reviews
CREATE POLICY "Users can update their own review images" ON review_images
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM reviews 
            WHERE id = review_id 
            AND user_id = auth.uid()
        )
    );

-- Users can delete images for their own reviews
CREATE POLICY "Users can delete their own review images" ON review_images
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM reviews 
            WHERE id = review_id 
            AND user_id = auth.uid()
        )
    );

-- Create RLS policies for review_votes
-- Users can view votes for approved reviews
CREATE POLICY "Users can view votes for approved reviews" ON review_votes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM reviews 
            WHERE id = review_id 
            AND status = 'approved'
        )
    );

-- Users can create votes for approved reviews (not their own)
CREATE POLICY "Users can vote on approved reviews" ON review_votes
    FOR INSERT WITH CHECK (
        auth.uid() != (SELECT user_id FROM reviews WHERE id = review_id) AND
        EXISTS (
            SELECT 1 FROM reviews 
            WHERE id = review_id 
            AND status = 'approved'
        )
    );

-- Users can update their own votes
CREATE POLICY "Users can update their own votes" ON review_votes
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own votes
CREATE POLICY "Users can delete their own votes" ON review_votes
    FOR DELETE USING (auth.uid() = user_id);

-- Create function to calculate product average rating
CREATE OR REPLACE FUNCTION calculate_product_rating(product_uuid UUID)
RETURNS TABLE (
    average_rating DECIMAL(3,2),
    total_reviews INTEGER,
    rating_distribution JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(AVG(rating)::DECIMAL(3,2), 0) as average_rating,
        COUNT(*)::INTEGER as total_reviews,
        jsonb_build_object(
            '5', COUNT(*) FILTER (WHERE rating = 5),
            '4', COUNT(*) FILTER (WHERE rating = 4),
            '3', COUNT(*) FILTER (WHERE rating = 3),
            '2', COUNT(*) FILTER (WHERE rating = 2),
            '1', COUNT(*) FILTER (WHERE rating = 1)
        ) as rating_distribution
    FROM reviews 
    WHERE product_id = product_uuid 
    AND status = 'approved';
END;
$$ LANGUAGE plpgsql;

-- Create function to check if user can review product from order
CREATE OR REPLACE FUNCTION can_user_review_product(
    user_uuid UUID,
    order_uuid UUID,
    product_uuid UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM orders o
        WHERE o.id = order_uuid
        AND o.user_id = user_uuid
        AND o.status = 'delivered'
        AND EXISTS (
            SELECT 1 
            FROM jsonb_array_elements(o.items) AS item
            WHERE (item->>'id')::UUID = product_uuid
        )
        AND NOT EXISTS (
            SELECT 1 
            FROM reviews r
            WHERE r.user_id = user_uuid
            AND r.order_id = order_uuid
            AND r.product_id = product_uuid
        )
    );
END;
$$ LANGUAGE plpgsql;
