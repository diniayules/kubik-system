-- =============================================================
-- 0027_profile_no_hp.sql
-- Nomor handphone karyawan — bisa lebih dari satu (mis. nomor utama +
-- darurat). Disimpan sebagai array JSON string di profiles, jadi tetap
-- ikut RLS profil (karyawan edit sendiri, admin semua).
-- =============================================================
alter table public.profiles
  add column if not exists no_hp jsonb not null default '[]'::jsonb;
