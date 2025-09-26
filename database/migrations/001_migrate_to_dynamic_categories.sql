-- MIGRATION: Update expenses table to use dynamic categories
-- This migration updates the expenses table to reference the new expense_categories table
-- 
-- PREREQUISITES: 
-- 1. expense_categories table must exist (run expense_categories_schema.sql first)
-- 2. expenses table must exist with current enum constraint

-- Step 1: Add new category_id column to expenses table
DO $$
BEGIN
  -- Check if category_id column already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'expenses' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN category_id UUID REFERENCES expense_categories(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Step 2: Populate category_id based on existing category values
UPDATE expenses SET category_id = (
  SELECT id FROM expense_categories WHERE name = expenses.category
) WHERE category_id IS NULL;

-- Step 3: Create index for the new foreign key
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);

-- Step 4: Add constraint to ensure category_id is set for new records
-- (We'll keep both columns temporarily for backward compatibility)
DO $$
BEGIN
  -- Add a check constraint to ensure category_id is populated for new records
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'expenses' AND constraint_name = 'expenses_category_id_required'
  ) THEN
    ALTER TABLE expenses ADD CONSTRAINT expenses_category_id_required 
    CHECK (category_id IS NOT NULL OR category IS NOT NULL);
  END IF;
END $$;

-- Step 5: Update the category_expense_summary view to use the new table
DROP VIEW IF EXISTS category_expense_summary;
CREATE VIEW category_expense_summary AS
SELECT 
  ec.id as category_id,
  ec.name as category,
  ec.display_name as category_display_name,
  ec.color as category_color,
  ec.icon as category_icon,
  COUNT(e.*) as total_expenses,
  COALESCE(SUM(e.amount), 0) as total_amount,
  COALESCE(AVG(e.amount), 0) as average_amount,
  COALESCE(SUM(CASE WHEN e.status = 'pending' THEN e.amount ELSE 0 END), 0) as pending_amount,
  COALESCE(SUM(CASE WHEN e.status = 'approved' THEN e.amount ELSE 0 END), 0) as approved_amount,
  COALESCE(SUM(CASE WHEN e.status = 'rejected' THEN e.amount ELSE 0 END), 0) as rejected_amount,
  COALESCE(SUM(CASE WHEN e.status = 'paid' THEN e.amount ELSE 0 END), 0) as paid_amount,
  COUNT(CASE WHEN e.status = 'pending' THEN 1 END) as pending_count,
  COUNT(CASE WHEN e.status = 'approved' THEN 1 END) as approved_count,
  COUNT(CASE WHEN e.status = 'rejected' THEN 1 END) as rejected_count,
  COUNT(CASE WHEN e.status = 'paid' THEN 1 END) as paid_count
FROM expense_categories ec
LEFT JOIN expenses e ON e.category_id = ec.id
WHERE ec.is_active = true
GROUP BY ec.id, ec.name, ec.display_name, ec.color, ec.icon, ec.sort_order
ORDER BY ec.sort_order, ec.display_name;

-- Step 6: Grant permissions on updated view
GRANT SELECT ON category_expense_summary TO authenticated;

-- Step 7: Create function to sync category field with category_id (for backward compatibility)
CREATE OR REPLACE FUNCTION sync_expense_category()
RETURNS TRIGGER AS $$
BEGIN
  -- If category_id is set, update category field
  IF NEW.category_id IS NOT NULL THEN
    NEW.category := (SELECT name FROM expense_categories WHERE id = NEW.category_id);
  -- If category is set but category_id is not, try to find matching category_id
  ELSIF NEW.category IS NOT NULL AND NEW.category_id IS NULL THEN
    NEW.category_id := (SELECT id FROM expense_categories WHERE name = NEW.category LIMIT 1);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create trigger to maintain synchronization
DROP TRIGGER IF EXISTS sync_expense_category_trigger ON expenses;
CREATE TRIGGER sync_expense_category_trigger
  BEFORE INSERT OR UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION sync_expense_category();

-- Step 9: Add helpful functions for category management
CREATE OR REPLACE FUNCTION get_category_by_slug(category_slug TEXT)
RETURNS expense_categories AS $$
DECLARE
  category_record expense_categories;
BEGIN
  SELECT * INTO category_record 
  FROM expense_categories 
  WHERE slug = category_slug AND is_active = true;
  
  RETURN category_record;
END;
$$ LANGUAGE plpgsql;

-- Step 10: Create function to get active categories for API
CREATE OR REPLACE FUNCTION get_active_expense_categories()
RETURNS TABLE (
  id UUID,
  name VARCHAR(100),
  slug VARCHAR(100),
  display_name VARCHAR(200),
  description TEXT,
  color VARCHAR(7),
  icon VARCHAR(50),
  sort_order INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ec.id,
    ec.name,
    ec.slug,
    ec.display_name,
    ec.description,
    ec.color,
    ec.icon,
    ec.sort_order
  FROM expense_categories ec
  WHERE ec.is_active = true
  ORDER BY ec.sort_order, ec.display_name;
END;
$$ LANGUAGE plpgsql;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Expense categories migration completed successfully!';
  RAISE NOTICE 'Added category_id column to expenses table';
  RAISE NOTICE 'Updated category_expense_summary view';
  RAISE NOTICE 'Created synchronization triggers for backward compatibility';
  RAISE NOTICE 'Next step: Update API endpoints to use dynamic categories';
END $$;
