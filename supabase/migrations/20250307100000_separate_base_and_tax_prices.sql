-- Migration: Separate base_price and price_with_tax columns
-- This allows us to:
-- 1. Validate orders with base_price (cart validation)
-- 2. Display price_with_tax to customers (with GST or any other tax)
-- 3. Change tax rates in future without losing original price data

-- 1. Add new columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_price DECIMAL(10, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_with_tax DECIMAL(10, 2);

-- 2. For existing products, derive base_price from current price
-- Assume current prices are already with 5% GST
-- base_price = price / 1.05
UPDATE products
SET base_price = ROUND(price / 1.05, 2),
    price_with_tax = price
WHERE base_price IS NULL;

-- 3. Add new columns to product_variants table
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS base_price DECIMAL(10, 2);
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS price_with_tax DECIMAL(10, 2);

-- 4. For existing variants, derive base_price from current price
-- Assume current prices are already with 5% GST
-- base_price = price / 1.05
UPDATE product_variants
SET base_price = ROUND(price / 1.05, 2),
    price_with_tax = price
WHERE base_price IS NULL;

-- 5. Make the new columns NOT NULL (after data is populated)
ALTER TABLE products ALTER COLUMN base_price SET NOT NULL;
ALTER TABLE products ALTER COLUMN price_with_tax SET NOT NULL;

ALTER TABLE product_variants ALTER COLUMN base_price SET NOT NULL;
ALTER TABLE product_variants ALTER COLUMN price_with_tax SET NOT NULL;
