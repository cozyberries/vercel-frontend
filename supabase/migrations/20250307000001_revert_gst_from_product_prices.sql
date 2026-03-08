-- Down migration: Revert 5% GST only for rows that had it applied.
-- Run manually if you need to undo the GST application.

UPDATE products
SET price = ROUND(price / 1.05, 2),
    gst_applied_at = NULL
WHERE gst_applied_at IS NOT NULL;

UPDATE product_variants
SET price = ROUND(price / 1.05, 2),
    gst_applied_at = NULL
WHERE gst_applied_at IS NOT NULL;
