-- Migration: Apply 5% GST to product and variant prices (idempotent).
-- Only updates rows that have not had GST applied (gst_applied_at IS NULL).
-- Stores pre-GST price in original_price so revert can restore exactly (no rounding drift).

-- 1. Add guard and backup columns to products if not present
ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_applied_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS original_price DECIMAL(10, 2);

-- 2. Apply GST only to products not yet updated; backup current price for exact revert
UPDATE products
SET original_price = price,
    price = ROUND(price * 1.05, 2),
    gst_applied_at = now()
WHERE price IS NOT NULL AND gst_applied_at IS NULL;

-- 3. Add guard and backup columns to product_variants if not present
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS gst_applied_at TIMESTAMPTZ;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS original_price DECIMAL(10, 2);

-- 4. Apply GST only to variants not yet updated; backup current price for exact revert
UPDATE product_variants
SET original_price = price,
    price = ROUND(price * 1.05, 2),
    gst_applied_at = now()
WHERE price IS NOT NULL AND gst_applied_at IS NULL;
