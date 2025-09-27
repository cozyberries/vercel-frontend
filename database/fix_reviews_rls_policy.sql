-- Fix infinite recursion in reviews RLS policy
-- This script fixes the "infinite recursion detected in policy for relation 'reviews'" error

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can create reviews for delivered orders" ON reviews;

-- Create a simplified policy that only checks user ownership
-- Order validation (delivered status, etc.) is handled at the application level
CREATE POLICY "Users can create reviews for their own orders" ON reviews
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Reviews RLS policy fixed successfully!';
  RAISE NOTICE 'Removed complex EXISTS subquery that was causing infinite recursion';
  RAISE NOTICE 'Order validation is now handled at application level in the API route';
END $$;
