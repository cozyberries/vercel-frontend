-- Migration: Add base_price; keep existing price for display and validation.
-- Both base_price and price stored as INTEGER (whole rupees, no decimals).

-- 1. Add base_price as INTEGER to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_price INTEGER;

-- 2. Derive base_price from current price only where price is set; then default remaining NULLs
UPDATE products
SET base_price = (ROUND(price / 1.05, 0))::INTEGER
WHERE base_price IS NULL AND price IS NOT NULL;

UPDATE products SET base_price = 0 WHERE base_price IS NULL;

ALTER TABLE products ALTER COLUMN base_price SET NOT NULL;

-- 3. Ensure base_price is INTEGER (in case it was added as DECIMAL earlier)
ALTER TABLE products ALTER COLUMN base_price TYPE INTEGER USING (ROUND(base_price, 0))::INTEGER;

-- 4. Change price to INTEGER (whole rupees)
ALTER TABLE products ALTER COLUMN price TYPE INTEGER USING (ROUND(price, 0))::INTEGER;

-- 5. Add base_price as INTEGER to product_variants
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS base_price INTEGER;

-- 6. Derive base_price from current price only where price is set; then default remaining NULLs
UPDATE product_variants
SET base_price = (ROUND(price / 1.05, 0))::INTEGER
WHERE base_price IS NULL AND price IS NOT NULL;

UPDATE product_variants SET base_price = 0 WHERE base_price IS NULL;

ALTER TABLE product_variants ALTER COLUMN base_price SET NOT NULL;

-- 7. Ensure base_price is INTEGER on variants
ALTER TABLE product_variants ALTER COLUMN base_price TYPE INTEGER USING (ROUND(base_price, 0))::INTEGER;

-- 8. Change price to INTEGER on product_variants
ALTER TABLE product_variants ALTER COLUMN price TYPE INTEGER USING (ROUND(price, 0))::INTEGER;
