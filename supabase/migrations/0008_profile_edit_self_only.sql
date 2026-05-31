-- =============================================================
-- 0008_profile_edit_self_only.sql
-- Tighten profile editing: a karyawan may edit ONLY their own
-- account (e.g. their nama), not other employees' profiles.
--
-- 0006 had loosened this with a blanket "Login edit profil" policy
-- (any authenticated user could update any profile). Drop it so we
-- fall back to the original 0002 policies:
--   * "User update profile sendiri"  -> auth.uid() = id  (own only)
--   * "Admin manage semua profile"   -> admin can edit anyone
-- The role/active privilege-escalation guard trigger stays in place.
-- =============================================================

drop policy if exists "Login edit profil" on public.profiles;
