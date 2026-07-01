-- 0036_setoran_rekening.sql
-- Riwayat setoran uang tunai dari dompet/laci ke rekening bank, untuk
-- rekonsiliasi rangkuman akhir bulan (admin). Income tunai yang sudah disetor
-- tidak lagi dianggap ada di dompet, melainkan pindah ke sisi rekening:
--   saldo dompet diharapkan   = income tunai − Σ setoran (bulan itu)
--   saldo rekening diharapkan = income QRIS  + Σ setoran (bulan itu)
--
-- Bentuk JSONB array:
--   [{ "id": "...", "tanggal": "2026-07-05", "jumlah": 2000000, "catatan": "setor BCA" }, ...]
--
-- Aman & additive: default '[]' supaya baris lama tetap valid.
alter table public.app_config
  add column if not exists setoran_rekening jsonb not null default '[]'::jsonb;
