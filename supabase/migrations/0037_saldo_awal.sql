-- 0037_saldo_awal.sql
-- Saldo awal (opening balance) dompet & rekening saat sistem MULAI mencatat —
-- kas dari penjualan sebelum sistem dibangun yang sudah mengendap di rekening/
-- dompet. Dipakai rekonsiliasi rangkuman yang dihitung KUMULATIF:
--   saldo rekening seharusnya = saldo_awal.rekening + Σ QRIS + Σ setoran (s/d bln)
--   saldo dompet   seharusnya = saldo_awal.dompet   + Σ tunai − Σ setoran (s/d bln)
--
-- Bentuk JSONB objek: { "dompet": 500000, "rekening": 12000000 }
--
-- Aman & additive: default '{}' (dianggap 0/0) supaya baris lama tetap valid.
alter table public.app_config
  add column if not exists saldo_awal jsonb not null default '{}'::jsonb;
