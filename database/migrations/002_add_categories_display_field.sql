-- Add display field to categories table
-- This migration adds a display boolean field to control category visibility

-- Step 1: Add the display column to categories table
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS display BOOLEAN DEFAULT true;

-- Step 2: Update existing categories to have display=true by default
UPDATE categories 
SET display = true 
WHERE display IS NULL;

-- Step 3: Add index for better performance when filtering by display
CREATE INDEX IF NOT EXISTS idx_categories_display ON categories(display);

-- Step 4: Add comment for documentation
COMMENT ON COLUMN categories.display IS 'Controls whether the category is displayed on the homepage';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Categories display field migration completed successfully!';
  RAISE NOTICE 'Added display column to categories table';
  RAISE NOTICE 'Set all existing categories to display=true';
  RAISE NOTICE 'Created index for performance optimization';
END $$;
