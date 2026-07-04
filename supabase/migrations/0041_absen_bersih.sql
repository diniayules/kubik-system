-- =============================================================
-- 0041_absen_bersih.sql
-- Tambah jenis hari "bersih" (General Cleaning) pada kartu absensi.
--
-- Sebulan sekali ada general cleaning: operator yang SEDANG TIDAK shift ikut
-- datang bersih-bersih. Kehadiran mereka ingin dicatat sebagai bukti ikut serta,
-- TAPI tidak menambah gaji karena sudah termasuk di gaji bulanan. Ditandai
-- eksplisit lewat tombol di pemilih shift (pola sama seperti 'cuti'/'libur'):
--   - 'bersih' : ikut general cleaning · tidak dibayar & tidak dipotong.
--
-- Kolom `shift` (text) sekarang menerima 6 nilai. Hari bersih disimpan dengan
-- events = '[]' (cukup ditandai hadir, tanpa jam masuk/pulang).
-- =============================================================

alter table public.absen_records
  drop constraint if exists absen_records_shift_check;

alter table public.absen_records
  add constraint absen_records_shift_check
    check (shift in ('pagi', 'sore', 'full', 'cuti', 'libur', 'bersih'));
