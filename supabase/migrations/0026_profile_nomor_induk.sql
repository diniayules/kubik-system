-- =============================================================
-- 0026_profile_nomor_induk.sql
-- Nomor Induk Karyawan (NIK internal Kubik). HANYA admin yang boleh
-- mengisi/mengubah di UI; karyawan melihatnya read-only. Disimpan di
-- profiles, jadi tetap dilindungi RLS profile (self/admin).
-- =============================================================
alter table public.profiles
  add column if not exists nomor_induk text not null default '';
