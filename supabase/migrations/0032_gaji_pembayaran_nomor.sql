-- 0032_gaji_pembayaran_nomor.sql
-- Tambah kolom isian manual untuk nomor rekening / nomor e-wallet karyawan,
-- dipasangkan dengan `metode` di tiap baris (karyawan, periode). Karyawan yang
-- mengisi sendiri di slipnya (RLS per-orang sudah diatur di 0031). Additive &
-- aman: default '' supaya baris lama tetap valid.
alter table public.gaji_pembayaran_via
  add column if not exists nomor text not null default '';
