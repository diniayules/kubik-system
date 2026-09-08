-- =============================================================
-- 0050_absen_pantau.sql
-- Tambah jenis hari "pantau" (Hadir di Studio) pada kartu absensi.
--
-- Manajer (dan owner) juga ingin mengisi presensi, TAPI bukan sebagai jam
-- kerja berbayar: mereka digaji bulanan, bukan per jam. Absennya murni
-- penanda "kapan ia ada di studio" untuk mengecek karyawan, operasional,
-- dan lain-lain. Karena itu:
--   - 'pantau' cukup punya 2 event: masuk (datang) & pulang (selesai),
--   - tidak punya jadwal → tidak ada hitungan telat/lembur/jam kerja bersih,
--   - dilewati di perhitungan slip gaji (lihat src/gaji.ts).
--
-- Kolom `shift` (text) sekarang menerima 7 nilai. RLS tidak berubah:
-- policy "Karyawan catat absen sendiri" (0002) sudah mengizinkan tiap akun
-- menulis barisnya sendiri, termasuk akun pengelola.
-- =============================================================

alter table public.absen_records
  drop constraint if exists absen_records_shift_check;

alter table public.absen_records
  add constraint absen_records_shift_check
    check (shift in ('pagi', 'sore', 'full', 'cuti', 'libur', 'bersih', 'pantau'));
