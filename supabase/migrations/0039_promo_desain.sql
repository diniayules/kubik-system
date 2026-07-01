-- =============================================================
-- 0036_promo_desain.sql · Desain promo untuk sosial media
--
-- Kolom `desain` menyimpan gambar desain promo (data URL JPEG, di-resize di
-- client agar ukuran wajar — pola sama seperti foto profil karyawan). Admin
-- mengunggah desain; karyawan yang bisa melihat promo (comingsoon/berjalan)
-- dapat mengunduhnya untuk diposting ke sosial media. Visibilitas mengikuti
-- RLS baris promo (0035) — desain draft ikut tersembunyi dari karyawan.
-- =============================================================

alter table public.promo_programs
  add column if not exists desain text;
