-- Simple Reviews Table Setup
-- This script creates the reviews table with minimal dependencies
-- Run this in your Supabase SQL editor

-- Create reviews table (simplified version)
CREATE TABLE IF NOT EXISTS reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL, -- References products table
    
    -- Review content
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(200),
    comment TEXT,
    
    -- Review status
    status VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (
        status IN ('pending', 'approved', 'rejected', 'hidden')
    ),
    
    -- Helpful votes (for future enhancement)
    helpful_votes INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_user_product UNIQUE (user_id, product_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
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

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view approved reviews" ON reviews;
DROP POLICY IF EXISTS "Users can view their own reviews" ON reviews;
DROP POLICY IF EXISTS "Users can create reviews" ON reviews;
DROP POLICY IF EXISTS "Users can update their own reviews" ON reviews;
DROP POLICY IF EXISTS "Users can delete their own reviews" ON reviews;

-- Create RLS policies
-- Users can view approved reviews for any product
CREATE POLICY "Users can view approved reviews" ON reviews
    FOR SELECT USING (status = 'approved');

-- Users can view their own reviews regardless of status
CREATE POLICY "Users can view their own reviews" ON reviews
    FOR SELECT USING (auth.uid() = user_id);

-- Users can create reviews
CREATE POLICY "Users can create reviews" ON reviews
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own reviews
CREATE POLICY "Users can update their own reviews" ON reviews
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own reviews
CREATE POLICY "Users can delete their own reviews" ON reviews
    FOR DELETE USING (auth.uid() = user_id);

-- Create function to get product rating statistics
DROP FUNCTION IF EXISTS get_product_rating_stats(UUID);
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

-- Add some sample data for testing (optional)
-- Uncomment the following lines to add sample reviews for testing
-- You'll need to replace the UUIDs with actual user and product IDs

-- INSERT INTO reviews (user_id, product_id, rating, title, comment, status) VALUES
-- ('your-user-id-here', 'your-product-id-here', 5, 'Great product!', 'Really happy with this purchase.', 'approved'),
-- ('your-user-id-here', 'your-product-id-here', 4, 'Good quality', 'Good product, fast delivery.', 'approved'),
-- ('your-user-id-here', 'your-product-id-here', 3, 'Average', 'Product is okay, nothing special.', 'approved');

-- To get your user ID, run: SELECT id FROM auth.users LIMIT 1;
-- To get your product ID, run: SELECT id FROM products LIMIT 1; (if products table exists)

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Reviews table created successfully!';
  RAISE NOTICE 'Table created: reviews';
  RAISE NOTICE 'RLS policies created for user access';
  RAISE NOTICE 'Triggers and functions created';
  RAISE NOTICE 'Function created: get_product_rating_stats()';
  RAISE NOTICE 'Ready to use reviews functionality!';
END $$;
