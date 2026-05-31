-- 0019_app_config_gaji_dibayar.sql
-- Status "sudah dibayar" per slip gaji, disimpan sebagai map
-- { "<employee_id>::<YYYY-MM>": true } di singleton app_config (id = 1).
-- Dibaca/ditulis layar "Gaji Karyawan" untuk memindahkan slip ke Riwayat.
-- Aman & additive: default '{}' supaya baris lama tetap valid.
alter table public.app_config
  add column if not exists gaji_dibayar jsonb not null default '{}'::jsonb;
