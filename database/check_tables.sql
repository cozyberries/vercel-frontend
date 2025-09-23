-- Check what tables currently exist in the database
-- Run this in your Supabase SQL editor first

-- Check required tables status
SELECT 'TABLE STATUS CHECK' as info, '' as status
UNION ALL
SELECT '==================' as info, '==========' as status
UNION ALL
SELECT 'auth.users' as info, 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') 
            THEN '✅ EXISTS' 
            ELSE '❌ MISSING' 
       END as status
UNION ALL
SELECT 'user_profiles' as info,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') 
            THEN '✅ EXISTS' 
            ELSE '❌ MISSING' 
       END as status
UNION ALL
SELECT 'expenses' as info,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expenses') 
            THEN '✅ EXISTS' 
            ELSE '❌ MISSING' 
       END as status
UNION ALL
SELECT 'expense_attachments' as info,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expense_attachments') 
            THEN '✅ EXISTS' 
            ELSE '❌ MISSING' 
       END as status
UNION ALL
SELECT '' as info, '' as status
UNION ALL
SELECT 'ALL PUBLIC TABLES:' as info, '' as status
UNION ALL
SELECT '==================' as info, '==========' as status
UNION ALL
SELECT table_name as info, table_type as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY info;
