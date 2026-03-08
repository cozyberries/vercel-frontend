-- Migration: Apply 5% GST to all product and variant prices
-- This makes the database the source of truth with GST-inclusive prices
-- All code should now use these prices directly (no additional GST calculation needed)

-- 1. Update all product base prices with 5% GST
UPDATE products
SET price = ROUND(price * 1.05, 2)
WHERE price IS NOT NULL;

-- 2. Update all product variant prices with 5% GST
UPDATE product_variants
SET price = ROUND(price * 1.05, 2)
WHERE price IS NOT NULL;
