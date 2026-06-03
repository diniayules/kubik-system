-- 0023_laporan_uang_kasir.sql
-- Rekonsiliasi uang tunai fisik di laci kasir per laporan income (Rupiah):
--   - uang_besar + uang_kecil  -> SEHARUSNYA balance dengan kolom `tunai`
--                                 (pembayaran tunai yang diterima). Dipakai untuk
--                                 mengecek isi laci; tidak memengaruhi total income.
--   - total_uang_besar         -> murni catatan, TIDAK memengaruhi nilai apa pun.
-- Semua default 0 supaya laporan lama tetap valid. Idempotent, aman diulang.

alter table public.laporan_income
  add column if not exists uang_besar int not null default 0
    check (uang_besar >= 0),
  add column if not exists uang_kecil int not null default 0
    check (uang_kecil >= 0),
  add column if not exists total_uang_besar int not null default 0
    check (total_uang_besar >= 0);
