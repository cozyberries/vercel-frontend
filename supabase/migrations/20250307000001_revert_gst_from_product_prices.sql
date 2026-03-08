-- Down migration: Revert 5% GST by restoring price from original_price (exact, no rounding drift).
-- Run manually if you need to undo the GST application.

UPDATE products
SET price = original_price,
    original_price = NULL,
    gst_applied_at = NULL
WHERE gst_applied_at IS NOT NULL;

UPDATE product_variants
SET price = original_price,
    original_price = NULL,
    gst_applied_at = NULL
WHERE gst_applied_at IS NOT NULL;
