-- =============================================================
-- 0020_absen_cuti_libur.sql
-- Tambah jenis hari "cuti" & "libur" pada kartu absensi.
--
-- Sebelumnya cuti DITEBAK dari ketiadaan absensi sehingga hari libur / lupa
-- isi ikut terhitung sebagai cuti berlebih. Sekarang cuti dicatat EKSPLISIT
-- lewat tombol di pemilih shift:
--   - 'cuti'  : cuti pribadi (jatah 2 hari/bulan, lebih dari itu memotong gaji)
--   - 'libur' : studio tutup / libur bersama (tidak pernah memotong gaji)
--
-- Kolom `shift` (text) sekarang menerima 5 nilai. Hari cuti/libur disimpan
-- dengan events = '[]' (tidak ada jam kerja).
-- =============================================================

alter table public.absen_records
  drop constraint if exists absen_records_shift_check;

alter table public.absen_records
  add constraint absen_records_shift_check
    check (shift in ('pagi', 'sore', 'full', 'cuti', 'libur'));
