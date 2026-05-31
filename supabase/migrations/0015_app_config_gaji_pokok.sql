-- 0015_app_config_gaji_pokok.sql
-- Gaji pokok bulanan per karyawan, disimpan sebagai map { employee_id: rupiah }
-- di singleton app_config (id = 1). Dibaca/ditulis layar "Gaji Karyawan".
-- Aman & additive: default '{}' supaya baris lama tetap valid.
alter table public.app_config
  add column if not exists gaji_pokok jsonb not null default '{}'::jsonb;
