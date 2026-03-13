-- Standardise half-sleeve jabla-and-shorts product slugs to jhabla-shorts-half-sleeve-<design>.
-- 1) Rename jhabla-shorts-moons-and-stars → jhabla-shorts-half-sleeve-moons-and-stars
-- 2) Merge jhabla-shorts-popsicles into jhabla-shorts-half-sleeve-popsicles
-- Idempotent: safe to run multiple times (INSERT/UPDATEs guarded).

-- ─── 1. Moons and stars: add new product row with standard slug, migrate children, drop old ───
INSERT INTO products (
  name, slug, description, price, care_instructions, stock_quantity, is_featured,
  created_at, updated_at, size_slugs, category_slug, gender_slug, color_slugs, is_active, base_price
)
SELECT
  name, 'jhabla-shorts-half-sleeve-moons-and-stars', description, price, care_instructions, stock_quantity, is_featured,
  created_at, updated_at, size_slugs, category_slug, gender_slug, color_slugs, is_active, base_price
FROM products
WHERE slug = 'jhabla-shorts-moons-and-stars'
  AND NOT EXISTS (SELECT 1 FROM products p2 WHERE p2.slug = 'jhabla-shorts-half-sleeve-moons-and-stars');

UPDATE product_images
SET product_slug = 'jhabla-shorts-half-sleeve-moons-and-stars',
    url = REPLACE(url, 'products/jhabla-shorts-moons-and-stars/', 'products/jhabla-shorts-half-sleeve-moons-and-stars/')
WHERE product_slug = 'jhabla-shorts-moons-and-stars';

UPDATE product_variants
SET product_slug = 'jhabla-shorts-half-sleeve-moons-and-stars',
    slug = REPLACE(slug, 'jhabla-shorts-moons-and-stars-', 'jhabla-shorts-half-sleeve-moons-and-stars-')
WHERE product_slug = 'jhabla-shorts-moons-and-stars';

UPDATE product_features
SET product_slug = 'jhabla-shorts-half-sleeve-moons-and-stars'
WHERE product_slug = 'jhabla-shorts-moons-and-stars';

DELETE FROM products WHERE slug = 'jhabla-shorts-moons-and-stars';

-- ─── 2. Popsicles: merge jhabla-shorts-popsicles into jhabla-shorts-half-sleeve-popsicles ───
-- Migrate images (append display_order so no PK clash)
UPDATE product_images
SET product_slug = 'jhabla-shorts-half-sleeve-popsicles',
    display_order = display_order + 6,
    url = REPLACE(url, 'products/jhabla-shorts-popsicles/', 'products/jhabla-shorts-half-sleeve-popsicles/')
WHERE product_slug = 'jhabla-shorts-popsicles';

-- Migrate variants (repoint and rename slug)
UPDATE product_variants
SET product_slug = 'jhabla-shorts-half-sleeve-popsicles',
    slug = REPLACE(slug, 'jhabla-shorts-popsicles-', 'jhabla-shorts-half-sleeve-popsicles-')
WHERE product_slug = 'jhabla-shorts-popsicles';

UPDATE order_items
SET product_id = 'jhabla-shorts-half-sleeve-popsicles'
WHERE product_id = 'jhabla-shorts-popsicles';

DELETE FROM products WHERE slug = 'jhabla-shorts-popsicles';
