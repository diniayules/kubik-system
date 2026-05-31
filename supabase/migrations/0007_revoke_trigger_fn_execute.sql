-- protect_profile_privileges is a trigger function only — never call it via RPC.
revoke execute on function public.protect_profile_privileges() from public, anon, authenticated;
