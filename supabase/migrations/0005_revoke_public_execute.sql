-- =============================================================
-- 0005_revoke_public_execute.sql
-- Functions grant EXECUTE to PUBLIC by default; revoke that, then
-- grant back only what is genuinely needed.
--   * handle_new_user: trigger-only, invoked by the trigger mechanism
--     (no role EXECUTE grant required) -> revoke from everyone.
--   * is_admin: referenced by RLS policies under the `authenticated`
--     role -> keep only that grant.
--
-- The remaining advisor WARN ("authenticated can execute is_admin") is
-- expected: RLS policies invoke is_admin() as the authenticated role,
-- and it only reveals whether the caller themselves is an admin.
-- =============================================================

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.is_admin()        from public;

grant execute on function public.is_admin() to authenticated;
