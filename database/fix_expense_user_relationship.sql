-- Fix the relationship between expenses and user_profiles tables
-- The issue is in the user_expense_summary view which incorrectly joins on user_profiles.user_id
-- when it should join on user_profiles.id

-- Drop the existing view first
DROP VIEW IF EXISTS user_expense_summary;

-- Recreate the view with the correct relationship and email from auth.users
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
LEFT JOIN user_profiles up ON e.user_id = up.id
LEFT JOIN auth.users au ON e.user_id = au.id  -- Get email from auth.users
GROUP BY e.user_id, au.email, up.full_name
ORDER BY total_amount DESC;

-- Grant permissions
GRANT SELECT ON user_expense_summary TO authenticated;

-- Add comment for documentation
COMMENT ON VIEW user_expense_summary IS 'User expense summary with correct relationship to user_profiles.id';
