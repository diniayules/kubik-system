-- =============================================================
-- 0004_harden_functions.sql · address Supabase security advisor warnings
--   * pin search_path on SECURITY DEFINER / trigger functions
--   * revoke RPC EXECUTE on the trigger fn (only the trigger needs it)
-- =============================================================

-- Pin search_path (functions already schema-qualify their references)
alter function public.handle_new_user()  set search_path = '';
alter function public.touch_updated_at() set search_path = '';
alter function public.is_admin()         set search_path = '';

-- handle_new_user is a trigger function only — it must never be callable via the REST RPC surface
revoke execute on function public.handle_new_user() from anon, authenticated;

-- is_admin() is referenced by RLS policies (authenticated needs it); only anon has no use for it
revoke execute on function public.is_admin() from anon;
