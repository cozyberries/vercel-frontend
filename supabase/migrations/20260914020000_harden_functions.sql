-- Pin search_path on the 26 SECURITY INVOKER functions that lacked one, and
-- revoke RPC access to the 6 SECURITY DEFINER helpers.
--
-- Why 'public' rather than '': all 26 are SECURITY INVOKER, so a mutable
-- search_path is not an escalation vector, and their bodies reference public
-- tables unqualified. Pinning makes resolution immutable without rewriting 26
-- bodies. New SECURITY DEFINER functions must use `SET search_path = ''` with
-- fully qualified references -- see CLAUDE.md.

begin;

alter function public.claim_webhook_events(p_batch_size integer, p_lease_threshold timestamp with time zone, p_now timestamp with time zone) set search_path = 'public';
alter function public.ensure_single_default_address() set search_path = 'public';
alter function public.generate_category_slug(category_name text) set search_path = 'public';
alter function public.generate_order_number() set search_path = 'public';
alter function public.generate_payment_reference() set search_path = 'public';
alter function public.get_active_expense_categories() set search_path = 'public';
alter function public.set_notifications_updated_at() set search_path = 'public';
alter function public.set_order_number() set search_path = 'public';
alter function public.set_payment_reference() set search_path = 'public';
alter function public.set_webhook_events_updated_at() set search_path = 'public';
alter function public.sync_expense_category() set search_path = 'public';
alter function public.sync_product_color_slugs() set search_path = 'public';
alter function public.sync_product_size_slugs() set search_path = 'public';
alter function public.update_addresses_updated_at_column() set search_path = 'public';
alter function public.update_admin_users_updated_at() set search_path = 'public';
alter function public.update_expense_categories_updated_at() set search_path = 'public';
alter function public.update_order_status_on_payment() set search_path = 'public';
alter function public.update_payment_timestamps() set search_path = 'public';
alter function public.update_profiles_updated_at_column() set search_path = 'public';
alter function public.update_updated_at_column() set search_path = 'public';
alter function public.update_user_profile_updated_at() set search_path = 'public';

-- Remove these from the public REST surface. Every legitimate caller is
-- server-side and uses service_role, which is unaffected.
--
-- `from public` is REQUIRED and is not redundant. These functions carry a
-- separate grant to the PUBLIC pseudo-role (the `=X/postgres` entry in proacl)
-- that every role inherits. Revoking from anon and authenticated alone leaves
-- that grant in place and the function stays callable -- verified: the revoke
-- is a no-op without this. service_role and postgres hold explicit grants and
-- keep EXECUTE.
revoke all on function public.catalog_change_notify()      from public, anon, authenticated;
revoke all on function public.check_user_is_admin()        from public, anon, authenticated;
revoke all on function public.check_user_is_super_admin()  from public, anon, authenticated;
revoke all on function public.get_user_role(user_id uuid)  from public, anon, authenticated;
revoke all on function public.is_admin(user_id uuid)       from public, anon, authenticated;
revoke all on function public.is_super_admin(user_id uuid) from public, anon, authenticated;

commit;
