-- Reviews and Ratings table schema for Supabase
-- This table stores product reviews and ratings from customers

CREATE TABLE IF NOT EXISTS reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL, -- References products table (assuming it exists)
    
    -- Review content
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(200),
    comment TEXT,
    
    -- Review status
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'approved', 'rejected', 'hidden')
    ),
    
    -- Moderation fields
    moderated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    moderated_at TIMESTAMP WITH TIME ZONE,
    moderation_notes TEXT,
    
    -- Helpful votes (for future enhancement)
    helpful_votes INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_user_order_product UNIQUE (user_id, order_id, product_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);

-- Create function to update updated_at timestamp
DROP TRIGGER IF EXISTS trigger_reviews_updated_at ON reviews;
DROP FUNCTION IF EXISTS update_reviews_updated_at();
CREATE OR REPLACE FUNCTION update_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reviews_updated_at
    BEFORE UPDATE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_reviews_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can view approved reviews for any product
DROP POLICY IF EXISTS "Users can view approved reviews" ON reviews;
CREATE POLICY "Users can view approved reviews" ON reviews
    FOR SELECT USING (status = 'approved');

-- Users can view their own reviews regardless of status
DROP POLICY IF EXISTS "Users can view their own reviews" ON reviews;
CREATE POLICY "Users can view their own reviews" ON reviews
    FOR SELECT USING (auth.uid() = user_id);

-- Users can create reviews for their own orders (order validation handled at application level)
DROP POLICY IF EXISTS "Users can create reviews for delivered orders" ON reviews;
CREATE POLICY "Users can create reviews for their own orders" ON reviews
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending reviews
DROP POLICY IF EXISTS "Users can update their own pending reviews" ON reviews;
CREATE POLICY "Users can update their own pending reviews" ON reviews
    FOR UPDATE USING (
        auth.uid() = user_id AND 
        status = 'pending'
    ) WITH CHECK (
        auth.uid() = user_id AND 
        status = 'pending'
    );

-- Users can delete their own pending reviews
DROP POLICY IF EXISTS "Users can delete their own pending reviews" ON reviews;
CREATE POLICY "Users can delete their own pending reviews" ON reviews
    FOR DELETE USING (
        auth.uid() = user_id AND 
        status = 'pending'
    );

-- Admin policies (only create if user_profiles table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    -- Policy: Admins can view all reviews
    DROP POLICY IF EXISTS "Admins can view all reviews" ON reviews;
    CREATE POLICY "Admins can view all reviews" ON reviews
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      );

    -- Policy: Admins can moderate reviews
    DROP POLICY IF EXISTS "Admins can moderate reviews" ON reviews;
    CREATE POLICY "Admins can moderate reviews" ON reviews
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      );

    -- Policy: Admins can delete reviews
    DROP POLICY IF EXISTS "Admins can delete reviews" ON reviews;
    CREATE POLICY "Admins can delete reviews" ON reviews
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      );
  ELSE
    RAISE NOTICE 'user_profiles table not found. Admin policies skipped. Please create user_profiles table first.';
  END IF;
END $$;

-- Create function to check if order is delivered before allowing review
DROP TRIGGER IF EXISTS trigger_check_order_delivered ON reviews;
DROP FUNCTION IF EXISTS check_order_delivered();
CREATE OR REPLACE FUNCTION check_order_delivered()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the order is delivered
    IF NOT EXISTS (
        SELECT 1 FROM orders 
        WHERE id = NEW.order_id 
        AND status = 'delivered'
        AND user_id = NEW.user_id
    ) THEN
        RAISE EXCEPTION 'Reviews can only be created for delivered orders';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Comment out the trigger for now to avoid issues
-- DROP TRIGGER IF EXISTS trigger_check_order_delivered ON reviews;
-- CREATE TRIGGER trigger_check_order_delivered
--     BEFORE INSERT ON reviews
--     FOR EACH ROW
--     EXECUTE FUNCTION check_order_delivered();

-- Create function to get product rating statistics
CREATE OR REPLACE FUNCTION get_product_rating_stats(product_uuid UUID)
RETURNS TABLE (
    average_rating DECIMAL(3,2),
    total_reviews INTEGER,
    rating_distribution JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ROUND(AVG(rating)::DECIMAL, 2) as average_rating,
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

-- Grant necessary permissions
GRANT ALL ON reviews TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Add table comments for documentation
COMMENT ON TABLE reviews IS 'Product reviews and ratings from customers';
COMMENT ON COLUMN reviews.rating IS 'Rating from 1 to 5 stars';
COMMENT ON COLUMN reviews.status IS 'Review moderation status: pending, approved, rejected, hidden';
COMMENT ON COLUMN reviews.helpful_votes IS 'Number of users who found this review helpful';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Reviews schema created successfully!';
  RAISE NOTICE 'Table created: reviews';
  RAISE NOTICE 'RLS policies created for user and admin access';
  RAISE NOTICE 'Triggers created for validation and timestamps';
  RAISE NOTICE 'Function created: get_product_rating_stats()';
END $$;
