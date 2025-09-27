-- Test Reviews Functionality
-- Run this after setting up the reviews table to test the functionality

-- Test 1: Check if reviews table exists and has correct structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'reviews' 
ORDER BY ordinal_position;

-- Test 2: Check if the rating stats function exists
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines 
WHERE routine_name = 'get_product_rating_stats';

-- Test 3: Test the rating stats function with a sample product ID
-- Replace 'your-product-id-here' with an actual product ID from your products table
-- SELECT * FROM get_product_rating_stats('your-product-id-here'::UUID);

-- Test 4: Check RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'reviews';

-- Test 5: Check if user_profiles table exists (needed for the join)
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
ORDER BY ordinal_position;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Reviews functionality test completed!';
  RAISE NOTICE 'Check the results above to verify everything is working correctly.';
  RAISE NOTICE 'If you see errors, make sure to run the setup_reviews_simple.sql script first.';
END $$;
