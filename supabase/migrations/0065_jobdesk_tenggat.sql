-- =============================================================
-- 0065_jobdesk_tenggat.sql · Tenggat per baris jobdesk manajer
-- -------------------------------------------------------------
-- TIDAK ADA PERUBAHAN SKEMA. `app_config.jobdesk_manajer` (0054) sudah jsonb;
-- yang berubah adalah BENTUK isinya — tiap item boleh membawa `tenggat`:
--
--   { "2026-09": [
--       { "id": "...", "label": "Rekap penjualan mingguan ke owner",
--         "tenggat": "2026-09-07",
--         "selesaiPada": "2026-09-07T10:12:00.000Z",
--         "selesaiOleh": "<uuid profil>" },
--       { "id": "...", "label": "Cek stok kertas tiap Senin" }
--     ] }
--
-- Migrasi ini ada supaya perubahan bentuk itu ikut tercatat di jejak yang
-- sama dengan perubahan skema — pembaca yang menyusuri folder ini tidak akan
-- menemukan `tenggat` di mana pun kalau file ini tidak ada.
--
-- 0054 menulis bahwa tenggat per tanggal "biaya yang tidak sepadan" dan
-- cukup diwakili boolean `darurat`. Yang membatalkan alasan itu: daftar
-- jobdesk ternyata dipakai sebagai antrean kerja harian manajer, bukan cuma
-- daftar periksa akhir bulan — dan antrean butuh urutan yang tidak perlu
-- ditafsirkan. `darurat` tetap ada, tapi artinya menyempit jadi "menyela
-- antrean", bukan lagi satu-satunya cara menyatakan mendesak.
--
-- TIDAK ADA BACKFILL, dan memang tidak boleh ada: item tanpa `tenggat`
-- dibaca sebagai "tenggat akhir periode" — persis arti yang berlaku sebelum
-- kolom ini ada. Menulis tanggal ke baris lama justru memalsukan penetapan
-- yang tidak pernah owner buat.
-- =============================================================

comment on column public.app_config.jobdesk_manajer is
  'Jobdesk manajer per periode YYYY-MM (0054). Tiap item: '
  '{ id, label, tenggat?: YYYY-MM-DD (kosong = akhir periode, 0065), '
  'darurat?, selesaiPada?, selesaiOleh? }. Disusun owner, dicentang manajer.';
