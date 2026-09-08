-- =============================================================
-- 0048_penilaian_owner_eskalasi.sql · Kelompok KPI "Kepemimpinan"
-- -------------------------------------------------------------
-- Scorecard manajer sekarang berbobot lima kelompok, dan kelompok
-- Kepemimpinan (10%) butuh dua angka yang TIDAK ADA di data operasional:
--
--  1. penilaian_owner  — penilaian kualitatif owner 1-5 per periode
--                        `YYYY-MM`, diisi manual saat evaluasi bulanan.
--                        { "2026-09": { "nilai": 4, "catatan": "..." } }
--
--  2. eskalasi_owner   — log "item Butuh Tindakan ini ditutup oleh siapa".
--                        Dari sini lahir KPI kemandirian: berapa persen
--                        antrean yang beres tanpa owner turun tangan.
--                        [{ "id": "...", "tanggal": "2026-09-07",
--                           "label": "Leads menunggu di-follow-up",
--                           "oleh": "owner", "catatan": "..." }]
--
-- Keduanya menempel di `app_config` mengikuti pola `target_bulanan`
-- (0043) & `saldo_aktual` (0034): volumenya kecil, selalu dibaca
-- bersama-sama, dan hak aksesnya sudah benar — `app_config` boleh
-- DIBACA semua user login dan hanya boleh DIUBAH pengelola.
--
-- Catatan hak akses: pembatasan "hanya owner yang boleh menilai"
-- ditegakkan di layar, sama seperti target bulanan. Manajer memang
-- perlu MEMBACA nilainya sendiri, dan `eskalasi_owner` justru ditulis
-- manajer setiap kali ia menutup antrean.
-- =============================================================

alter table public.app_config
  add column if not exists penilaian_owner jsonb not null default '{}'::jsonb,
  add column if not exists eskalasi_owner  jsonb not null default '[]'::jsonb;
