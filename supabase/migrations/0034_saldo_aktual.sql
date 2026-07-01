-- 0034_saldo_aktual.sql
-- Rekonsiliasi saldo aktual per bulan untuk rangkuman akhir bulan (admin).
-- Menyimpan nominal uang yang BENAR-BENAR ada di dompet cash & rekening bank,
-- supaya bisa dicek balance dengan income tunai (→ dompet) & QRIS (→ rekening).
--
-- Bentuk map keyed per bulan (YYYY-MM):
--   { "2026-07": { "dompet": 1500000, "rekening": 3200000 }, ... }
--
-- Aman & additive: default '{}' supaya baris lama tetap valid dan app versi
-- lama tidak terpengaruh.
alter table public.app_config
  add column if not exists saldo_aktual jsonb not null default '{}'::jsonb;
