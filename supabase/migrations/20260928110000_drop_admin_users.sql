-- supabase/migrations/20260928110000_drop_admin_users.sql
-- The admin app's separate bcrypt login is retired (admin-merge spec
-- 2026-09-28). Admin identity is auth.users.app_metadata.role only; nothing
-- reads admin_users after the merge. APPLY THIS ONLY AT CUTOVER STEP 4 of the
-- runbook (after the merged pipeline is verified in production).
drop table if exists public.admin_users cascade;
