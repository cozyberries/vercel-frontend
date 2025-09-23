-- EXPENSES MANAGEMENT SCHEMA - FIXED VERSION
-- This schema handles company expense tracking, approval workflows, and analytics
-- 
-- PREREQUISITES: 
-- 1. user_profiles table must exist (run user_profiles_schema.sql first)
-- 2. auth.users table exists (default in Supabase)

-- Step 1: Create expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  category VARCHAR(50) NOT NULL CHECK (category IN (
    'office_supplies',
    'travel',
    'marketing',
    'software',
    'equipment',
    'utilities',
    'professional_services',
    'training',
    'maintenance',
    'other'
  )),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid', 'cancelled')),
  expense_date DATE NOT NULL,
  vendor VARCHAR(200),
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN (
    'company_card',
    'reimbursement',
    'direct_payment',
    'bank_transfer'
  )),
  receipt_url TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  
  -- Approval workflow fields
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_reason TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Step 2: Create expense attachments table for file uploads
CREATE TABLE IF NOT EXISTS expense_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Step 3: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_priority ON expenses(priority);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_approved_by ON expenses(approved_by);

-- GIN index for tags array
CREATE INDEX IF NOT EXISTS idx_expenses_tags ON expenses USING GIN(tags);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_expenses_user_status ON expenses(user_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_status_date ON expenses(status, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category_date ON expenses(category, expense_date);

-- Index for expense attachments
CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense_id ON expense_attachments(expense_id);

-- Step 4: Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to expenses table
DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Step 5: Enable Row Level Security (RLS)
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_attachments ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS Policies for expenses table
-- Policy: Users can view their own expenses
DROP POLICY IF EXISTS "Users can view own expenses" ON expenses;
CREATE POLICY "Users can view own expenses" ON expenses
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can create their own expenses
DROP POLICY IF EXISTS "Users can create own expenses" ON expenses;
CREATE POLICY "Users can create own expenses" ON expenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own pending expenses
DROP POLICY IF EXISTS "Users can update own pending expenses" ON expenses;
CREATE POLICY "Users can update own pending expenses" ON expenses
  FOR UPDATE USING (auth.uid() = user_id AND status = 'pending');

-- Policy: Users can delete their own pending expenses
DROP POLICY IF EXISTS "Users can delete own pending expenses" ON expenses;
CREATE POLICY "Users can delete own pending expenses" ON expenses
  FOR DELETE USING (auth.uid() = user_id AND status = 'pending');

-- Step 7: Admin policies (only create if user_profiles table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    -- Policy: Admins can view all expenses
    DROP POLICY IF EXISTS "Admins can view all expenses" ON expenses;
    CREATE POLICY "Admins can view all expenses" ON expenses
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      );

    -- Policy: Admins can update all expenses
    DROP POLICY IF EXISTS "Admins can update all expenses" ON expenses;
    CREATE POLICY "Admins can update all expenses" ON expenses
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      );

    -- Policy: Admins can delete all expenses
    DROP POLICY IF EXISTS "Admins can delete all expenses" ON expenses;
    CREATE POLICY "Admins can delete all expenses" ON expenses
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      );
  ELSE
    RAISE NOTICE 'user_profiles table not found. Admin policies skipped. Please create user_profiles table first.';
  END IF;
END $$;

-- Step 8: Expense attachments policies
-- Policy: Users can view attachments for their own expenses
DROP POLICY IF EXISTS "Users can view own expense attachments" ON expense_attachments;
CREATE POLICY "Users can view own expense attachments" ON expense_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM expenses 
      WHERE expenses.id = expense_attachments.expense_id 
      AND expenses.user_id = auth.uid()
    )
  );

-- Policy: Users can create attachments for their own expenses
DROP POLICY IF EXISTS "Users can create own expense attachments" ON expense_attachments;
CREATE POLICY "Users can create own expense attachments" ON expense_attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses 
      WHERE expenses.id = expense_attachments.expense_id 
      AND expenses.user_id = auth.uid()
    )
  );

-- Policy: Users can delete attachments for their own pending expenses
DROP POLICY IF EXISTS "Users can delete own expense attachments" ON expense_attachments;
CREATE POLICY "Users can delete own expense attachments" ON expense_attachments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM expenses 
      WHERE expenses.id = expense_attachments.expense_id 
      AND expenses.user_id = auth.uid()
      AND expenses.status = 'pending'
    )
  );

-- Step 9: Admin policies for expense attachments (conditional)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    -- Policy: Admins can manage all expense attachments
    DROP POLICY IF EXISTS "Admins can view all expense attachments" ON expense_attachments;
    CREATE POLICY "Admins can view all expense attachments" ON expense_attachments
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      );

    DROP POLICY IF EXISTS "Admins can create expense attachments" ON expense_attachments;
    CREATE POLICY "Admins can create expense attachments" ON expense_attachments
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      );

    DROP POLICY IF EXISTS "Admins can delete expense attachments" ON expense_attachments;
    CREATE POLICY "Admins can delete expense attachments" ON expense_attachments
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;

-- Step 10: Create views for analytics (conditional on user_profiles)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    -- Monthly expense summary view
    DROP VIEW IF EXISTS monthly_expense_summary;
    CREATE VIEW monthly_expense_summary AS
    SELECT 
      DATE_TRUNC('month', expense_date) as month,
      COUNT(*) as total_expenses,
      SUM(amount) as total_amount,
      SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
      SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as approved_amount,
      SUM(CASE WHEN status = 'rejected' THEN amount ELSE 0 END) as rejected_amount,
      SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid_amount,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
      COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
      COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
      COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count
    FROM expenses
    GROUP BY DATE_TRUNC('month', expense_date)
    ORDER BY month DESC;

    -- Category expense summary view
    DROP VIEW IF EXISTS category_expense_summary;
    CREATE VIEW category_expense_summary AS
    SELECT 
      category,
      COUNT(*) as total_expenses,
      SUM(amount) as total_amount,
      AVG(amount) as average_amount,
      SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
      SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as approved_amount,
      SUM(CASE WHEN status = 'rejected' THEN amount ELSE 0 END) as rejected_amount,
      SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid_amount
    FROM expenses
    GROUP BY category
    ORDER BY total_amount DESC;

    -- User expense summary view
    DROP VIEW IF EXISTS user_expense_summary;
    CREATE VIEW user_expense_summary AS
    SELECT 
      e.user_id,
      up.full_name,
      COUNT(*) as total_expenses,
      SUM(e.amount) as total_amount,
      AVG(e.amount) as average_amount,
      SUM(CASE WHEN e.status = 'pending' THEN e.amount ELSE 0 END) as pending_amount,
      SUM(CASE WHEN e.status = 'approved' THEN e.amount ELSE 0 END) as approved_amount,
      SUM(CASE WHEN e.status = 'rejected' THEN e.amount ELSE 0 END) as rejected_amount,
      SUM(CASE WHEN e.status = 'paid' THEN e.amount ELSE 0 END) as paid_amount
    FROM expenses e
    LEFT JOIN user_profiles up ON e.user_id = up.id
    GROUP BY e.user_id, up.full_name
    ORDER BY total_amount DESC;

    -- Grant permissions on views
    GRANT SELECT ON monthly_expense_summary TO authenticated;
    GRANT SELECT ON category_expense_summary TO authenticated;
    GRANT SELECT ON user_expense_summary TO authenticated;
  ELSE
    RAISE NOTICE 'user_profiles table not found. Analytics views not created. Please create user_profiles table first.';
  END IF;
END $$;

-- Step 11: Add table comments for documentation
COMMENT ON TABLE expenses IS 'Company expense tracking and management';
COMMENT ON TABLE expense_attachments IS 'File attachments for expense entries';

COMMENT ON COLUMN expenses.amount IS 'Expense amount in the base currency (INR)';
COMMENT ON COLUMN expenses.category IS 'Expense category for reporting and budgeting';
COMMENT ON COLUMN expenses.priority IS 'Priority level for approval workflow';
COMMENT ON COLUMN expenses.status IS 'Current status in the approval workflow';
COMMENT ON COLUMN expenses.tags IS 'Array of tags for flexible categorization';
COMMENT ON COLUMN expenses.approved_by IS 'User ID of the approver';
COMMENT ON COLUMN expenses.rejected_reason IS 'Reason for rejection if applicable';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Expenses schema created successfully!';
  RAISE NOTICE 'Tables created: expenses, expense_attachments';
  RAISE NOTICE 'Next steps: Test the expense management system in your app';
END $$;
