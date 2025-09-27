-- Comprehensive database check for reviews functionality
-- Run this in your Supabase SQL editor to check if all required tables exist

-- Check all required tables for reviews functionality
SELECT 'REVIEWS SYSTEM CHECK' as info, '' as status
UNION ALL
SELECT '====================' as info, '==========' as status
UNION ALL
SELECT 'products' as info,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') 
            THEN '✅ EXISTS' 
            ELSE '❌ MISSING' 
       END as status
UNION ALL
SELECT 'orders' as info,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') 
            THEN '✅ EXISTS' 
            ELSE '❌ MISSING' 
       END as status
UNION ALL
SELECT 'reviews' as info,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reviews') 
            THEN '✅ EXISTS' 
            ELSE '❌ MISSING' 
       END as status
UNION ALL
SELECT 'review_images' as info,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'review_images') 
            THEN '✅ EXISTS' 
            ELSE '❌ MISSING' 
       END as status
UNION ALL
SELECT 'review_votes' as info,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'review_votes') 
            THEN '✅ EXISTS' 
            ELSE '❌ MISSING' 
       END as status
UNION ALL
SELECT '' as info, '' as status
UNION ALL
SELECT 'FUNCTIONS CHECK:' as info, '' as status
UNION ALL
SELECT '================' as info, '==========' as status
UNION ALL
SELECT 'calculate_product_rating' as info,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'calculate_product_rating') 
            THEN '✅ EXISTS' 
            ELSE '❌ MISSING' 
       END as status
UNION ALL
SELECT 'can_user_review_product' as info,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'can_user_review_product') 
            THEN '✅ EXISTS' 
            ELSE '❌ MISSING' 
       END as status
UNION ALL
SELECT '' as info, '' as status
UNION ALL
SELECT 'SAMPLE DATA CHECK:' as info, '' as status
UNION ALL
SELECT '==================' as info, '==========' as status
UNION ALL
SELECT 'Products count' as info, 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products')
            THEN (SELECT COUNT(*)::text FROM products)
            ELSE 'N/A'
       END as status
UNION ALL
SELECT 'Reviews count' as info, 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reviews')
            THEN (SELECT COUNT(*)::text FROM reviews)
            ELSE 'N/A'
       END as status;
