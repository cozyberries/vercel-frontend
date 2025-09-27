-- COMPLETE EXPENSES SETUP SCRIPT
-- This script ensures all tables and relationships are properly set up for the expense management system
-- Run this script in your Supabase SQL editor to fix the relationship issues

-- STEP 1: Ensure user_profiles table exists with correct structure
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (
        role IN ('customer', 'admin', 'super_admin')
    ),
    full_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    date_of_birth DATE,
    preferred_language VARCHAR(10) DEFAULT 'en',
    marketing_consent BOOLEAN DEFAULT false,
    default_shipping_address JSONB,
    default_billing_address JSONB,
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    admin_notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- STEP 2: Ensure expenses table exists with correct structure
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
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- STEP 3: Create expense attachments table
CREATE TABLE IF NOT EXISTS expense_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- STEP 4: Create necessary indexes
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

-- STEP 5: Fix the user_expense_summary view with correct relationship and email from auth.users
DROP VIEW IF EXISTS user_expense_summary;
CREATE OR REPLACE VIEW user_expense_summary AS
SELECT 
  e.user_id,
  au.email,
  up.full_name,
  COUNT(*) as total_expenses,
  SUM(e.amount) as total_amount,
  AVG(e.amount) as average_amount,
  SUM(CASE WHEN e.status = 'pending' THEN e.amount ELSE 0 END) as pending_amount,
  SUM(CASE WHEN e.status = 'approved' THEN e.amount ELSE 0 END) as approved_amount,
  SUM(CASE WHEN e.status = 'rejected' THEN e.amount ELSE 0 END) as rejected_amount,
  SUM(CASE WHEN e.status = 'paid' THEN e.amount ELSE 0 END) as paid_amount
FROM expenses e
LEFT JOIN user_profiles up ON e.user_id = up.id  -- Join with user_profiles for full_name
LEFT JOIN auth.users au ON e.user_id = au.id     -- Join with auth.users for email
GROUP BY e.user_id, au.email, up.full_name
ORDER BY total_amount DESC;

-- STEP 6: Create monthly expense summary view
DROP VIEW IF EXISTS monthly_expense_summary;
CREATE OR REPLACE VIEW monthly_expense_summary AS
SELECT 
  DATE_TRUNC('month', expense_date) as month,
  COUNT(*) as total_expenses,
  SUM(amount) as total_amount,
  AVG(amount) as average_amount,
  SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
  SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as approved_amount,
  SUM(CASE WHEN status = 'rejected' THEN amount ELSE 0 END) as rejected_amount,
  SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid_amount
FROM expenses
GROUP BY DATE_TRUNC('month', expense_date)
ORDER BY month DESC;

-- STEP 7: Create category expense summary view
DROP VIEW IF EXISTS category_expense_summary;
CREATE OR REPLACE VIEW category_expense_summary AS
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

-- STEP 8: Enable Row Level Security
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- STEP 9: Create RLS policies for expenses
CREATE POLICY IF NOT EXISTS "Users can view own expenses" ON expenses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can create own expenses" ON expenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own pending expenses" ON expenses
  FOR UPDATE USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY IF NOT EXISTS "Admins can view all expenses" ON expenses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY IF NOT EXISTS "Admins can update all expenses" ON expenses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- STEP 10: Create RLS policies for user_profiles
CREATE POLICY IF NOT EXISTS "Users can view their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "Admins can view all profiles" ON user_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- STEP 11: Grant permissions
GRANT ALL ON expenses TO authenticated;
GRANT ALL ON expense_attachments TO authenticated;
GRANT ALL ON user_profiles TO authenticated;
GRANT SELECT ON monthly_expense_summary TO authenticated;
GRANT SELECT ON category_expense_summary TO authenticated;
GRANT SELECT ON user_expense_summary TO authenticated;

-- STEP 12: Create trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- STEP 13: Create function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_profiles (id, role, full_name, email, is_active)
    VALUES (
        NEW.id,
        'customer',
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        NEW.email,
        true
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_user_profile ON auth.users;
CREATE TRIGGER trigger_create_user_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_user_profile();

-- STEP 14: Add comments for documentation
COMMENT ON TABLE expenses IS 'Company expense tracking and management with correct user_profiles relationship';
COMMENT ON VIEW user_expense_summary IS 'User expense summary with correct relationship: expenses.user_id = user_profiles.id';
COMMENT ON COLUMN expenses.user_id IS 'References auth.users(id), joins with user_profiles.id';

-- Success message
SELECT 'Expenses database setup completed successfully! The relationship between expenses and user_profiles is now correctly configured.' as message;
