-- MINIMAL EXPENSES SCHEMA - NO DEPENDENCIES
-- This creates just the basic expenses table without user_profiles dependencies
-- Use this if you don't have user_profiles table yet

-- Create expenses table
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

-- Create expense attachments table
CREATE TABLE IF NOT EXISTS expense_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create basic indexes
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);

-- Create updated_at trigger
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

-- Enable RLS
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_attachments ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (users can manage their own expenses)
DROP POLICY IF EXISTS "Users can view own expenses" ON expenses;
CREATE POLICY "Users can view own expenses" ON expenses
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own expenses" ON expenses;
CREATE POLICY "Users can create own expenses" ON expenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own expenses" ON expenses;
CREATE POLICY "Users can update own expenses" ON expenses
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own expenses" ON expenses;
CREATE POLICY "Users can delete own expenses" ON expenses
  FOR DELETE USING (auth.uid() = user_id);

-- Attachment policies
DROP POLICY IF EXISTS "Users can view own attachments" ON expense_attachments;
CREATE POLICY "Users can view own attachments" ON expense_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM expenses 
      WHERE expenses.id = expense_attachments.expense_id 
      AND expenses.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create own attachments" ON expense_attachments;
CREATE POLICY "Users can create own attachments" ON expense_attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses 
      WHERE expenses.id = expense_attachments.expense_id 
      AND expenses.user_id = auth.uid()
    )
  );

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Minimal expenses schema created successfully!';
  RAISE NOTICE 'Note: Admin policies not created. Add user_profiles table for full admin functionality.';
END $$;
