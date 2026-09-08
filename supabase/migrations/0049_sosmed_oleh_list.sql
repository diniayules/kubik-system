-- =============================================================
-- 0049_sosmed_oleh_list.sql · Sosmed dikerjakan lebih dari satu orang
-- -------------------------------------------------------------
-- `sosmed_harian.oleh` hanya menampung SATU profil, padahal satu hari
-- sering dikerjakan berdua (yang posting bukan yang membalas komentar),
-- dan kadang oleh orang yang tidak punya akun sama sekali — freelancer
-- desain, anak magang, atau owner sendiri.
--
-- `oleh_list` menampung keduanya: array JSON berisi id profil ATAU nama
-- bebas. Sengaja jsonb, bukan uuid[]: begitu nama bebas ikut dicatat,
-- kolom ber-foreign-key justru menolak data yang sah.
--
-- `oleh` DIPERTAHANKAN dan tetap diisi entri profil pertama supaya data
-- lama tetap terbaca dan laporan mana pun yang masih membacanya tidak
-- pecah. Aplikasi membaca `oleh_list` lebih dulu, lalu jatuh ke `oleh`.
-- =============================================================

alter table public.sosmed_harian
  add column if not exists oleh_list jsonb not null default '[]'::jsonb;

-- Isi awal dari kolom lama supaya baris yang sudah ada langsung ikut
-- terhitung sebagai satu pengerja.
update public.sosmed_harian
   set oleh_list = jsonb_build_array(oleh::text)
 where oleh is not null
   and (oleh_list is null or jsonb_array_length(oleh_list) = 0);
