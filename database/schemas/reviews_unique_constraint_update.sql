-- Update reviews table to ensure users can only review each product once
-- This migration modifies the unique constraint to be user_id + product_id only
-- instead of user_id + product_id + order_id

-- First, drop the existing unique constraint
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS unique_user_product_order;

-- Add new unique constraint for user_id + product_id only
-- This ensures a user can only review each product once, regardless of how many orders they have
ALTER TABLE reviews ADD CONSTRAINT unique_user_product UNIQUE (user_id, product_id);

-- Update the can_user_review_product function to reflect this change
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
            AND r.product_id = product_uuid
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Update the RLS policy to reflect the new constraint
DROP POLICY IF EXISTS "Users can create reviews for their orders" ON reviews;

CREATE POLICY "Users can create reviews for their orders" ON reviews
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM orders 
            WHERE id = order_id 
            AND user_id = auth.uid() 
            AND status = 'delivered'
        )
        AND NOT EXISTS (
            SELECT 1 FROM reviews 
            WHERE user_id = auth.uid() 
            AND product_id = reviews.product_id
        )
    );
