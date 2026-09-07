-- =============================================================
-- 0045_revoke_protect_absen_status.sql · Tutup celah RPC lama
-- -------------------------------------------------------------
-- `protect_absen_status()` (migration 0018) adalah fungsi TRIGGER, tapi
-- tidak pernah di-revoke seperti saudaranya. Akibatnya ia ikut terekspos
-- sebagai endpoint `/rest/v1/rpc/protect_absen_status` dan bisa dipanggil
-- role `anon` — persis temuan linter `anon_security_definer_function_executable`.
--
-- Pola yang benar sudah dipakai di 0007 (protect_profile_privileges) dan
-- 0035 (protect_promo_status); ini menyamakan 0018 dengan keduanya.
-- Trigger tetap berjalan seperti biasa: trigger dijalankan oleh Postgres
-- atas nama pemilik tabel, bukan lewat hak EXECUTE si pemanggil.
-- =============================================================

revoke execute on function public.protect_absen_status() from public, anon, authenticated;
