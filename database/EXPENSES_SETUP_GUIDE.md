# Expenses Management Schema Setup Guide

## Quick Setup Instructions

### Step 1: Check Your Current Database Status
1. Open your Supabase project dashboard
2. Go to the SQL Editor
3. Run the contents of `check_tables.sql` to see what tables you currently have

### Step 2: Choose Your Setup Method

#### Option A: Full Setup (Recommended)
If you have the `user_profiles` table already created:
1. Run `create_expenses_schema_fixed.sql` in the Supabase SQL Editor
2. This includes full admin functionality and analytics views

#### Option B: Minimal Setup
If you don't have `user_profiles` table yet:
1. Run `create_expenses_minimal.sql` in the Supabase SQL Editor
2. This creates basic expense functionality without admin features
3. You can upgrade later by running the user_profiles schema and then the full expenses schema

#### Option C: Complete Setup from Scratch
If you're starting fresh:
1. First run: `database/schemas/user_profiles_schema.sql`
2. Then run: `create_expenses_schema_fixed.sql`

### Step 3: Verify Installation
Run this query to verify your tables were created:

```sql
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('expenses', 'expense_attachments', 'user_profiles')
ORDER BY table_name;
```

You should see:
- ✅ `expenses` table
- ✅ `expense_attachments` table  
- ✅ `user_profiles` table (if you chose full setup)

### Step 4: Test the System
1. Start your development server: `npm run dev`
2. Navigate to `/admin/expenses` (you'll need admin access)
3. Try creating a test expense

## Troubleshooting Common Issues

### Error: "relation user_profiles does not exist"
**Solution**: You need to create the user_profiles table first.
1. Run `database/schemas/user_profiles_schema.sql`
2. Then run `create_expenses_schema_fixed.sql`

### Error: "column user_id does not exist"
**Solution**: This was the original issue - it's fixed in the new schema files.
- The API endpoints have been updated to use simple queries
- The schema properly references auth.users(id)

### Error: "permission denied for table expenses"
**Solution**: RLS policies might not be set up correctly.
1. Make sure you're logged in as an admin user
2. Check that the user_profiles table has your user marked as 'admin' or 'super_admin'

### Error: "function gen_random_uuid() does not exist"
**Solution**: Enable the uuid-ossp extension in Supabase:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

## Schema Features

### Tables Created
- **expenses**: Main expense tracking table
- **expense_attachments**: File attachments for receipts

### Indexes Created
- Performance indexes on commonly queried fields
- GIN index for tags array search

### RLS Policies
- Users can manage their own expenses
- Admins can manage all expenses (if user_profiles exists)
- Secure attachment handling

### Views Created (Full Setup Only)
- **monthly_expense_summary**: Monthly expense analytics
- **category_expense_summary**: Category-based reporting  
- **user_expense_summary**: User-wise expense tracking

## Next Steps After Setup
1. Test the expense management interface
2. Create some test expenses
3. Verify admin approval workflow
4. Check analytics views (if using full setup)

## Files in This Directory
- `check_tables.sql` - Check current database status
- `create_expenses_schema_fixed.sql` - Full setup with all features
- `create_expenses_minimal.sql` - Basic setup without dependencies
- `EXPENSES_SETUP_GUIDE.md` - This guide

Choose the appropriate SQL file based on your current database setup!
