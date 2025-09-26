-- EXPENSE CATEGORIES MANAGEMENT SCHEMA
-- This schema adds dynamic expense category management to the expense system
-- 
-- PREREQUISITES: 
-- 1. expenses table must exist (run create_expenses_schema_fixed.sql first)
-- 2. user_profiles table must exist (run user_profiles_schema.sql first)
-- 3. auth.users table exists (default in Supabase)

-- Step 1: Create expense_categories table
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  color VARCHAR(7) DEFAULT '#6B7280', -- Hex color for UI
  icon VARCHAR(50) DEFAULT 'folder', -- Icon name for UI
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false, -- System categories cannot be deleted
  sort_order INTEGER DEFAULT 0,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Step 2: Insert default categories (migrating from hardcoded enum)
INSERT INTO expense_categories (name, slug, display_name, description, color, icon, is_system, sort_order) VALUES
  ('office_supplies', 'office-supplies', 'Office Supplies', 'Stationery, office equipment, and general supplies', '#8B5CF6', 'briefcase', true, 1),
  ('travel', 'travel', 'Travel', 'Business travel, accommodation, and transportation', '#3B82F6', 'plane', true, 2),
  ('marketing', 'marketing', 'Marketing', 'Advertising, promotional materials, and campaigns', '#EF4444', 'megaphone', true, 3),
  ('software', 'software', 'Software', 'Software licenses, subscriptions, and tools', '#10B981', 'monitor', true, 4),
  ('equipment', 'equipment', 'Equipment', 'Hardware, machinery, and equipment purchases', '#F59E0B', 'settings', true, 5),
  ('utilities', 'utilities', 'Utilities', 'Internet, phone, electricity, and utilities', '#06B6D4', 'zap', true, 6),
  ('professional_services', 'professional-services', 'Professional Services', 'Consulting, legal, and accounting services', '#8B5CF6', 'user-check', true, 7),
  ('training', 'training', 'Training', 'Employee training, courses, and certifications', '#F97316', 'graduation-cap', true, 8),
  ('maintenance', 'maintenance', 'Maintenance', 'Equipment maintenance, repairs, and servicing', '#6B7280', 'wrench', true, 9),
  ('other', 'other', 'Other', 'Miscellaneous expenses not covered by other categories', '#64748B', 'more-horizontal', true, 10);

-- Step 3: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_expense_categories_slug ON expense_categories(slug);
CREATE INDEX IF NOT EXISTS idx_expense_categories_is_active ON expense_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_expense_categories_sort_order ON expense_categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_expense_categories_created_by ON expense_categories(created_by);

-- Step 4: Create updated_at trigger
CREATE OR REPLACE FUNCTION update_expense_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to expense_categories table
DROP TRIGGER IF EXISTS update_expense_categories_updated_at ON expense_categories;
CREATE TRIGGER update_expense_categories_updated_at
    BEFORE UPDATE ON expense_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_expense_categories_updated_at();

-- Step 5: Enable Row Level Security (RLS)
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS Policies for expense_categories table
-- Policy: All authenticated users can view active categories
DROP POLICY IF EXISTS "Users can view active expense categories" ON expense_categories;
CREATE POLICY "Users can view active expense categories" ON expense_categories
  FOR SELECT USING (is_active = true);

-- Step 7: Admin policies (only create if user_profiles table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    -- Policy: Admins can view all categories
    DROP POLICY IF EXISTS "Admins can view all expense categories" ON expense_categories;
    CREATE POLICY "Admins can view all expense categories" ON expense_categories
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      );

    -- Policy: Admins can create categories
    DROP POLICY IF EXISTS "Admins can create expense categories" ON expense_categories;
    CREATE POLICY "Admins can create expense categories" ON expense_categories
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      );

    -- Policy: Admins can update categories
    DROP POLICY IF EXISTS "Admins can update expense categories" ON expense_categories;
    CREATE POLICY "Admins can update expense categories" ON expense_categories
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      );

    -- Policy: Admins can delete non-system categories
    DROP POLICY IF EXISTS "Admins can delete expense categories" ON expense_categories;
    CREATE POLICY "Admins can delete expense categories" ON expense_categories
      FOR DELETE USING (
        is_system = false AND
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      );
  ELSE
    RAISE NOTICE 'user_profiles table not found. Admin policies skipped. Please create user_profiles table first.';
  END IF;
END $$;

-- Step 8: Add function to generate unique slug
CREATE OR REPLACE FUNCTION generate_category_slug(category_name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Convert name to slug format
  base_slug := LOWER(TRIM(REGEXP_REPLACE(category_name, '[^a-zA-Z0-9]+', '-', 'g')));
  base_slug := TRIM(base_slug, '-');
  
  -- Check if slug exists and generate unique one if needed
  final_slug := base_slug;
  
  WHILE EXISTS (SELECT 1 FROM expense_categories WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Step 9: Add table comments for documentation
COMMENT ON TABLE expense_categories IS 'Dynamic expense categories for flexible expense classification';
COMMENT ON COLUMN expense_categories.name IS 'Internal category name (used for backward compatibility)';
COMMENT ON COLUMN expense_categories.slug IS 'URL-friendly unique identifier';
COMMENT ON COLUMN expense_categories.display_name IS 'Human-readable category name shown in UI';
COMMENT ON COLUMN expense_categories.description IS 'Detailed description of what this category covers';
COMMENT ON COLUMN expense_categories.color IS 'Hex color code for UI theming';
COMMENT ON COLUMN expense_categories.icon IS 'Icon name for UI display';
COMMENT ON COLUMN expense_categories.is_system IS 'System categories cannot be deleted by admins';
COMMENT ON COLUMN expense_categories.sort_order IS 'Display order in category lists';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Expense Categories schema created successfully!';
  RAISE NOTICE 'Table created: expense_categories';
  RAISE NOTICE 'Default categories inserted with backward compatibility';
  RAISE NOTICE 'Next step: Update expense table to use dynamic categories';
END $$;
