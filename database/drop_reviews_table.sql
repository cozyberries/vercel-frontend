-- Drop and recreate reviews table completely
-- This will remove all existing policies and data

-- First, drop all dependent objects
DROP TRIGGER IF EXISTS trigger_reviews_updated_at ON reviews;
DROP TRIGGER IF EXISTS trigger_check_order_delivered ON reviews;
DROP FUNCTION IF EXISTS update_reviews_updated_at();
DROP FUNCTION IF EXISTS check_order_delivered();
DROP FUNCTION IF EXISTS get_product_rating_stats(UUID);

-- Drop all policies
DROP POLICY IF EXISTS "Users can view approved reviews" ON reviews;
DROP POLICY IF EXISTS "Users can view their own reviews" ON reviews;
DROP POLICY IF EXISTS "Users can create reviews for delivered orders" ON reviews;
DROP POLICY IF EXISTS "Users can create reviews for their own orders" ON reviews;
DROP POLICY IF EXISTS "Users can update their own pending reviews" ON reviews;
DROP POLICY IF EXISTS "Users can delete their own pending reviews" ON reviews;
DROP POLICY IF EXISTS "Admins can view all reviews" ON reviews;
DROP POLICY IF EXISTS "Admins can moderate reviews" ON reviews;
DROP POLICY IF EXISTS "Admins can delete reviews" ON reviews;

-- Drop the table completely
DROP TABLE IF EXISTS reviews CASCADE;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Reviews table dropped completely!';
  RAISE NOTICE 'All policies, triggers, and functions removed';
  RAISE NOTICE 'Ready to recreate with clean schema';
END $$;
