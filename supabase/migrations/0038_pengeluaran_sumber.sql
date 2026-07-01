-- 0038_pengeluaran_sumber.sql
-- Sumber dana tiap pengeluaran: 'cash' (dompet/laci) atau 'rekening' (bank).
-- Dipakai rekonsiliasi rangkuman akhir bulan agar saldo yang tepat berkurang:
--   dompet   berkurang oleh pengeluaran sumber 'cash'
--   rekening berkurang oleh pengeluaran sumber 'rekening'
--
-- Aman & additive: default 'cash' supaya baris lama tetap valid (pengeluaran
-- lama dianggap dibayar tunai). CHECK membatasi ke dua nilai yang sah.
alter table public.pengeluaran
  add column if not exists sumber text not null default 'cash'
  check (sumber in ('cash', 'rekening'));
