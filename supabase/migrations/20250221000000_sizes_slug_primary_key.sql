-- Migration: sizes table — remove id and age_slug, make slug the primary key (lowercase).
-- product_variants.size_slug references sizes; we drop FK, update both tables, then re-add FK.

-- 1. Drop FK so we can update both tables
ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS product_variants_size_slug_fkey;

-- 2. Normalize sizes.slug to lowercase
UPDATE sizes SET slug = LOWER(TRIM(slug)) WHERE slug IS NOT NULL AND slug != LOWER(TRIM(slug));

-- 3. Normalize product_variants.size_slug to lowercase
UPDATE product_variants SET size_slug = LOWER(TRIM(size_slug)) WHERE size_slug IS NOT NULL AND size_slug != LOWER(TRIM(size_slug));

-- 4. Ensure sizes.slug is NOT NULL
ALTER TABLE sizes ALTER COLUMN slug SET NOT NULL;

-- 5. Drop age_slug column
ALTER TABLE sizes DROP COLUMN IF EXISTS age_slug;

-- 6. Drop old primary key, set slug as primary key, drop id
ALTER TABLE sizes DROP CONSTRAINT IF EXISTS sizes_pkey;
ALTER TABLE sizes ADD PRIMARY KEY (slug);
ALTER TABLE sizes DROP COLUMN IF EXISTS id;

-- 7. Enforce lowercase slug on insert/update
ALTER TABLE sizes ADD CONSTRAINT sizes_slug_lowercase CHECK (slug = LOWER(slug));

-- 8. Re-add FK: product_variants.size_slug -> sizes.slug
ALTER TABLE product_variants ADD CONSTRAINT product_variants_size_slug_fkey FOREIGN KEY (size_slug) REFERENCES sizes(slug);
