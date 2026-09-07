-- =============================================================
-- 0043_target_bulanan.sql · Target & KPI bulanan manajer
-- -------------------------------------------------------------
-- Dashboard Manajemen sudah menampilkan ANGKA (omzet, tiket, event,
-- kepatuhan checklist), tapi belum punya PEMBANDING: berapa yang
-- seharusnya dicapai bulan ini. Tanpa itu scorecard tidak bisa
-- menyimpulkan "tercapai / tertinggal".
--
-- Targetnya disimpan di `app_config` (bukan tabel sendiri) mengikuti
-- pola `gaji_pokok`, `gaji_dibayar`, dan `saldo_aktual`: satu objek
-- JSON dengan key periode `YYYY-MM`, mis.
--   { "2026-09": { "omzet": 40000000, "tiket": 600, ... } }
-- Key tidak ada = target bulan itu belum diisi; aplikasi lalu memakai
-- saran otomatis (2x rata-rata 3 bulan terakhir) sampai owner
-- menyetujui atau menimpanya.
--
-- Hak akses: `app_config` sudah readable oleh semua user login sejak
-- 0002 dan hanya bisa DIUBAH pengelola. Pembatasan "hanya owner yang
-- boleh mengatur target" ditegakkan di layar (pola yang sama dipakai
-- gaji & kas) — manajer tetap perlu MEMBACA targetnya sendiri.
-- =============================================================

alter table public.app_config
  add column if not exists target_bulanan jsonb not null default '{}'::jsonb;
