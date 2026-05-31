-- 0013_laporan_pemakaian_stok.sql
-- Menghubungkan laporan income dengan inventaris. Tiap laporan menyimpan:
--   - kertas_id        : jenis kertas yang dipotong oleh tiket + tambahan cetak
--                        (upgrade Poster / Crack n Share dipotong terpisah lewat
--                         pencocokan nama di sisi aplikasi).
--   - amplop_terpakai  : jumlah amplop yang dipotong (default = jumlah tiket,
--                        tapi bisa diisi lebih kalau hari itu pakai >1 per tiket).
-- Keduanya nullable supaya laporan lama (sebelum fitur ini) tetap valid dan
-- dianggap tidak memotong stok.

alter table public.laporan_income
  add column if not exists kertas_id uuid
    references public.stok_kertas(id) on delete set null,
  add column if not exists amplop_terpakai int
    check (amplop_terpakai is null or amplop_terpakai >= 0);
