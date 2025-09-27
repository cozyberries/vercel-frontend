# Fix for Expense Dashboard Database Relationship Error

## Problem Description

The error "Could not find a relationship between 'expenses' and 'user_profiles' in the schema cache" occurs because there's an incorrect join condition in the database view.

## Root Cause

The `user_expense_summary` view in the database was incorrectly joining tables using:

```sql
LEFT JOIN user_profiles up ON e.user_id = up.user_id
```

However, the correct relationship should be:

```sql
LEFT JOIN user_profiles up ON e.user_id = up.id
```

This is because:

- `expenses.user_id` references `auth.users(id)`
- `user_profiles.id` references `auth.users(id)` (not `user_profiles.user_id`)

## Solution

### Option 1: Quick Fix (Recommended)

Run this SQL script in your Supabase SQL editor:

```sql
-- Fix the user_expense_summary view with correct relationship
DROP VIEW IF EXISTS user_expense_summary;
CREATE OR REPLACE VIEW user_expense_summary AS
SELECT
  e.user_id,
  up.email,
  up.full_name,
  COUNT(*) as total_expenses,
  SUM(e.amount) as total_amount,
  AVG(e.amount) as average_amount,
  SUM(CASE WHEN e.status = 'pending' THEN e.amount ELSE 0 END) as pending_amount,
  SUM(CASE WHEN e.status = 'approved' THEN e.amount ELSE 0 END) as approved_amount,
  SUM(CASE WHEN e.status = 'rejected' THEN e.amount ELSE 0 END) as rejected_amount,
  SUM(CASE WHEN e.status = 'paid' THEN e.amount ELSE 0 END) as paid_amount
FROM expenses e
LEFT JOIN user_profiles up ON e.user_id = up.id  -- FIXED: Correct relationship
GROUP BY e.user_id, up.email, up.full_name
ORDER BY total_amount DESC;

-- Grant permissions
GRANT SELECT ON user_expense_summary TO authenticated;
```

### Option 2: Complete Setup (If you want to ensure everything is correct)

Use the complete setup script I created: `database/setup_expenses_complete.sql`

This script will:

1. Ensure all tables exist with correct structure
2. Fix all relationships
3. Create proper indexes
4. Set up Row Level Security policies
5. Grant necessary permissions

## Files Modified

1. `database/fix_expense_user_relationship.sql` - Quick fix for the relationship
2. `database/setup_expenses_complete.sql` - Complete setup script
3. `database/schemas/expenses_schema.sql` - Fixed the view definition
4. `DATABASE_RELATIONSHIP_FIX.md` - This documentation

## How to Apply the Fix

### Step 1: Run the SQL Fix

1. Open your Supabase dashboard
2. Go to the SQL Editor
3. Copy and paste the SQL from `database/fix_expense_user_relationship.sql`
4. Execute the script

### Step 2: Verify the Fix

After running the script, you can verify it worked by running:

```sql
-- Test the relationship
SELECT
  e.id,
  e.title,
  e.amount,
  up.full_name,
  up.email
FROM expenses e
LEFT JOIN user_profiles up ON e.user_id = up.id
LIMIT 5;
```

### Step 3: Test the Application

1. Refresh your Next.js application
2. Navigate to the admin expenses tab
3. The error should be resolved and data should load properly

## Database Schema Relationships

The correct relationships are:

- `expenses.user_id` → `auth.users.id`
- `user_profiles.id` → `auth.users.id`
- `expenses.approved_by` → `auth.users.id`

Therefore, to join expenses with user profiles:

- `expenses.user_id = user_profiles.id` ✅ Correct
- `expenses.user_id = user_profiles.user_id` ❌ Incorrect (this column doesn't exist)

## Prevention

To prevent this issue in the future:

1. Always verify table relationships when creating views
2. Use the `information_schema` to check column names:
   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'user_profiles';
   ```
3. Test views after creation with sample data

## Troubleshooting

If you still see the error after applying the fix:

1. Check that the SQL script executed without errors
2. Verify the view was created: `SELECT * FROM user_expense_summary LIMIT 1;`
3. Clear your browser cache and restart your Next.js development server
4. Check the Supabase logs for any additional errors

The fix should resolve the "Could not find a relationship between 'expenses' and 'user_profiles' in the schema cache" error and allow your expense dashboard to load properly.
