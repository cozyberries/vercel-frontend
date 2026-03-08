-- Migration: Apply 5% GST to product and variant prices (idempotent).
-- Only updates rows that have not had GST applied (gst_applied_at IS NULL).
-- Reruns will not compound the 5% increase.

-- 1. Add guard column to products if not present
ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_applied_at TIMESTAMPTZ;

-- 2. Apply GST only to products not yet updated
UPDATE products
SET price = ROUND(price * 1.05, 2),
    gst_applied_at = now()
WHERE price IS NOT NULL AND gst_applied_at IS NULL;

-- 3. Add guard column to product_variants if not present
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS gst_applied_at TIMESTAMPTZ;

-- 4. Apply GST only to variants not yet updated
UPDATE product_variants
SET price = ROUND(price * 1.05, 2),
    gst_applied_at = now()
WHERE price IS NOT NULL AND gst_applied_at IS NULL;
