-- 0022_laporan_pembayaran_via.sql
-- Mencatat pembayaran yang diterima per laporan income dipecah berdasarkan
-- metode: tunai dan QRIS (dalam Rupiah). Murni informatif — tidak memengaruhi
-- perhitungan total income maupun bonus karyawan. Keduanya default 0 supaya
-- laporan lama (sebelum fitur ini) tetap valid. Idempotent, aman dijalankan ulang.

alter table public.laporan_income
  add column if not exists tunai int not null default 0
    check (tunai >= 0),
  add column if not exists qris int not null default 0
    check (qris >= 0);
