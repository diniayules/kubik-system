-- 0033_closing_checklist.sql
-- Fitur "closing checklist": sebelum clock out di malam hari, karyawan wajib
-- mencentang semua tugas closing (mematikan lampu studio, lighting, mengisi
-- laporan keuangan, kirim laporan via WhatsApp, dll.) baru bisa mencatat pulang.
--
-- Dua kolom additive:
--  1. app_config.closing_checklist  = DAFTAR task yang dikonfigurasi admin.
--     Bentuk: [{ "id": "...", "label": "Mematikan lampu studio" }, ...]
--  2. absen_records.checklist_pulang = BUKTI task yang dicentang saat pulang
--     (audit trail per hari). Bentuk:
--     [{ "id": "...", "label": "...", "waktu": "<ISO>" }, ...]
--
-- Aman & additive: default '[]' / null supaya baris lama tetap valid dan app
-- versi lama tidak terpengaruh.

alter table public.app_config
  add column if not exists closing_checklist jsonb not null default '[]'::jsonb;

alter table public.absen_records
  add column if not exists checklist_pulang jsonb;
